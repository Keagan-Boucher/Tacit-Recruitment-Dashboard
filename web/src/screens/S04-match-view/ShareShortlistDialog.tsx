import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import type { Attribute, Candidate, Company, Match, Override, Role, ShareShortlistResponse, ShortlistEntry, ShortlistLink } from "@tacit/shared";
import { useScreenState } from "../../app";
import { Button, Dialog, FieldError, FilterChip, Icon, Input, Textarea } from "../../components";
import { api } from "../../lib/api";
import { useOwned } from "../../lib/data";
import type { WithId } from "../../lib/data";
import { fmtDate } from "../S03-candidate-profile/profile";
import { buildShareRequest, cardLabel, cardProblems, nameHits, nextLabels, prefillCard, shortlistedIds } from "./ShareShortlistDialog.logic";
import type { CardDraft } from "./ShareShortlistDialog.logic";
import styles from "./ShareShortlistDialog.module.css";

type Props = {
  role: WithId<Role>;
  company: WithId<Company>;
  matches: WithId<Match>[];
  overrides: WithId<Override>[];
  candidates: WithId<Candidate>[];
  attributes: WithId<Attribute>[];
};

/** S04: share the recruiter's shortlist with the client as anonymous cards. Trigger button plus the dialog (`?dialog=share`). */
export function ShareShortlistDialog(props: Props) {
  const [params, setParams] = useSearchParams();
  const set = (on: boolean) => setParams((p) => { if (on) p.set("dialog", "share"); else p.delete("dialog"); return p; });
  return (
    <>
      <Button icon="bx-share" aria-label={`Share shortlist with ${props.company.name}`} onClick={() => set(true)}>Share shortlist</Button>
      {params.get("dialog") === "share" && <ShareBody {...props} onClose={() => set(false)} />}
    </>
  );
}

