import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import type { Candidate, Company, InterpretNoteResponse, InterviewNote, QuestionGuide, Role } from "@tacit/shared";
import { PageHeader } from "../../app";
import { devParam } from "../../app/dev";
import { Button, Card, Chip, EmptyState, ErrorBanner, Icon, Skeleton } from "../../components";
import { useAuth } from "../../features/auth";
import { api } from "../../lib/api";
import { useCandidate, useDocument, useNote, useNoteAttributes, useNotes, useOwned, type WithId } from "../../lib/data";
import { db } from "../../lib/firebase";
import NotFound from "../S16-not-found/NotFound";
import { askedQuestions, citedAttributes, fmtTime, headingAt, insertHeading, mergeTopSkills, noteLines, noteTitle, pickDraft } from "./capture";
import { GuideChips } from "./GuideChips";
import { Heard, Reader, type Row } from "./Heard";
import { EarlierNote, Failed, Hint, RoleCard, Working } from "./Side";
import { readDraft, useNoteSaver } from "./useNoteSaver";
import styles from "./InterviewCapture.module.css";

type Mode = "edit" | "working" | "review" | "failed";
// Dev ?state= overrides. They render the candidate's newest note and never write or call the API on load.
const DEV_MODE: Record<string, Mode> = { default: "edit", "typing-saved": "edit", "ai-working": "working", "interpretation-ready": "review", "ai-failed": "failed" };

/** S02: one free-text note, saved before anything else happens, then read by the model. The words survive every failure. */
export default function InterviewCapture() {
  const { candidateId } = useParams();
  const [attempt, setAttempt] = useState(0);
  // Remounting re-subscribes every read, which is all "Try again" needs.
  return <Loader key={`${candidateId}|${attempt}`} candidateId={candidateId ?? ""} onRetry={() => setAttempt((a) => a + 1)} />;
}

function Loader({ candidateId, onRetry }: { candidateId: string; onRetry: () => void }) {
  const [search] = useSearchParams();
  const dev = devParam(useLocation().search, "state");
  // Fixed at mount: replacing ?note= after the first keystroke must not make this screen reload itself.
  const [explicit] = useState(() => (dev === null ? search.get("note") : null));
  const [draft] = useState(() => (dev === null ? readDraft(candidateId, explicit) : null));
  const resumeId = explicit ?? draft?.noteId ?? null;

  const candidate = useCandidate(candidateId);
  const notes = useNotes(candidateId);
  const guides = useOwned<QuestionGuide>("questionGuides");
  const resumed = useNote(resumeId ?? undefined);

  // Offline reload of a note we hold a draft for: do not wait forever for a server that is not there.
  const [gaveUp, setGaveUp] = useState(false);
  const waiting = resumeId !== null && resumed.data === undefined;
  useEffect(() => {
    if (!waiting || !draft) return;
    const t = setTimeout(() => setGaveUp(true), 3000);
    return () => clearTimeout(t);
  }, [waiting, draft]);

  const error = [candidate, notes, guides, resumed].find((l) => l.error)?.error;
  if (error) {
    return (
      <>
        <PageHeader headline="Interview" />
        <ErrorBanner title="Couldn’t open this note." detail="Nothing was lost. Anything you typed is kept in this browser." onRetry={onRetry} />
      </>
    );
  }
  if (candidate.data === undefined || notes.data === undefined || guides.data === undefined || (waiting && !gaveUp)) return <CaptureSkeleton />;
  if (candidate.data === null) return <NotFound />;

  const devNote = dev !== null ? (notes.data[0] ?? null) : null;
  let noteDoc: WithId<InterviewNote> | null | undefined = dev !== null ? devNote : resumed.data;
  if (noteDoc && noteDoc.candidateId !== candidateId) noteDoc = null;
  if (explicit && noteDoc === null) {
    return (
      <>
        <PageHeader headline="Interview" />
        <EmptyState
          message="This note isn’t here, or it belongs to someone else."
          action={<Link to={`/candidates/${candidateId}`} className="t-body-m-strong">Back to {candidate.data.fullName}</Link>}
        />
      </>
    );
  }

  const server = noteDoc ? { text: noteDoc.rawText, updatedAt: noteDoc.updatedAt } : null;
  const picked = dev !== null ? { text: server?.text ?? "", restored: false } : pickDraft(server, draft && (!resumeId || draft.noteId === resumeId) ? draft : null);
  const guide = [...guides.data].sort((a, b) => b.version - a.version)[0];

  return (
    <Capture
      candidate={candidate.data}
      notes={notes.data}
      questions={guide?.questions ?? []}
      guideVersion={guide?.version}
      dev={dev}
      devNote={devNote}
      resumeId={resumeId}
      exists={Boolean(noteDoc) || (explicit !== null && gaveUp)}
      initialText={picked.text}
      restored={picked.restored}
      inSync={Boolean(noteDoc) && !picked.restored}
      reopened={explicit !== null}
    />
  );
}

