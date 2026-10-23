import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { PageHeader, useScreenState } from "../../app";
import { buttonClass, EmptyState, ErrorBanner, Skeleton } from "../../components";
import { ShortlistCard } from "./ShortlistCard";
import type { Ask } from "./ShortlistCard";
import { StatusDialog } from "./StatusDialog";
import { announcement, headlineParts } from "./shortlist";
import { useShortlist } from "./useShortlist";
import styles from "./CompanyShortlist.module.css";

type Open = { kind: Ask; id: string };

/** Dev only: the Figma frames with a dialog open, on the fixture people (A interviewing, B and C waiting). */
const DEV_DIALOG: Record<string, Open> = {
  "move-to-interview": { kind: "interviewing", id: "entry_b" },
  hired: { kind: "hired", id: "entry_a" },
  "not-progressing": { kind: "not-progressing", id: "entry_c" },
};

/** B04: the company decides on each anonymous shortlisted person. Identity appears only after Move to interviewing. */
export default function CompanyShortlist() {
  const { roleId } = useParams();
  const { entries, error, retry, send } = useShortlist(roleId);
  const devState = useScreenState();
  const [open, setOpen] = useState<Open | null>(() => DEV_DIALOG[devState] ?? null);
  const [said, setSaid] = useState("");
  const cards = useRef(new Map<string, HTMLElement>());

  const target = open && entries?.find((e) => e.id === open.id);
  const onClose = useCallback(
    (done: boolean) => {
      if (done && open && target) {
        setSaid(announcement(target, open.kind));
        // The button that opened the dialog is gone or changed; keep focus on the person it was about.
        const id = open.id;
        requestAnimationFrame(() => cards.current.get(id)?.focus());
      }
      setOpen(null);
    },
    [open, target],
  );

  const roleTitle = entries?.[0]?.roleTitle;
  const parts = entries?.length ? headlineParts(entries.length) : undefined;

  return (
    <>
      <PageHeader
        context={<><Link to="/company" className={styles.crumb}>Roles</Link>{roleTitle ? ` / ${roleTitle}` : ""}</>}
        headline={parts ? <><span className={styles.num}>{parts.count}</span>{parts.rest}</> : entries ? "Nothing shortlisted yet." : "Shortlist"}
      />
      <p className="sr-only" role="status" aria-live="polite">{said}</p>

      {error ? (
        <ErrorBanner title="Couldn’t load this shortlist." onRetry={retry} />
      ) : !entries ? (
        <div aria-busy="true">
          <p className={`${styles.loading} t-body-s`} role="status">Loading the shortlist…</p>
          <div className={styles.grid} aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.skeleton}>
                <Skeleton width="40%" height={18} />
                <Skeleton width="60%" height={13} />
                <Skeleton width="80%" height={13} />
                <Skeleton height={110} />
                <Skeleton height={44} radius="pill" />
              </div>
            ))}
          </div>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          message="Naledi hasn’t shared anyone for this role yet. People appear here when she does."
          action={<Link to="/company" className={buttonClass("ghost")}>Back to your roles</Link>}
        />
      ) : (
        <ul className={styles.grid}>
          {entries.map((e) => (
            <li key={e.id}>
              <ShortlistCard
                ref={(el) => { if (el) cards.current.set(e.id, el); else cards.current.delete(e.id); }}
                entry={e}
                onAsk={(kind, entry) => setOpen({ kind, id: entry.id })}
              />
            </li>
          ))}
        </ul>
      )}

      {open && target && <StatusDialog kind={open.kind} entry={target} onSend={send} onClose={onClose} />}
    </>
  );
}
