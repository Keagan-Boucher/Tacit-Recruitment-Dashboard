import type { Company, Match, Override, Placement, Role } from "@tacit/shared";
import { Card } from "../../components";
import type { WithId } from "../../lib/data";
import { Count } from "./Count";
import { fmtDate, ordinal } from "./profile";
import styles from "./CandidateProfile.module.css";

type Tone = "accent" | "for" | "against" | "quiet";
type Row = { key: string; at: Date; role?: Role; companyName?: string; status: { tone: Tone; text: string }; body: string };

const PLACEMENT_STATUS: Record<Placement["outcome"], Row["status"]> = {
  placed: { tone: "for", text: "Placed" },
  "client-rejected": { tone: "against", text: "Client passed" },
  withdrew: { tone: "quiet", text: "Withdrew" },
};

type Source = {
  matches: WithId<Match>[];
  overrides: WithId<Override>[];
  placements: WithId<Placement>[];
  roles: WithId<Role>[];
  companies: WithId<Company>[];
};

/** Past suggestions (with the recruiter's decision and own words), plus placements, newest first. */
export function historyRows({ matches, overrides, placements, roles, companies }: Source): Row[] {
  const role = (id: string) => roles.find((r) => r.id === id);
  const company = (r?: Role) => companies.find((c) => c.id === r?.companyId)?.name;
  const rows: Row[] = matches.map((m) => {
    // A reversed decision is no longer a decision: the suggestion is waiting again.
    const ov = overrides.find((o) => o.matchId === m.id && !o.reversedAt);
    const r = role(m.roleId);
    return ov
      ? {
          key: m.id, at: ov.decidedAt, role: r, companyName: company(r),
          status: ov.decision === "shortlist" ? { tone: "for", text: "Shortlisted" } : { tone: "against", text: "Not this one" },
          body: `You said: “${ov.reasonText}”`,
        }
      : {
          key: m.id, at: m.generatedAt, role: r, companyName: company(r),
          status: { tone: "accent", text: `Suggested ${ordinal(m.rank)}` },
          body: "Waiting for your decision.",
        };
  });
  for (const p of placements) {
    const r = role(p.roleId);
    rows.push({ key: p.id, at: p.date, role: r, companyName: company(r) ?? companies.find((c) => c.id === p.companyId)?.name, status: PLACEMENT_STATUS[p.outcome], body: p.reason });
  }
  return rows.sort((a, b) => b.at.getTime() - a.at.getTime());
}

const isToday = (d: Date, now: Date) => d.toDateString() === now.toDateString();

export function MatchHistory({ rows, now }: { rows: Row[]; now: Date }) {
  return (
    <Card className={styles.history} role="region" aria-labelledby="history-title">
      <header className={styles.panelHead}>
        <h2 id="history-title" className="t-title">Match history</h2>
        {rows.length > 0 && <Count n={rows.length} one="role" many="roles" />}
      </header>
      {rows.length ? (
        <ul className={styles.historyList}>
          {rows.map((r) => (
            <li key={r.key} className={styles.historyRow}>
              <p className="t-body-m-strong">{r.role?.title ?? "Role no longer available"}</p>
              <p className="t-caption">
                <span className={`${styles[`tone_${r.status.tone}`]} t-body-s-strong`}>{r.status.text}</span>
                {" · "}
                {[r.companyName, isToday(r.at, now) ? "today" : fmtDate(r.at)].filter(Boolean).join(" · ")}
              </p>
              <p className={`${styles.historyBody} t-body-s-para`}>{r.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-body-s-para">Not suggested for a role yet.</p>
      )}
    </Card>
  );
}