type Props = {
  candidate: WithId<Candidate>;
  notes: WithId<InterviewNote>[];
  questions: string[];
  guideVersion: number | undefined;
  dev: string | null;
  devNote: WithId<InterviewNote> | null;
  resumeId: string | null;
  exists: boolean;
  initialText: string;
  restored: boolean;
  inSync: boolean;
  /** Opened from ?note= (S03 links here for unkept attributes). */
  reopened: boolean;
};

function Capture(p: Props) {
  const { candidate, notes, questions, dev } = p;
  const uid = useAuth().user?.uid ?? "";
  const [search, setSearch] = useSearchParams();
  const call = search.get("kind") === "call";
  const first = candidate.fullName.split(" ")[0] ?? candidate.fullName;
  const backTo = `/candidates/${candidate.id}`;

  const [text, setText] = useState(p.initialText);
  const saver = useNoteSaver({
    candidateId: candidate.id,
    uid,
    noteId: p.resumeId,
    exists: p.exists,
    text: p.initialText,
    inSync: p.inSync,
    guideVersion: p.guideVersion,
    enabled: dev === null,
    onCreated: (id) =>
      // history.replace: a reload from here resumes this note
      setSearch((prev) => {
        const next = new URLSearchParams(prev);
        next.set("note", id);
        return next;
      }, { replace: true }),
  });

  const viewId = dev !== null ? p.devNote?.id : saver.noteId ?? undefined;
  const liveNote = useNote(dev !== null ? undefined : viewId);
  const noteDoc = dev !== null ? p.devNote : liveNote.data ?? null;
  const attrsLive = useNoteAttributes(viewId);
  const role = useDocument<Role>("roles", noteDoc?.roleContextId);
  const company = useDocument<Company>("companies", role.data?.companyId);

  // ---- mode: derived unless the recruiter (or a dev ?state=) has moved it ----
  const [forced, setForced] = useState<Mode | null>(dev !== null ? (DEV_MODE[dev] ?? "edit") : null);
  const [failKind, setFailKind] = useState<"ai" | "save">("ai");
  const [awaiting, setAwaiting] = useState<string[]>([]);
  const attrs = attrsLive.data;
  const rows: Row[] = useMemo(() => citedAttributes(attrs ?? [], text), [attrs, text]);
  const resumedWithAttrs = p.reopened && (attrs?.length ?? 0) > 0;
  const mode: Mode = forced ?? (resumedWithAttrs ? "review" : "edit");
  const arriving = mode === "review" && awaiting.some((id) => !attrs?.some((a) => a.id === id));
  const showMode: Mode = arriving ? "working" : mode;

  // ---- question guide ----
  const asked = useMemo(() => askedQuestions(text, questions), [text, questions]);
  const [skipped, setSkipped] = useState<Set<string>>(() => {
    const open = questions.find((q) => !askedQuestions(p.initialText, questions).has(q));
    return new Set(dev !== null && dev !== "default" && dev !== "typing-saved" && open ? [open] : []);
  });
  const editor = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef<number | null>(null);
  const pendingCursor = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  const edit = (next: string) => {
    setText(next);
    saver.change(next);
  };
  const insert = (q: string) => {
    const at = headingAt(text, q);
    if (at >= 0) {
      pendingCursor.current = at + q.length;
      setTick((t) => t + 1);
      return;
    }
    const r = insertHeading(text, cursor.current ?? text.length, q);
    pendingCursor.current = r.cursor;
    edit(r.text);
    setSkipped((s) => {
      const n = new Set(s);
      n.delete(q);
      return n;
    });
  };
  const toggleSkip = (q: string) =>
    setSkipped((s) => {
      const n = new Set(s);
      if (!n.delete(q)) n.add(q);
      return n;
    });

  // ---- Done: save first, then read ----
  const done = async () => {
    if (!text.trim()) return;
    setFailKind("ai");
    setForced("working");
    if (dev !== null) {
      setForced("review");
      return;
    }
    const saved = await saver.flush();
    if (!saved || !saver.noteId) {
      setFailKind("save");
      setForced("failed");
      return;
    }
    try {
      const res = await api<InterpretNoteResponse>("/api/interpret-note", { noteId: saver.noteId });
      setAwaiting(res.attributeIds);
      setForced("review");
    } catch {
      setFailKind("ai");
      setForced("failed");
    }
  };
  const backToEditing = () => {
    setAwaiting([]);
    setForced("edit");
    pendingCursor.current = cursor.current ?? text.length;
  };

  // ---- Keep / Fix / Keep all: only confirmedByRecruiter, editedValue and updatedAt ever change ----
  const [problem, setProblem] = useState<string | null>(null);
  // undefined = untouched; the dev ready state opens with the first card selected, as in the design
  const [picked, setActiveId] = useState<string | null | undefined>(undefined);
  const activeId = picked === undefined ? (dev === "interpretation-ready" ? (rows[0]?.id ?? null) : null) : picked;
  const failed = () => setProblem("Couldn’t save that. Nothing was lost, try again.");

  const project = (kept: Row[]) => {
    const skills = kept.filter((r) => r.type === "skill").map((r) => r.editedValue || r.value);
    if (!skills.length || !noteDoc) return;
    const last = candidate.lastInterviewAt;
    const patch = {
      topSkills: mergeTopSkills(skills, candidate.topSkills ?? []),
      lastInterviewAt: last && last > noteDoc.capturedAt ? last : noteDoc.capturedAt,
      updatedAt: new Date(),
    };
    updateDoc(doc(db, "candidates", candidate.id), patch).catch(() => {}); // the projection is best effort, the keep is what counts
  };
  const keep = async (r: Row, on: boolean) => {
    try {
      await updateDoc(doc(db, "attributes", r.id), { confirmedByRecruiter: on, updatedAt: serverTimestamp() });
      setProblem(null);
      if (on) project([r]);
    } catch {
      failed();
    }
  };
  const fix = async (r: Row, value: string) => {
    try {
      await updateDoc(doc(db, "attributes", r.id), { editedValue: value, confirmedByRecruiter: true, updatedAt: serverTimestamp() });
      setProblem(null);
      project([{ ...r, editedValue: value }]);
    } catch {
      failed();
    }
  };
  const keepAll = async () => {
    const todo = rows.filter((r) => !r.confirmedByRecruiter);
    try {
      const batch = writeBatch(db);
      for (const r of todo) batch.update(doc(db, "attributes", r.id), { confirmedByRecruiter: true, updatedAt: serverTimestamp() });
      await batch.commit();
      setProblem(null);
      project(todo);
    } catch {
      failed();
    }
  };

  // Selecting one side brings the other into view.
  useEffect(() => {
    if (!activeId) return;
    const sel = CSS.escape(activeId);
    for (const q of [`[data-attr="${sel}"]`, `[data-phrase="${sel}"]`]) document.querySelector(q)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  // ---- display ----
  const thisAt = noteDoc?.capturedAt ?? saver.capturedAt;
  const position = 1 + notes.filter((n) => n.id !== viewId && n.capturedAt < thisAt).length;
  const earlier = notes.find((n) => n.id !== viewId && n.capturedAt < thisAt);
  const lines = useMemo(
    () => noteLines(text, questions, showMode === "review" ? rows.map((r) => ({ id: r.id, n: r.n, ...r.sourceSpan })) : []),
    [text, questions, rows, showMode],
  );
  const savedTime = saver.savedAt ?? (p.inSync || dev !== null ? noteDoc?.updatedAt : undefined);
  const editing = showMode === "edit";
  const locked = !editing;

  // After the note changes, the editor reopens, or a chip points at an existing heading: put the cursor where it was asked for.
  useEffect(() => {
    if (pendingCursor.current === null || !editor.current) return;
    const at = pendingCursor.current;
    pendingCursor.current = null;
    editor.current.focus();
    editor.current.setSelectionRange(at, at);
    cursor.current = at;
  }, [text, tick, editing]);

  const announce =
    showMode === "working" ? `Reading your note for skills, salary and what ${first} wants next.`
    : showMode === "review" ? `${rows.length} ${rows.length === 1 ? "thing" : "things"} heard. Nothing is stored until you keep it.`
    : showMode === "failed" ? (failKind === "ai" ? "Couldn’t read this reliably. Your note is saved." : "Couldn’t save this yet. Your text is kept in this browser.")
    : "";

  return (
    <>
      <PageHeader
        context={
          <span className={styles.crumbs}>
            <Link to="/candidates">Candidates</Link> / <Link to={backTo}>{candidate.fullName}</Link> / New note
          </span>
        }
        headline={`${call ? "Call" : "Interview"} with ${candidate.fullName}`}
        actions={
          <>
            <p className={`${styles.save} ${saver.status === "error" ? styles.err : ""} t-body-s`} role="status" aria-live="polite">
              {saver.status === "error" ? (
                <>
                  <Icon name="bx-error-circle" size={16} />
                  Not saved yet. Your text is kept here, retrying.
                </>
              ) : saver.status === "saving" ? (
                "Saving…"
              ) : savedTime ? (
                <>
                  <Icon name="bx-check" size={16} />
                  Saved {fmtTime(savedTime)}
                </>
              ) : null}
            </p>
            {editing ? (
              <Button variant="primary" size="lg" icon="bx-check" disabled={!text.trim()} onClick={() => void done()}>Done</Button>
            ) : (
              <Button size="lg" icon="bx-pencil" disabled={showMode === "working"} onClick={backToEditing}>Edit note</Button>
            )}
          </>
        }
      />
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <div className={styles.grid}>
        <section className={styles.note} aria-label="Note">
          <header className={styles.noteHead}>
            <h2 className="t-title">{noteTitle(position, call)}</h2>
            {showMode === "working" ? (
              <Chip icon="bx-check">Read only</Chip>
            ) : p.restored && editing ? (
              <span className={`${styles.restored} t-caption`}>Restored from this browser</span>
            ) : null}
          </header>

          <GuideChips questions={questions} asked={asked} skipped={skipped} locked={locked} onInsert={insert} onToggleSkip={toggleSkip} />
          {questions.length > 0 && <div className={styles.divider} />}

          <div className={styles.writing}>
            {editing ? (
              <textarea
                ref={editor}
                className={`${styles.editor} t-note`}
                aria-label="Interview note"
                placeholder={`Write what you hear from ${first}. It saves as you go.`}
                value={text}
                autoFocus={dev === null}
                spellCheck
                onChange={(e) => edit(e.target.value)}
                onSelect={(e) => (cursor.current = e.currentTarget.selectionStart)}
              />
            ) : (
              <Reader lines={lines} activeId={activeId} onSelect={setActiveId} locked={showMode === "working"} />
            )}
          </div>
        </section>

        <div className={styles.side}>
          {showMode === "review" && <Heard rows={rows} text={text} activeId={activeId} onSelect={setActiveId} onKeep={keep} onFix={fix} onKeepAll={keepAll} problem={problem} backTo={backTo} />}
          {showMode === "working" && <Working first={first} />}
          {showMode === "failed" && <Failed kind={failKind} onRetry={() => void done()} backTo={backTo} />}
          {(showMode === "edit" || showMode === "failed") && (
            <>
              {role.data && <RoleCard role={role.data} company={company.data} />}
              {earlier && <EarlierNote note={earlier} questions={questions} />}
              {showMode === "edit" && <Hint first={first} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CaptureSkeleton() {
  return (
    <>
      <PageHeader context={<span role="status" aria-live="polite">Opening your note.</span>} headline={<><Skeleton width={420} height={44} /><span className="sr-only">Interview</span></>} />
      <div className={styles.grid} aria-busy="true">
        <Card className={styles.note}>
          <Skeleton width={180} height={22} />
          <Skeleton width="70%" height={32} radius="pill" />
          <Skeleton height={120} />
        </Card>
        <div className={styles.side}>
          <Card><Skeleton height={140} /></Card>
          <Card><Skeleton height={90} /></Card>
        </div>
      </div>
    </>
  );
}
