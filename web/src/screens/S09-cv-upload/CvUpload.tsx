import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { PageHeader } from "../../app";
import { devParam } from "../../app/dev";
import { useAuth } from "../../features/auth";
import { Button, Chip, Icon } from "../../components";
import { db } from "../../lib/firebase";
import { FIXTURES } from "./fixtures";
import { filesFromDrop } from "./pick";
import { ACCEPT_ATTR, countFlags, filterCvFiles, nextReady, summary, toCandidate, type Draft, type QueueItem } from "./parse";
import { createQueue, liveQueue, useQueue, type Queue } from "./queue";
import { Review } from "./Review";
import styles from "./CvUpload.module.css";

/** Dev `?state=` renders from fixtures on a throwaway queue whose dependencies are never called: no uploads, API calls or writes. */
const inert = () => Promise.reject(new Error("dev fixture"));

export default function CvUpload() {
  const dev = devParam(useLocation().search, "state");
  // key: a changed ?state= remounts with that fixture's queue
  return <Screen key={dev ?? "live"} dev={dev} />;
}

function Sparkle() {
  return (
    <svg className={styles.spark} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
      <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
    </svg>
  );
}

function Screen({ dev }: { dev: string | null }) {
  const fixture = useMemo(() => (dev ? (FIXTURES[dev] ?? FIXTURES.empty!) : null), [dev]);
  const queue: Queue = useMemo(
    () => (fixture ? createQueue({ uid: () => undefined, upload: inert, parse: inert, removeFile: inert }, fixture.items) : liveQueue),
    [fixture],
  );
  const items = useQueue(queue);
  const [reviewId, setReviewId] = useState<string | null>(fixture?.reviewId ?? null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const page = useRef<HTMLDivElement>(null);

  // Moving between the list and a review replaces the focused control; put focus on the page so keyboard users keep their place.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else page.current?.focus();
  }, [reviewId]);

  const reviewing = items.find((i) => i.id === reviewId);

  /** After a confirm or a discard: the next CV that is ready, else back to the list. */
  const moveOn = (leaving: string) => {
    const next = nextReady(items.filter((i) => i.id !== leaving));
    setReviewId(next?.id ?? null);
  };

  async function save(item: QueueItem, status: "ok" | "flagged") {
    // Validated against the shared schema (dates as Date) before anything is written; a throw keeps the review on screen.
    const candidate = toCandidate(item.draft!, { uid: user?.uid ?? (fixture ? "dev" : ""), status, now: new Date(), fileName: item.fileRef ? item.fileName : undefined, fileRef: item.fileRef });
    let id = "dev";
    if (!fixture) {
      id = (await addDoc(collection(db, "candidates"), { ...candidate, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })).id;
    }
    const last = items.length === 1;
    queue.remove(item.id);
    if (last && !fixture) void navigate(`/candidates/${id}`);
    else moveOn(item.id);
  }

  function discard(item: QueueItem) {
    queue.discard(item.id);
    moveOn(item.id);
  }

  function addByHand() {
    setReviewId(queue.addByHand());
  }

  if (reviewing?.draft) {
    return (
      <div ref={page} tabIndex={-1} className={styles.root}>
        <Review
          key={reviewing.id}
          item={reviewing}
          onChange={(d: Draft) => queue.setDraft(reviewing.id, d)}
          onSave={(status) => save(reviewing, status)}
          onDiscard={() => discard(reviewing)}
          onBack={() => setReviewId(null)}
        />
      </div>
    );
  }

  return (
    <div ref={page} tabIndex={-1} className={styles.root}>
      <div className={styles.page}>
        <PageHeader
          context={
            <Link to="/candidates" className={styles.crumb}>
              Candidates
            </Link>
          }
          headline="Add a candidate."
          actions={
            <Button icon="bx-pencil" onClick={addByHand}>
              Add by hand instead
            </Button>
          }
        />
        <DropZone onFiles={(files) => queue.enqueue(files)} />
        {items.length > 0 && <QueueCard items={items} queue={queue} onReview={(id) => setReviewId(id)} />}
      </div>
    </div>
  );
}

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [over, setOver] = useState(false);
  const [note, setNote] = useState("");
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function take(all: File[]) {
    const { kept, skipped } = filterCvFiles(all);
    setNote(skipped ? `${skipped} ${skipped === 1 ? "file was" : "files were"} skipped. Tacit reads PDF, Word and text files.` : "");
    if (kept.length) onFiles(kept);
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    void filesFromDrop(e.dataTransfer).then(take);
  }

  return (
    <section
      className={styles.drop}
      data-over={over || undefined}
      aria-label="Add CVs"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={drop}
    >
      <span className={styles.dropIcon}>
        <Icon name="bx-upload" size={22} />
      </span>
      <h2 className="t-figure-medium">Drop CVs here</h2>
      <p className={`${styles.dim} t-body-s`}>PDF, Word or text.</p>
      <div className={styles.dropActions}>
        <Button icon="bx-file" onClick={() => filesInput.current?.click()}>
          Choose files
        </Button>
        <Button icon="bx-folder" onClick={() => folderInput.current?.click()}>
          Choose a folder
        </Button>
      </div>
      <p className={`${styles.dropNote} t-body-s`} role="status" aria-live="polite">
        {note}
      </p>
      <input
        ref={filesInput}
        type="file"
        hidden
        multiple
        accept={ACCEPT_ATTR}
        tabIndex={-1}
        onChange={(e) => {
          take([...(e.target.files ?? [])]);
          e.target.value = ""; // picking the same file again should fire again
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        tabIndex={-1}
        {...({ webkitdirectory: "" } as object)}
        onChange={(e) => {
          take([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </section>
  );
}

function flagsLabel(n: number) {
  return `Check this · ${n} ${n === 1 ? "thing" : "things"}`;
}

function QueueCard({ items, queue, onReview }: { items: readonly QueueItem[]; queue: Queue; onReview: (id: string) => void }) {
  const { total, ready, busy } = summary(items);
  const firstReady = nextReady(items);
  return (
    <section className={styles.queue} aria-label="CVs">
      {/* One polite region for the whole list: each row's status change is announced as it happens. */}
      <div role="status" aria-live="polite" className={styles.queueLive}>
        <header className={styles.queueHead}>
          <h2 className={`${styles.queueTitle} t-body-m-strong`}>
            {busy && <Sparkle />}
            {busy ? `Reading ${total} ${total === 1 ? "CV" : "CVs"}` : `${total} ${total === 1 ? "CV" : "CVs"}`}
          </h2>
          <p className={`${styles.dim} t-caption tabular`}>
            {ready} of {total} read
          </p>
        </header>
        <ul className={styles.rows}>
          {items.map((it) => (
            <Row key={it.id} item={it} queue={queue} onReview={() => onReview(it.id)} />
          ))}
        </ul>
      </div>
      <footer className={styles.queueFoot}>
        <p className={`${styles.dim} t-body-s`}>Nothing is saved until you confirm each person. You can keep working in the meantime.</p>
        <Button variant="primary" icon="bx-show" disabled={!firstReady} onClick={() => firstReady && onReview(firstReady.id)}>
          {ready ? `Review ${ready} read ${ready === 1 ? "CV" : "CVs"}` : "Review read CVs"}
        </Button>
      </footer>
    </section>
  );
}

function Row({ item, queue, onReview }: { item: QueueItem; queue: Queue; onReview: () => void }) {
  const { status } = item;
  const problem = status === "failed" || status === "unreadable";
  const flags = item.draft ? countFlags(item.draft) : 0;
  const bar = status === "ready" ? styles.barDone : status === "reading" || status === "uploading" ? styles.barBusy : "";

  return (
    <li className={styles.row}>
      <span className={problem ? styles.problem : styles.fileIcon}>
        <Icon name={problem ? "bx-error-circle" : "bx-file"} size={16} />
      </span>
      <span className={`${styles.fileName} t-body-m-strong`}>{item.fileName}</span>
      {problem ? (
        <p className={`${styles.message} t-body-s`}>{item.message}</p>
      ) : (
        <span className={styles.track} aria-hidden="true">
          <span className={`${styles.fill} ${bar}`} />
        </span>
      )}
      <span className={styles.status}>
        {status === "waiting" && <span className={`${styles.dim} t-body-s`}>Waiting</span>}
        {status === "uploading" && (
          <span className={`${styles.busy} t-body-s`}>
            <Sparkle />
            Uploading
          </span>
        )}
        {status === "reading" && (
          <span className={`${styles.busy} t-body-s`}>
            <Sparkle />
            Reading the CV
          </span>
        )}
        {status === "ready" && item.kind === "hand" && <span className={`${styles.dim} t-body-s`}>By hand</span>}
        {status === "ready" && item.kind === "file" && (flags ? <Chip icon="bx-error-circle">{flagsLabel(flags)}</Chip> : (
          <span className={`${styles.read} t-body-s`}>
            <Icon name="bx-check" size={16} />
            Read
          </span>
        ))}
        {status === "ready" && (
          <Button className={styles.small} onClick={onReview} aria-label={`Review ${item.fileName}`}>
            Review
          </Button>
        )}
        {status === "failed" && (
          <Button className={styles.small} icon="bx-refresh" onClick={() => queue.retry(item.id)} aria-label={`Try again: ${item.fileName}`}>
            Try again
          </Button>
        )}
        {status === "unreadable" && (
          <Button className={styles.small} icon="bx-pencil" onClick={() => { queue.byHandFromFile(item.id); onReview(); }} aria-label={`Add ${item.fileName} by hand`}>
            Add by hand
          </Button>
        )}
        {problem && (
          <Button className={`${styles.small} ${styles.quiet}`} onClick={() => queue.discard(item.id)} aria-label={`Discard ${item.fileName}`}>
            Discard
          </Button>
        )}
      </span>
    </li>
  );
}
