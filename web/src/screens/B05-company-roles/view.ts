import { fmtDay, RECRUITER_FIRST, type BriefSub, type Entry, type Sub, type Tone } from "../../features/portal/company";

// B05: one card per role. Same reads as B02 (own briefs + own shortlist entries), so no recruiter-only data can get here.
// A person's name exists only on an entry that carries `identity`, which the rules only give from Interviewing.

export type Counts = { shortlisted: number; interviewing: number };
export type RoleCard = {
  id: string;
  title: string;
  word: "Open" | "Under review" | "Not accepted" | "Filled";
  tone: Tone;
  /** Quiet text after the status word. */
  context: string;
  counts?: Counts;
  note?: string;
  quote?: string;
  facts?: string;
  /** Present = the whole card is the link; the action text then shows as plain text inside it. */
  to?: string;
  action?: { label: string; to: string };
};

const RANK = { Open: 0, "Under review": 1, "Not accepted": 2, Filled: 3 } as const;
export const RESEND = "/company/briefs/new";
const t = (d: Date | undefined) => d?.getTime() ?? 0;

/** 52000 -> "R52k". Other currencies keep their code. */
const money = (n: number, currency: string) => `${currency === "ZAR" ? "R" : `${currency} `}${Math.round(n / 1000)}k`;

export function band(b: BriefSub["fields"]["budget"]): string | undefined {
  const { min, max, currency } = b;
  if (!min && !max) return undefined;
  if (!min || !max || min === max) return money(max || min, currency);
  return `${money(min, currency)} to ${money(max, currency)}`;
}

const briefFacts = (f: BriefSub["fields"]) => [f.workMode, f.location, band(f.budget) ?? "salary not given"].filter(Boolean).join(" · ") || undefined;
const entryFacts = (e: Entry) => [e.facts.workMode, e.facts.location, e.facts.salary].filter(Boolean).join(" · ") || undefined;

export function roleCards(subs: readonly Sub[], entries: readonly Entry[]): RoleCard[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) groups.set(e.roleId, [...(groups.get(e.roleId) ?? []), e]);
  const lastShared = (g: readonly Entry[]) => Math.max(...g.map((e) => t(e.sharedAt)));
  const used = new Set<string>();
  const out: { at: number; card: RoleCard }[] = [];

  const fromGroup = (group: readonly Entry[], roleId: string, facts: string | undefined): { at: number; card: RoleCard } => {
    const n = (s: Entry["status"]) => group.filter((e) => e.status === s).length;
    const hired = group.find((e) => e.status === "hired");
    const title = group[0]!.roleTitle;
    const to = `/company/roles/${roleId}`;
    if (hired) {
      const at = [...hired.statusHistory].reverse().find((h) => h.status === "hired")?.at ?? hired.sharedAt;
      const who = hired.identity?.fullName;
      const f = facts ?? entryFacts(hired);
      return { at: t(at), card: { id: `role-${roleId}`, title, word: "Filled", tone: "for", context: `${who ? `${who} ` : ""}started ${fmtDay(at)}`, ...(f ? { facts: f } : {}), to } };
    }
    return {
      at: lastShared(group),
      card: {
        id: `role-${roleId}`, title, word: "Open", tone: "for", context: `shortlist ready ${fmtDay(new Date(lastShared(group)))}`,
        counts: { shortlisted: group.length, interviewing: n("interviewing") }, ...(facts ? { facts } : {}), to, action: { label: "Review shortlist", to },
      },
    };
  };

  for (const b of subs) {
    if (b.kind !== "brief") continue;
    const facts = briefFacts(b.fields);
    if (b.status === "pending") {
      out.push({
        at: t(b.submittedAt),
        card: { id: b.id, title: b.fields.title, word: "Under review", tone: "neutral", context: `sent ${fmtDay(b.submittedAt)}`, note: `${RECRUITER_FIRST} is checking the brief. Your shortlist shows up here when it is ready.`, ...(facts ? { facts } : {}) },
      });
    } else if (b.status === "not-accepted") {
      const at = b.reviewedAt ?? b.submittedAt;
      out.push({
        at: t(at),
        card: { id: b.id, title: b.fields.title, word: "Not accepted", tone: "against", context: `${RECRUITER_FIRST} · ${fmtDay(at)}`, ...(b.reasonText ? { quote: b.reasonText } : {}), ...(facts ? { facts } : {}), action: { label: "Send it again", to: RESEND } },
      });
    } else {
      const group = b.resultId ? groups.get(b.resultId) : undefined;
      if (b.resultId && group) {
        used.add(b.resultId);
        out.push(fromGroup(group, b.resultId, facts));
      } else {
        out.push({ at: t(b.reviewedAt ?? b.submittedAt), card: { id: b.id, title: b.fields.title, word: "Open", tone: "for", context: "no shortlist yet", note: `${RECRUITER_FIRST} is putting your shortlist together.`, ...(facts ? { facts } : {}) } });
      }
    }
  }
  // Roles the recruiter shortlisted for them without a brief of theirs: no brief means no role facts, except a hire's own.
  for (const [roleId, group] of groups) if (!used.has(roleId)) out.push(fromGroup(group, roleId, undefined));
  return out.sort((a, b) => RANK[a.card.word] - RANK[b.card.word] || b.at - a.at).map((x) => x.card);
}

export const headlineFor = (n: number) => `${n === 1 ? "role" : "roles"} with ${RECRUITER_FIRST}.`;
