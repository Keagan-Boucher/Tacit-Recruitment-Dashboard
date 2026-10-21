import { useId, useRef, useState } from "react";
import { Link } from "react-router";
import type { Candidate, Company, MatchResponse } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { buttonClass, Button, Card, ErrorBanner, Icon, Input, Radio } from "../../components";
import { useAuth } from "../../features/auth";
import { BriefPicker, createRoleFromBrief } from "../../features/brief";
import type { InterpretedBrief } from "../../features/brief";
import { api } from "../../lib/api";
import { useOwned } from "../../lib/data";
import { companyFields, defaultCompany, type Hand } from "./company";
import { Results } from "./Results";
import styles from "./BriefIntake.module.css";

type Run = "idle" | "saving" | "matching" | "failed-save" | "failed-match" | "done";
const byName = (a: Company, b: Company) => a.name.localeCompare(b.name);

/** The four-point star: "Tacit is working". */
function Sparkle() {
  return (
    <svg className={styles.spark} width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
      <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
    </svg>
  );
}

/** S05: bring a brief in, see what Tacit understood, open the role and check everyone against it. */
export default function BriefIntake() {
  const state = useScreenState();
  const uid = useAuth().user?.uid;
  const companies = useOwned<Company>("companies", undefined, byName);
  const candidates = useOwned<Candidate>("candidates");
  const groupName = useId();
  const companyId = useId();
  // The role made for this exact brief, company and title, so Try again and Edit brief never make a second one.
  const created = useRef<{ key: string; roleId: string } | null>(null);

  const [brief, setBrief] = useState<InterpretedBrief | null>(null);
  // What the recruiter set by hand since the brief was read; it wins over the brief's own company.
  const [hand, setHand] = useState<Hand>({});
  const [title, setTitle] = useState("");
  const [run, setRun] = useState<Run>("idle");
  const [roleId, setRoleId] = useState<string | null>(null);

  const people = candidates.data ?? [];
  const working = run === "saving" || run === "matching" || state === "ai-working";
  const failed = run === "failed-save" || run === "failed-match" || state === "ai-failed";
  const showResults = (run === "done" && roleId) || state === "results";
  // Derived each render, so a company list that finishes loading after the brief still finds the match.
  const auto = defaultCompany(brief?.result.companyName, companies.data);
  const { mode, existing, newName } = companyFields(hand, auto);
  const company = mode === "existing" ? existing : newName.trim();
  const ready = !!brief && !!title.trim() && !!company && !working;

  function interpreted(b: InterpretedBrief) {
    setBrief(b);
    setTitle(b.result.title?.trim() ?? "");
    setHand({});
    setRun("idle");
  }

  async function find() {
    if (!ready || !uid || !brief) return;
    const key = [brief.briefText, mode, company, title.trim()].join("\u0000");
    let id = created.current?.key === key ? created.current.roleId : null;
    if (!id) {
      setRun("saving");
      try {
        id = await createRoleFromBrief({ uid, brief, title, company: mode === "existing" ? { id: existing } : { name: newName } });
        created.current = { key, roleId: id };
      } catch {
        setRun("failed-save");
        return;
      }
    }
    setRoleId(id);
    setRun("matching");
    try {
      await api<MatchResponse>("/api/match", { roleId: id });
      setRun("done");
    } catch {
      setRun("failed-match");
    }
  }

  const resultsId = roleId ?? (state === "results" ? "role_demo_fico" : null);
  return (
    <>
      {showResults && resultsId && (
        <Results roleId={resultsId} people={people} unclear={brief?.result.unclear} onEdit={() => setRun("idle")} />
      )}
      {/* Stays mounted behind the results so the recruiter's words survive Edit brief and every failure. */}
      <div hidden={!!showResults}>
        <PageHeader
          headline="Paste a brief."
          actions={<Link to="/roles" className={buttonClass("ghost", false, "lg")}><Icon name="bx-history" />Recent briefs</Link>}
        />
        <div className={styles.grid}>
          <BriefPicker onInterpreted={interpreted} initialSource={state === "upload" ? "upload" : "paste"} />

          <Card className={styles.where} role="region" aria-labelledby={`${groupName}-t`}>
            <h2 id={`${groupName}-t`} className="t-title">Where does it go?</h2>
            <fieldset className={styles.options}>
              <legend className="sr-only">Where does it go?</legend>
              <Radio className={styles.tile} name={groupName} checked={mode === "existing"} onChange={() => setHand((h) => ({ ...h, mode: "existing" }))} disabled={working}>
                Open a role for an existing company
              </Radio>
              <Radio className={styles.tile} name={groupName} checked={mode === "new"} onChange={() => setHand((h) => ({ ...h, mode: "new" }))} disabled={working}>
                Open a role for a new company
              </Radio>
            </fieldset>

            {mode === "existing" ? (
              <div className={styles.field}>
                <label htmlFor={companyId} className={`${styles.fieldLabel} t-body-s-strong`}>Company</label>
                <div className={styles.selectWrap}>
                  <Icon name="bx-buildings" size={18} />
                  <select id={companyId} className={`${styles.select} t-body-m`} value={existing} disabled={working} onChange={(e) => setHand((h) => ({ ...h, existing: e.target.value }))}>
                    <option value="">Choose a company</option>
                    {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Icon name="bx-chevron-down" size={18} />
                </div>
              </div>
            ) : (
              <Input label="Company" value={newName} readOnly={working} leading={<Icon name="bx-buildings" size={18} />} onChange={(e) => setHand((h) => ({ ...h, newName: e.target.value }))} />
            )}
            <Input label="Role" value={title} readOnly={working} leading={<Icon name="bx-briefcase" size={18} />} placeholder={brief ? "" : "Read the brief first"} onChange={(e) => setTitle(e.target.value)} />

            {/* One announcement each: the live region holds the working line; the error banner is its own status. */}
            <div aria-live="polite" className={styles.live}>
              {working && (
                <p className={`${styles.say} t-body-s`}>
                  <Sparkle />
                  {run === "saving"
                    ? "Saving the role…"
                    : `Checking ${people.length || "everyone"} ${people.length === 1 ? "person" : "people"} against the brief…`}
                </p>
              )}
            </div>
            {failed && (
              <ErrorBanner
                title={run === "failed-save" ? "Couldn’t save the role." : "Couldn’t read the matches reliably."}
                detail={run === "failed-save" ? "Your brief is still here." : "Your brief and the role are saved."}
                onRetry={find}
              />
            )}
            <Button variant="primary" size="lg" fullWidth icon="bx-search" disabled={!ready} onClick={find}>
              Find people
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
