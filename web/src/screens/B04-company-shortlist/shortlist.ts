import type { Salary, ShortlistEntry, ShortlistStatusRequest } from "@tacit/shared";

// Pure helpers for B04. A company only ever sees the card the recruiter approved, so nothing here reads
// a candidate document: a name or contact exists only on `entry.identity`, which the proxy writes on Interviewing.

export type Entry = ShortlistEntry & { id: string };
type Identity = NonNullable<ShortlistEntry["identity"]>;

// shortcut: one recruiter in this MVP; read the name from the share when there are several
export const RECRUITER = "Naledi";
/** The reason the proxy writes on everyone else when a role is filled. */
export const ROLE_FILLED = "Role filled";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "20 Oct 2026". */
export const fmtDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const byLabel = (a: Entry, b: Entry) => a.label.localeCompare(b.label, "en", { numeric: true });

/** "4 people shortlisted." split so the count can carry the accent. */
export const headlineParts = (n: number) => ({ count: String(n), rest: ` ${plural(n, "person", "people")} shortlisted.` });

/** Location · work mode · notice · salary, empty parts dropped. */
export const factsLine = (f: Entry["facts"]) => [f.location, f.workMode, f.notice, f.salary].map((x) => x.trim()).filter(Boolean).join(" · ");

/** "7 years" / "1 year" under the headline. */
export const whoLine = (e: Pick<Entry, "headline" | "years">) => `${e.headline} · ${e.years} ${plural(e.years, "year", "years")}`;

export const reasonCount = (n: number, tone: "for" | "against") => ({ n, word: `${plural(n, "reason", "reasons")} ${tone}` });

/** Accessible name for an "and N more" button: names the card and the side, since the visible text repeats on every card. */
export const moreLabel = (hidden: number, tone: "for" | "against", name: string) => `and ${hidden} more ${hidden === 1 ? "reason" : "reasons"} ${tone} ${name}`; // starts with the visible text (WCAG 2.5.3)

/** When the entry reached `status`, from its history (the newest such change). */
export const changeAt = (e: Entry, status: Entry["status"]): Date | undefined =>
  [...e.statusHistory].reverse().find((h) => h.status === status)?.at;

/** Contact line once identity exists: "Shared with you" + whatever contact there is. */
export function sharedLine(id: Identity): { lead: string; rest: string } {
  const contact = [id.email, id.phone].map((x) => x.trim()).filter(Boolean);
  return { lead: "Shared with you", rest: ` · ${contact.length ? contact.join(" · ") : `${RECRUITER} will share their contact details`}` };
}

export type Tone = "waiting" | "for" | "against";
export type DecisionRow = {
  tone: Tone;
  word: string;
  /** For Not progressing: the text before the quoted reason, and the reason. */
  line: string;
  quote?: string;
  actions: ("not-progressing" | "interviewing" | "hired")[];
  /** Change on a closed decision. */
  change: boolean;
};

/** The S04 decision-row pattern for one entry. */
export function decisionRow(e: Entry): DecisionRow {
  switch (e.status) {
    case "shortlisted":
      return { tone: "waiting", word: "Waiting for your decision", line: `Shortlisted by ${RECRUITER} · ${fmtDate(changeAt(e, "shortlisted") ?? e.sharedAt)}`, actions: ["not-progressing", "interviewing"], change: false };
    case "interviewing": {
      const at = changeAt(e, "interviewing");
      const times = e.interviewTimes?.[0];
      return {
        tone: "for", word: "Interviewing",
        line: `Your call${at ? ` · ${fmtDate(at)}` : ""} · interview arranged by ${RECRUITER}${times ? " · you suggested " : ""}`,
        ...(times && { quote: times }),
        actions: ["not-progressing", "hired"], change: false,
      };
    }
    case "hired": {
      const at = changeAt(e, "hired");
      return { tone: "for", word: "Hired", line: `Your call${at ? ` · ${fmtDate(at)}` : ""} · the role is closed`, actions: [], change: false };
    }
    case "not-progressing": {
      const last = [...e.statusHistory].reverse().find((h) => h.status === "not-progressing");
      const reason = last?.reasonText?.trim();
      if (reason === ROLE_FILLED) return { tone: "against", word: "Not progressing", line: `${ROLE_FILLED}${last ? ` · ${fmtDate(last.at)}` : ""}`, actions: [], change: false };
      return { tone: "against", word: "Not progressing", line: `Your reason${last ? ` · ${fmtDate(last.at)}` : ""}${reason ? " · " : ""}`, ...(reason && { quote: reason }), actions: [], change: true };
    }
  }
}

