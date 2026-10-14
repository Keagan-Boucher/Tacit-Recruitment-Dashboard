import { useCallback, useEffect, useRef, useState } from "react";
import { collection, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Draft } from "./capture";

// The recruiter's words come first: every keystroke lands in a local draft before anything else, the note is created
// on the first keystroke, later edits are saved after a short pause, and a failed or silent save is shown and retried
// until the server confirms. Text is never cleared by a failure.

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 600;
const RETRY_MS = 4000;
/** Firestore queues writes while offline and never rejects them, so a write with no answer by now counts as not saved. */
const ACK_TIMEOUT_MS = 8000;

const prefix = (candidateId: string) => `tacit.noteDraft.${candidateId}.`;

const parse = (raw: string | null): Draft | null => {
  try {
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    return d && typeof d.text === "string" && typeof d.at === "number" ? d : null;
  } catch {
    return null;
  }
};

/** The unconfirmed draft of one note, or, with no id, the newest unconfirmed draft for this candidate. */
export function readDraft(candidateId: string, noteId?: string | null): Draft | null {
  try {
    if (noteId) return parse(localStorage.getItem(prefix(candidateId) + noteId));
    let best: Draft | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix(candidateId))) {
        const d = parse(localStorage.getItem(k));
        if (d && (!best || d.at > best.at)) best = d;
      }
    }
    return best;
  } catch {
    return null;
  }
}
function writeDraft(candidateId: string, d: Draft & { noteId: string }) {
  try {
    localStorage.setItem(prefix(candidateId) + d.noteId, JSON.stringify(d));
  } catch {
    /* storage blocked or full: the server copy is still the main one */
  }
}
function clearDraft(candidateId: string, noteId: string) {
  try {
    localStorage.removeItem(prefix(candidateId) + noteId);
  } catch {
    /* nothing to clear */
  }
}

type Opts = {
  candidateId: string;
  uid: string;
  /** Note being resumed (from ?note= or an unconfirmed draft), or null for a brand new one. */
  noteId: string | null;
  /** Whether that note already exists on the server. */
  exists: boolean;
  /** The text the screen opened with; `inSync` says it equals the server copy. */
  text: string;
  inSync: boolean;
  guideVersion: number | undefined;
  /** Dev ?state= overrides: nothing is written, nothing is stored. */
  enabled: boolean;
  /** Called once, synchronously inside the first keystroke, with the new note's id. */
  onCreated: (id: string) => void;
};

export function useNoteSaver(o: Opts) {
  const { candidateId, uid, guideVersion, enabled } = o;
  const [noteId, setNoteId] = useState(o.noteId);
  const [status, setStatus] = useState<SaveStatus>(o.inSync ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const textRef = useRef(o.text);
  const ackedRef = useRef<string | null>(o.inSync ? o.text : null);
  const idRef = useRef(o.noteId);
  const createdRef = useRef(o.exists);
  const [capturedAt, setCapturedAt] = useState(() => new Date());
  const capturedRef = useRef(capturedAt);
  const attemptRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const live = useRef({ onCreated: o.onCreated, guideVersion });
  useEffect(() => {
    live.current = { onCreated: o.onCreated, guideVersion };
  });

  const write = useCallback(
    async (text: string) => {
      const now = new Date();
      const ref = doc(db, "interviewNotes", idRef.current!);
      if (!createdRef.current) {
        createdRef.current = true;
        try {
          await setDoc(ref, {
            ownerUid: uid,
            candidateId,
            rawText: text,
            capturedAt: capturedRef.current,
            interpretStatus: "pending",
            ...(live.current.guideVersion !== undefined ? { questionGuideVersion: live.current.guideVersion } : {}),
            createdAt: now,
            updatedAt: now,
          });
        } catch (e) {
          createdRef.current = false; // so the retry creates it instead of updating nothing
          throw e;
        }
        // the profile's "last interview" follows the first save of a note; best effort, the note itself is what matters
        updateDoc(doc(db, "candidates", candidateId), { lastInterviewAt: capturedRef.current, updatedAt: now }).catch(() => {});
      } else {
        await updateDoc(ref, { rawText: text, updatedAt: now });
      }
    },
    [uid, candidateId],
  );

  const schedule = useCallback((ms: number, fn: () => void) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fn, ms);
  }, []);

  const attempt = useCallback((): Promise<boolean> => {
    const text = textRef.current;
    if (!idRef.current || text === ackedRef.current) {
      setStatus(idRef.current ? "saved" : "idle");
      return Promise.resolve(true);
    }
    setStatus("saving");
    const sent = write(text).then(
      () => {
        ackedRef.current = text;
        if (textRef.current === text) {
          clearDraft(candidateId, idRef.current!);
          setSavedAt(new Date());
          setStatus("saved");
        }
        return true;
      },
      () => false,
    );
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), ACK_TIMEOUT_MS));
    return Promise.race([sent, timeout]).then((ok) => {
      if (!ok && textRef.current !== ackedRef.current) {
        setStatus("error");
        schedule(RETRY_MS, () => void attemptRef.current());
      }
      return ok || textRef.current === ackedRef.current;
    });
  }, [write, candidateId, schedule]);
  useEffect(() => {
    attemptRef.current = attempt;
  }, [attempt]);

  const change = useCallback(
    (text: string) => {
      if (!enabled) return;
      textRef.current = text;
      const first = !idRef.current;
      if (first) {
        idRef.current = doc(collection(db, "interviewNotes")).id;
        capturedRef.current = new Date();
        setCapturedAt(capturedRef.current);
        setNoteId(idRef.current);
        live.current.onCreated(idRef.current);
      }
      writeDraft(candidateId, { noteId: idRef.current!, text, at: Date.now() });
      if (first) void attempt();
      else schedule(DEBOUNCE_MS, () => void attempt());
    },
    [enabled, candidateId, attempt, schedule],
  );

  /** Saves now. Resolves true once the server has this exact text. */
  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    return attempt();
  }, [attempt]);

  // A draft restored at load goes to the server without waiting for another keystroke.
  useEffect(() => {
    if (enabled && o.noteId && !o.inSync) void attempt();
    // once, at mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back online: try straight away. Closing the tab with unsaved text asks first.
  useEffect(() => {
    if (!enabled) return;
    const retry = () => {
      if (textRef.current !== ackedRef.current) void attempt();
    };
    const guard = (e: BeforeUnloadEvent) => {
      if (textRef.current !== ackedRef.current) e.preventDefault();
    };
    window.addEventListener("online", retry);
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("beforeunload", guard);
      clearTimeout(timerRef.current);
      retry(); // leaving the screen: send what is pending
    };
  }, [enabled, attempt]);

  return { noteId, status, savedAt, capturedAt, change, flush };
}
