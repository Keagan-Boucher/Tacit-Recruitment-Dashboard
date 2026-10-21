import type { KeyboardEvent } from "react";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Company, Role } from "@tacit/shared";
import { useDevOverlay, useScreenState } from "../../app";
import { devParam } from "../../app/dev";
import { Chip, Icon } from "../../components";
import { useCandidates, useOwned } from "../../lib/data";
import styles from "./CommandPalette.module.css";
import { paletteGroups, type Hit } from "./search";

const ICON = { candidate: "bx-group", company: "bx-buildings", role: "bx-briefcase", search: "bx-search", new: "bx-plus" } as const;

/** Ctrl or Cmd + K from any railed page opens it. Dev: `?palette=open` (query "fico", or "mainframe" with `&state=no-results`, or `&q=`). */
export function CommandPalette() {
  const { search } = useLocation();
  const state = useScreenState();
  const devOpen = useDevOverlay("palette") === "open";
  const [open, setOpen] = useState(devOpen);
  const [seed] = useState(() => devParam(search, "q") ?? (devOpen ? (state === "no-results" ? "mainframe" : "fico") : ""));
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
      e.preventDefault(); // browsers use Ctrl K for their own search box
      setOpen((o) => !o);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      opener.current?.focus();
      opener.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Command palette"
      className={styles.dialog}
      onCancel={(e) => {
        e.preventDefault();
        setOpen(false);
      }}
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      {/* mounted only while open: fresh query each time, and no listeners while closed */}
      {open && <Palette seed={seed} onClose={() => setOpen(false)} />}
    </dialog>
  );
}

/** Wraps each query word found in `text` in <mark> (lime text). */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return text;
  const parts = text.split(new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i"));
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}

function Palette({ seed, onClose }: { seed: string; onClose: () => void }) {
  const navigate = useNavigate();
  const people = useCandidates();
  const companies = useOwned<Company>("companies");
  const roles = useOwned<Role>("roles");
  const [now] = useState(() => new Date());
  const [query, setQuery] = useState(seed);
  const [active, setActive] = useState(0);
  const listId = useId();

  const error = [people, companies, roles].find((l) => l.error)?.error;
  const ready = !error && people.data && companies.data && roles.data;
  // A miss says so, then suggests searching the notes and lists a few recent items (as the no-results frame does).
  const { groups, miss } = ready ? paletteGroups(people.data!, companies.data!, roles.data!, query, now) : { groups: [], miss: false };
  const flat = groups.flatMap((g) => g.hits);
  const results = flat.filter((h) => h.kind === "candidate" || h.kind === "company" || h.kind === "role").length;
  const current = Math.min(active, flat.length - 1);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const optionId = (h: Hit) => `${listId}-${h.key}`;

  function go(h: Hit | undefined) {
    if (!h) return;
    onClose();
    navigate(h.to);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setActive((current + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[current]);
    }
  }

  const message = error ? "Couldn’t load your records. Nothing was lost." : !ready ? "Loading." : miss ? `Nothing matches “${query.trim()}”.` : "";

  return (
    <>
      <div className={styles.top}>
        <Icon name="bx-search" size={20} />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={flat[current] ? optionId(flat[current]) : undefined}
          aria-label="Search people, companies and roles"
          placeholder="Search people, companies and roles"
          className={styles.input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <span className={`${styles.hint} t-chip`}>Ctrl K</span>
      </div>
      <div className={styles.results}>
        {/* announces "Nothing matches" or the result count; the visible text is the same message */}
        <div aria-live="polite" className={message ? `${styles.message} t-body-m-strong` : "sr-only"}>
          {message || `${results} ${results === 1 ? "result" : "results"}`}
        </div>
        <div id={listId} role="listbox" aria-label="Results" className={styles.list}>
          {groups.map((g, gi) => (
            <div key={g.label} role="group" aria-labelledby={`${listId}-g${gi}`} className={styles.list}>
              <p id={`${listId}-g${gi}`} className={`${styles.group} t-caption-strong`}>
                {g.label}
                {g.count !== undefined && <span className={styles.count}> {g.count}</span>}
              </p>
              {g.hits.map((h) => (
                <div
                  key={h.key}
                  id={optionId(h)}
                  role="option"
                  aria-selected={h === flat[current]}
                  className={styles.option}
                  onMouseMove={() => setActive(flat.indexOf(h))}
                  onClick={() => go(h)}
                >
                  <span className={styles.iconBox}>
                    <Icon name={h.recent ? "bx-history" : ICON[h.kind]} size={16} />
                  </span>
                  <span className={styles.text}>
                    <span className={`${styles.title} t-body-m-strong`}>
                      <Marked text={h.title} terms={h.kind === "search" || h.kind === "new" ? [] : terms} />
                    </span>
                    {h.sub && (
                      <span className={`${styles.sub} t-caption`}>
                        <Marked text={h.sub} terms={terms} />
                      </span>
                    )}
                  </span>
                  {h.staleMonths !== undefined && <Chip tone="stale">Stale · {h.staleMonths} mo</Chip>}
                  {h === flat[current] && <kbd className={`${styles.kbd} t-meta`}>Enter</kbd>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