// ---- request builders: each returns a body that passes ShortlistStatusRequest, or says what is missing -------------

export type Built<T> = { ok: true; body: T } | { ok: false; field: "reason" | "startDate" | "salary"; message: string };
const lines = (s: string) => s.trim();

export const buildInterviewing = (entryId: string, times: string): ShortlistStatusRequest => ({
  entryId, status: "interviewing", ...(lines(times) && { interviewTimes: [lines(times)] }),
});

export function buildNotProgressing(entryId: string, reason: string): Built<ShortlistStatusRequest> {
  const reasonText = lines(reason);
  return reasonText ? { ok: true, body: { entryId, status: "not-progressing", reasonText } } : { ok: false, field: "reason", message: `Add a reason so ${RECRUITER} knows why.` };
}

/** "R62 000", "62,000.50" and "62000" all read as a number; anything else is not an amount. */
export function parseAmount(text: string): number | undefined {
  const t = text.replace(/^R\s*/i, "").replace(/[\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  const n = Number(t);
  return n > 0 ? n : undefined;
}

export function buildHired(entryId: string, f: { startDate: string; amount: string; currency: string; period: Salary["period"] }): Built<ShortlistStatusRequest> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate)) return { ok: false, field: "startDate", message: "Add the start date." };
  const amount = parseAmount(f.amount);
  if (amount === undefined) return { ok: false, field: "salary", message: `Add the agreed salary as a number, like 62 000.` };
  const currency = f.currency.trim().toUpperCase() || "ZAR";
  return { ok: true, body: { entryId, status: "hired", startDate: f.startDate, salary: { amount, currency, period: f.period } } };
}

/** A sentence for a failed change; typed text stays in the dialog. Takes the shape of ApiError so it needs no import. */
export function changeError(e: { status?: number; code?: string; message?: string }): string {
  if (e.code === "bad_transition") return `${e.message || "That person can't move to that step."} Nothing was changed.`;
  if (e.status === 403 || e.code === "forbidden") return "Your account can't change this shortlist. Nothing was changed.";
  if (e.status === 0) return "Couldn't reach Tacit. What you typed is still here. Try again.";
  return "Couldn't save this change. What you typed is still here. Try again.";
}

/** What a screen reader hears after a change. */
export function announcement(e: Entry, status: Entry["status"]): string {
  const who = e.identity?.fullName ?? e.label;
  if (status === "interviewing") return `${who} moved to interviewing. Their name and contact details are now shown. Saved for ${RECRUITER}.`;
  if (status === "hired") return `${who} marked as hired. The role is closed. Saved for ${RECRUITER}.`;
  return `${who} marked as not progressing. Saved for ${RECRUITER}.`;
}

/**
 * Dev fixtures only: what the proxy would write for `req`, applied locally. Mirrors the server's transitions
 * (forward only; a hire closes the others with "Role filled"); the live path never calls this.
 */
export function applyChange(entries: Entry[], req: ShortlistStatusRequest, by: string, at: Date, identity?: Identity): Entry[] {
  const change = (e: Entry, status: Entry["status"], reasonText?: string): Entry => ({
    ...e, status, updatedAt: at, statusHistory: [...e.statusHistory, { status, by, at, ...(reasonText && { reasonText }) }],
  });
  return entries.map((e) => {
    if (e.id === req.entryId) {
      const next = change(e, req.status, req.reasonText);
      return req.status === "interviewing" ? { ...next, ...(identity && { identity }), ...(req.interviewTimes && { interviewTimes: req.interviewTimes }) } : next;
    }
    return req.status === "hired" && (e.status === "shortlisted" || e.status === "interviewing") ? change(e, "not-progressing", ROLE_FILLED) : e;
  });
}
