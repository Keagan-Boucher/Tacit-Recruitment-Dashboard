import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { UserPrefs } from "@tacit/shared";
import { Button, Card, Icon, SegmentedControl, Skeleton } from "../../components";
import { useAuth } from "../../features/auth";
import { usePrefs } from "../../features/prefs";
import { useCandidates } from "../../lib/data";
import { download } from "./download";
import { fetchRecord } from "./fetchRecord";
import type { Notify } from "./notify";
import { buildExport } from "./record";
import { pastRetention } from "./retention";
import styles from "./Settings.module.css";

const MONTHS = [12, 24, 36] as const;
const SHOWN = 5;
const seenOn = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });

/** S14 Data & privacy (recruiter only). Lists who is past the retention setting; it never deletes, the recruiter decides on S03. */
export function DataPrivacy({ save, onProblem, onToast }: Notify & { save: (p: Partial<UserPrefs>) => void }) {
  const { user } = useAuth();
  const { prefs } = usePrefs();
  const { data: people, error } = useCandidates();
  const [now] = useState(() => new Date());
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);
  const months = prefs.retentionMonths;
  const past = useMemo(() => people && pastRetention(people, months, now), [people, months, now]);
  const byName = useMemo(() => people && [...people].sort((a, b) => a.fullName.localeCompare(b.fullName)), [people]);

  async function exportRecord() {
    const candidate = people?.find((c) => c.id === picked);
    if (!candidate || !user) return;
    setBusy(true);
    try {
      download(buildExport(await fetchRecord(user.uid, candidate), new Date()));
      onToast(`Exported ${candidate.fullName}’s record`);
    } catch {
      onProblem({ title: "Couldn’t export that record.", detail: "Nothing was changed.", retry: () => void exportRecord() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={`${styles.card} ${styles.data}`}>
      <h2 className="t-title">Data &amp; privacy</h2>

      <div className={styles.retention}>
        <span className="t-body-m-strong">Keep people you have not seen for</span>
        <SegmentedControl
          label="Keep people you have not seen for"
          className={`${styles.seg} t-body-s`}
          options={MONTHS.map((m) => ({ value: String(m), label: `${m} months` }))}
          value={String(months)}
          onChange={(v) => save({ retentionMonths: Number(v) as UserPrefs["retentionMonths"] })}
        />
      </div>

      <div className={styles.past}>
        <p className="t-body-m" aria-live="polite">
          {error ? (
            <span className={styles.dim}>Couldn’t load your candidates.</span>
          ) : !past ? (
            <span className={styles.dim}>Checking who you haven’t seen.</span>
          ) : past.length === 0 ? (
            <span className={styles.dim}>Nobody is past {months} months.</span>
          ) : (
            <>
              <span className={`${styles.stale} t-body-m-strong`}>{past.length} {past.length === 1 ? "person" : "people"}</span>{" "}
              <span className={styles.dim}>not seen in {months} months. Open each one to keep or delete their record.</span>
            </>
          )}
        </p>
        {!past && !error && <Skeleton height={56} />}
        {past && past.length > 0 && (
          <ul className={styles.people}>
            {past.slice(0, SHOWN).map(({ person, seen, ago }) => (
              <li key={person.id}>
                <Link to={`/candidates/${person.id}`} className={styles.person}>
                  <span className={styles.personText}>
                    <span className="t-body-m-strong">{person.fullName}</span>
                    <span className={`${styles.sub} t-caption`}>Last seen {seenOn(seen)} · {ago} months ago</span>
                  </span>
                  <Icon name="bx-chevron-right" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {past && past.length > SHOWN && <p className={`${styles.dim} t-body-s`}>and {past.length - SHOWN} more</p>}
      </div>

      <hr className={styles.rule} />
      <div className={styles.line}>
        <div className={styles.lineText}>
          <h3 className="t-body-m-strong">Export a candidate’s record</h3>
          <p className={`${styles.sub} t-caption`}>Their profile, facts, notes, overrides and placements, as a JSON file.</p>
        </div>
        <div className={styles.select}>
          <select aria-label="Candidate to export" value={picked} data-empty={!picked || undefined} className="t-body-m" onChange={(e) => setPicked(e.target.value)}>
            <option value="" disabled>Choose a person</option>
            {byName?.map((c) => (
              <option key={c.id} value={c.id}>{c.fullName}</option>
            ))}
          </select>
          <Icon name="bx-chevron-down" size={18} />
        </div>
        <Button disabled={!picked || busy} onClick={() => void exportRecord()}>Export</Button>
      </div>

      <hr className={styles.rule} />
      <div className={styles.line}>
        <div className={styles.lineText}>
          <h3 className="t-body-m-strong">Synthetic data</h3>
          <p id="reset-hint" className={`${styles.sub} t-caption`}>Replaces all records with the demo set. Your account stays. Not available in the app: run “npm run seed”.</p>
        </div>
        <Button icon="bx-refresh" disabled aria-describedby="reset-hint">Reset synthetic data</Button>
      </div>
    </Card>
  );
}