function ShareBody({ role, company, matches, overrides, candidates, attributes, onClose }: Props & { onClose: () => void }) {
  const state = useScreenState();
  const dev = state.startsWith("share-");
  const [now] = useState(() => new Date());
  // Who already went to the client, so a re-share is never silent. A failed read just shows no markers.
  // Entries no longer say who they are; the recruiter-only links do.
  const linkRead = useOwned<ShortlistLink>("shortlistLinks", ["roleId", role.id]);
  const links = linkRead.data;
  const entries = useOwned<ShortlistEntry>("shortlistEntries", ["roleId", role.id]).data;
  const sharedOn = new Map((links ?? []).map((l) => [l.candidateId, l.sharedAt]));
  const [open, setOpen] = useState(true);
  const [tried, setTried] = useState(dev && state === "share-name-blocked");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(state === "share-error");
  const [sent, setSent] = useState<string | null>(state === "share-sent" ? "Candidate A–B" : null);

  // Dev states show the dialog filled even when the seed has no shortlist for this role.
  const people = useMemo(() => {
    let ids = shortlistedIds(overrides.filter((o) => o.roleId === role.id));
    if (!ids.length && dev) ids = matches.slice(0, 2).map((m) => m.candidateId);
    return ids.flatMap((id) => {
      const candidate = candidates.find((c) => c.id === id);
      const match = matches.find((m) => m.candidateId === id);
      return candidate && match ? [{ candidate, match }] : [];
    });
  }, [overrides, matches, candidates, role.id, dev]);

  const [picked, setPicked] = useState<string[]>(() => people.map((p) => p.candidate.id));
  const [drafts, setDrafts] = useState<Record<string, CardDraft>>(() => {
    const out: Record<string, CardDraft> = {};
    people.forEach((p, i) => {
      out[p.candidate.id] = prefillCard({ candidate: p.candidate, match: p.match, attrs: attributes, index: i, now });
    });
    if (state === "share-name-blocked" && people[0]) {
      const lead = people[0];
      const d = out[lead.candidate.id];
      if (d) d.headline = `${lead.candidate.fullName.split(" ")[0]}, ${d.headline}`;
    }
    return out;
  });

  // Once what is already on the role is known, label new cards after it. Only cards still carrying their first label change.
  const labelled = useRef(false);
  useEffect(() => {
    // Wait for links (they keep a shared person's label); if that read fails, entries alone still avoid a collision.
    if (labelled.current || !entries || (!links && !linkRead.error)) return;
    labelled.current = true;
    const first = people.map((p) => p.candidate.id);
    const labels = nextLabels(first, links ?? [], entries);
    setDrafts((all) => Object.fromEntries(Object.entries(all).map(([id, d], i) => [id, d.label === cardLabel(i) && labels[id] ? { ...d, label: labels[id] } : d])));
  }, [links, linkRead.error, entries, people]);

  // Close in two steps so Dialog puts focus back on the trigger before we unmount.
  useEffect(() => { if (!open) onClose(); }, [open, onClose]);

  const chosen = people.flatMap((p) => {
    const d = drafts[p.candidate.id];
    return d && picked.includes(p.candidate.id) ? [{ ...p, d }] : [];
  });
  const edit = (id: string, patch: Partial<CardDraft>) => setDrafts((all) => {
    const cur = all[id];
    return cur ? { ...all, [id]: { ...cur, ...patch } } : all;
  });
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const problems = chosen.map((p) => cardProblems(p.d, p.candidate.fullName));
  const blocked = problems.some((x) => x.length);

  async function send() {
    if (sending || !chosen.length) return;
    setTried(true);
    if (blocked) return;
    setSending(true);
    setFailed(false);
    try {
      const body = buildShareRequest(role.id, chosen.map((p) => p.d), new Date());
      await api<ShareShortlistResponse>("/api/shortlists/share", body);
      const labels = chosen.map((p) => p.d.label);
      setSent(labels.length > 1 ? `${labels[0]}–${labels[labels.length - 1]?.slice(-1)}` : (labels[0] ?? ""));
    } catch {
      setFailed(true); // every card stays as edited
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      width={760}
      eyebrow={role.title}
      title={`Share with ${company.name}`}
      description={sent ? undefined : `${company.name} sees only what is on these cards, as ${cardLabel(0)}, ${cardLabel(1)} and so on. Names stay with you.`}
      footer={
        sent ? (
          <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>
        ) : (
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" icon="bx-send" disabled={sending || !chosen.length} onClick={send} aria-label={sending ? undefined : `Share ${chosen.length} with ${company.name}`}>
              {sending ? "Sharing…" : `Share ${chosen.length}`}
            </Button>
          </>
        )
      }
    >
      <div aria-live="polite">
        {sent && (
          <p className={`${styles.sent} t-body-m-strong`}>
            <Icon name="bx-check" size={20} />
            <span>Shared with {company.name}. They see each person as {sent} until they move someone to interviewing.</span>
          </p>
        )}
      </div>
      {!sent && (
        <div className={styles.body}>
          {people.length === 0 ? (
            <p className="t-body-s-para">Nobody is shortlisted for this role yet. Shortlist someone from the suggestions, then share.</p>
          ) : (
            <>
              <div role="group" aria-labelledby="share-who" className={styles.who}>
                <p id="share-who" className={`${styles.label} t-body-s-strong`}>Who to share</p>
                <div className={styles.chips}>
                  {people.map((p) => {
                    const on = picked.includes(p.candidate.id);
                    const when = sharedOn.get(p.candidate.id);
                    return (
                      <FilterChip key={p.candidate.id} selected={on} onClick={() => toggle(p.candidate.id)}>
                        {on && <Icon name="bx-check" size={14} />}
                        {p.candidate.fullName}
                        {when && <span className="t-caption"> · Shared {fmtDate(when)}</span>}
                      </FilterChip>
                    );
                  })}
                </div>
              </div>
              {chosen.map((p, i) => {
                const d = p.d;
                const id = p.candidate.id;
                const hits = nameHits(d, p.candidate.fullName);
                const shown = tried || hits.length ? (problems[i] ?? []) : [];
                return (
                  <section key={id} className={styles.card} aria-labelledby={`card-${id}`}>
                    <header className={styles.cardHead}>
                      <h3 id={`card-${id}`} className="t-title">{d.label || "Card"}</h3>
                      <span className={`${styles.private} t-caption`}>{p.candidate.fullName}, only you see this</span>
                    </header>
                    <div className={styles.grid2}>
                      <Input label="Label" value={d.label} maxLength={40} onChange={(e) => edit(id, { label: e.target.value })} />
                      <Input label="Years of experience" inputMode="numeric" value={d.years} maxLength={2} onChange={(e) => edit(id, { years: e.target.value })} />
                    </div>
                    <Input label="Headline" value={d.headline} maxLength={200} onChange={(e) => edit(id, { headline: e.target.value })} />
                    <div className={styles.grid2}>
                      <Input label="Location" value={d.location} onChange={(e) => edit(id, { location: e.target.value })} />
                      <Input label="Work mode" value={d.workMode} onChange={(e) => edit(id, { workMode: e.target.value })} />
                      <Input label="Notice" value={d.notice} onChange={(e) => edit(id, { notice: e.target.value })} />
                      <Input label="Salary" value={d.salary} onChange={(e) => edit(id, { salary: e.target.value })} />
                    </div>
                    <div className={styles.grid2}>
                      <Textarea label="Reasons for" note="One per line" rows={4} value={d.forText} onChange={(e) => edit(id, { forText: e.target.value })} />
                      <Textarea label="Reasons against" note="One per line" rows={4} value={d.againstText} onChange={(e) => edit(id, { againstText: e.target.value })} />
                    </div>
                    <div aria-live="polite" className={styles.problems}>
                      {shown.map((t) => <FieldError key={t}>{t}</FieldError>)}
                    </div>
                  </section>
                );
              })}
              <p className={`${styles.note} t-caption-para`}>
                These lines come from your private notes. Check nothing here is internal detail from {company.name} before you share.
              </p>
              <div aria-live="polite">
                {failed && <FieldError>Couldn’t share the shortlist. Every card is as you left it. Try again.</FieldError>}
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
