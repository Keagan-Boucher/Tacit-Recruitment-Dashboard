import type { DragEvent, KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { ref as storageRef, uploadBytes } from "firebase/storage";
import type { ParseBriefResponse, QuotedBriefInterpretation } from "@tacit/shared";
import { Button, Card, Chip, FieldError, Icon, Textarea } from "../../components";
import { ApiError, api } from "../../lib/api";
import { storage } from "../../lib/firebase";
import { useAuth } from "../auth";
import {
  ACCEPT,
  briefStoragePath,
  buildParseBriefRequest,
  describeProblem,
  fileProblem,
  formatSize,
  screeningRows,
  type BriefProblem,
  type BriefSource,
} from "./helpers";
import { BriefRows } from "./BriefRows";
import styles from "./BriefPicker.module.css";

export type InterpretedBrief = {
  result: QuotedBriefInterpretation;
  modelVersion: string;
  /** What was interpreted. For uploads this is the text the proxy extracted; becomes Role.briefText. */
  briefText: string;
  briefSource: BriefSource;
  briefFileRef?: string;
};

type Props = {
  onInterpreted: (r: InterpretedBrief) => void;
  initialSource?: BriefSource;
  /** Which ways in to offer; companies (B03) get paste and upload only. Default: all three. */
  modes?: BriefSource[];
  /** Show the read-only "What Tacit read" card under the input card. Default true; B03 shows its own editable one. */
  showUnderstood?: boolean;
  /** Called when the read moves between idle (also after a successful read), uploading, reading and error. `retry` repeats the read with what is on screen now. */
  onPhase?: (phase: "idle" | "uploading" | "reading" | "error", retry: () => void) => void;
};

const MODES: { value: BriefSource; label: string; icon: string }[] = [
  { value: "paste", label: "Paste from email", icon: "bx-file" },
  { value: "upload", label: "Upload the spec", icon: "bx-upload" },
  { value: "call", label: "Type it from a call", icon: "bx-pencil" },
];

const COPY: Record<"paste" | "call", { label: string; placeholder: string }> = {
  paste: { label: "Pasted brief", placeholder: "Paste the client’s email here." },
  call: {
    label: "Call notes",
    placeholder: "Type what the client says as you go: the role, hybrid or on-site, budget, must-haves.",
  },
};

type Phase = "idle" | "uploading" | "reading" | "error" | "done";

/** Four-point star, the "Tacit is reading" mark. */
function Sparkle() {
  return (
    <svg className={styles.spark} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
      <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
    </svg>
  );
}

function ModeSwitch({ value, onChange, modes }: { value: BriefSource; onChange: (v: BriefSource) => void; modes: typeof MODES }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = modes.findIndex((m) => m.value === value);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = modes.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = selected === last ? 0 : selected + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = selected === 0 ? last : selected - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    onChange(modes[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="How the brief arrived" className={styles.modes} onKeyDown={onKeyDown}>
      {modes.map((m, i) => (
        <button
          key={m.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === selected}
          tabIndex={i === selected ? 0 : -1}
          className={`${styles.mode} ${i === selected ? "t-body-s-strong" : "t-body-s"}`}
          onClick={() => onChange(m.value)}
        >
          <Icon name={m.icon} size={16} />
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Picker for a client brief: paste, upload or type from a call. Sends it to the proxy and hands back the interpretation. */
export function BriefPicker({ onInterpreted, initialSource = "paste", modes: allowed, showUnderstood = true, onPhase }: Props) {
  const modes = allowed ? MODES.filter((m) => allowed.includes(m.value)) : MODES;
  const { user } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const uploaded = useRef<{ file: File; path: string } | null>(null);
  const dropId = useId();

  const [source, setSource] = useState<BriefSource>(initialSource);
  const [texts, setTexts] = useState({ paste: "", call: "" });
  const [file, setFile] = useState<File | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<BriefProblem | null>(null);
  const [interp, setInterp] = useState<QuotedBriefInterpretation | null>(null);

  const busy = phase === "uploading" || phase === "reading";
  // The latest read(), so a retry from outside never repeats a stale closure. Not called on mount: nothing has happened yet.
  const latest = useRef<() => void>(() => {});
  const announced = useRef(false);
  useEffect(() => {
    if (!announced.current) {
      announced.current = true;
      return;
    }
    onPhase?.(phase === "done" ? "idle" : phase, () => latest.current());
    // onPhase is the caller's handler; only a change of phase should announce
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  const text = source === "upload" ? "" : texts[source];
  const ready = source === "upload" ? file !== null : text.trim().length > 0;

  function pickFile(f: File | undefined) {
    if (!f || busy) return;
    const bad = fileProblem(f);
    setFileNote(bad);
    if (bad) return;
    uploaded.current = null;
    setFile(f);
    setSource("upload");
    if (phase === "error") setPhase("idle");
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  }
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      if (!busy) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop,
  };

  async function read() {
    if (!ready || busy) return;
    setProblem(null);
    let fileRef: string | undefined;
    try {
      let req;
      if (source === "upload" && file) {
        if (!user) throw new ApiError(401, "unauthorized", "Not signed in.");
        // A retry after a failed read reuses the file already in Storage.
        fileRef = uploaded.current?.file === file ? uploaded.current.path : undefined;
        if (!fileRef) {
          setPhase("uploading");
          const path = briefStoragePath(user.uid, file.name, Date.now());
          await uploadBytes(storageRef(storage, path), file);
          uploaded.current = { file, path };
          fileRef = path;
        }
        req = buildParseBriefRequest("upload", { fileRef });
      } else {
        req = buildParseBriefRequest(source, { text });
      }
      setPhase("reading");
      const res = await api<ParseBriefResponse>("/api/parse-brief", req);
      setInterp(res.result);
      setPhase("done");
      onInterpreted({
        result: res.result,
        modelVersion: res.modelVersion,
        briefText: res.text,
        briefSource: source,
        ...(fileRef ? { briefFileRef: fileRef } : {}),
      });
    } catch (e) {
      const err = e as { status?: number; code?: string; message?: string };
      setProblem(describeProblem(err, source));
      setPhase("error");
    }
  }

  useEffect(() => {
    latest.current = () => void read();
  });

  const status =
    phase === "uploading"
      ? "Uploading the file…"
      : phase === "reading"
        ? source === "upload"
          ? "Reading the file and sorting it into your screening order…"
          : "Reading the brief and sorting it into your screening order…"
        : null;

  return (
    <div className={styles.root}>
      <Card className={styles.card} aria-busy={busy || undefined}>
        <h2 className="t-title">The brief</h2>
        <ModeSwitch
          modes={modes}
          value={source}
          onChange={(v) => {
            setSource(v);
            setFileNote(null);
          }}
        />

        {source !== "upload" ? (
          <>
            <Textarea
              key={source}
              label={COPY[source].label}
              hideLabel
              rows={12}
              placeholder={COPY[source].placeholder}
              value={text}
              readOnly={busy}
              onChange={(e) => setTexts((t) => ({ ...t, [source]: e.target.value }))}
            />
            <div className={`${styles.strip} ${dragging ? styles.over : ""}`} {...dropProps}>
              <Icon name="bx-upload" size={18} />
              <p className={`${styles.stripText} t-body-s`}>Or drop a PDF, Word file or saved email here</p>
              <button type="button" className={`${styles.link} t-body-s-strong`} onClick={() => fileInput.current?.click()} disabled={busy}>
                Choose file
              </button>
            </div>
          </>
        ) : (
          <div className={`${styles.zone} ${dragging ? styles.over : ""}`} {...dropProps} aria-describedby={`${dropId}-types`}>
            <Icon name={file ? "bx-file" : "bx-upload"} size={24} />
            {file ? (
              <>
                <p className="t-body-m-strong">{file.name}</p>
                <p className="t-caption">{formatSize(file.size)}</p>
                <div className={styles.zoneActions}>
                  <button type="button" className={`${styles.link} t-body-s-strong`} onClick={() => fileInput.current?.click()} disabled={busy}>
                    Choose another
                  </button>
                  <button
                    type="button"
                    className={`${styles.link} ${styles.quiet} t-body-s-strong`}
                    disabled={busy}
                    onClick={() => {
                      uploaded.current = null;
                      setFile(null);
                      setFileNote(null);
                    }}
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="t-body-m-strong">Drop a PDF, Word file or saved email here</p>
                <button type="button" className={`${styles.link} t-body-s-strong`} onClick={() => fileInput.current?.click()} disabled={busy}>
                  Choose file
                </button>
              </>
            )}
            <p id={`${dropId}-types`} className={`${styles.types} t-caption`}>
              PDF, Word (.docx), .eml, .msg or .txt, up to 10 MB
            </p>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a brief file"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div aria-live="polite">{fileNote && <FieldError>{fileNote}</FieldError>}</div>

        <div aria-live="polite" className={styles.problemSlot}>
          {phase === "error" && problem && (
            <div className={styles.problem}>
              <span className={styles.problemIcon}>
                <Icon name="bx-error-circle" size={20} />
              </span>
              <p className="t-body-m-strong">{problem.title}</p>
              <p className={`${styles.problemDetail} t-body-s`}>{problem.detail}</p>
              {problem.kind === "bad_file" ? (
                <Button className={styles.tall} icon="bx-file" onClick={() => setSource("paste")}>
                  Paste the text instead
                </Button>
              ) : (
                <Button className={styles.tall} icon="bx-refresh" onClick={read}>
                  Try again
                </Button>
              )}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <p className={`${styles.say} t-body-s`} aria-live="polite">
            {status && (
              <>
                <Sparkle />
                <span>{status}</span>
              </>
            )}
          </p>
          <Button
            className={styles.tall}
            variant={phase === "done" ? "ghost" : "primary"}
            icon={phase === "done" ? "bx-refresh" : undefined}
            disabled={!ready || busy}
            onClick={read}
          >
            {phase === "done" ? "Read again" : "Read brief"}
          </Button>
        </div>
      </Card>

      {showUnderstood && <div aria-live="polite">{interp && <Understood r={interp} />}</div>}
    </div>
  );
}

/** Compact "what Tacit understood", in the recruiter's screening order, plus what to ask the client. */
function Understood({ r }: { r: QuotedBriefInterpretation }) {
  const context = [r.title, r.companyName].filter(Boolean).join(" · ");
  return (
    <Card className={styles.card}>
      <div>
        <h2 className="t-title">What Tacit read from the brief</h2>
        {context && <p className={`${styles.context} t-body-s`}>{context}</p>}
      </div>
      <BriefRows rows={screeningRows(r, r.quotes)} />
      {r.unclear.length > 0 && (
        <div className={styles.ask}>
          <span>
            <Chip icon="bx-help-circle">Ask the client · {r.unclear.length}</Chip>
          </span>
          <ul className={styles.questions}>
            {r.unclear.map((q) => (
              <li key={q} className="t-body-s-para">
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
