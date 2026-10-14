import { useId, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { Company, Placement, Role } from "@tacit/shared";
import { PageHeader, useScreenState } from "../../app";
import { Button, buttonClass, Card, ErrorBanner, FieldError, Icon, Input, Skeleton } from "../../components";
import { useAuth } from "../../features/auth";
import { BriefPicker, createRoleFromBrief } from "../../features/brief";
import type { InterpretedBrief } from "../../features/brief";
import { useOwned } from "../../lib/data";
import { budgetFrom, digits, rand, validate } from "./form";
import styles from "./RoleForm.module.css";

const NEW = "__new";
const byName = (a: Company, b: Company) => a.name.localeCompare(b.name);
const byDate = (a: Placement, b: Placement) => b.date.getTime() - a.date.getTime();
const OUTCOME = { placed: "Placed", "client-rejected": "Client said no", withdrew: "Withdrew" } as const;
const month = (d: Date) => d.toLocaleDateString("en-ZA", { month: "short", year: "numeric" });

const NEXT = [
  "Tacit saves the role with your brief and budget.",
  "On the next screen, Find matches checks everyone you have met against it.",
  "You shortlist or pass on each person. Nothing is decided for you.",
];

/** S13: the slower way to open a role: title, company, the brief and a budget, then on to its match view. */
export default function RoleForm() {
  const state = useScreenState();
  const navigate = useNavigate();
  const uid = useAuth().user?.uid;
  const companies = useOwned<Company>("companies", undefined, byName);
  const roles = useOwned<Role>("roles");
  const titleId = useId();
  const companyId = useId();
  const companyErr = useId();
  const newId = useId();

  const [brief, setBrief] = useState<InterpretedBrief | null>(null);
  const [title, setTitle] = useState("");
  const [params] = useSearchParams();
  const [pick, setPick] = useState(params.get("companyId") ?? ""); // a company id, or NEW; S11 "Open a role" preselects
  const [newName, setNewName] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [tried, setTried] = useState(state === "validation-error");
  const [run, setRun] = useState<"idle" | "saving" | "failed">("idle");

  const company = pick === NEW ? newName : pick;
  const errors = validate({ title, company, hasBrief: !!brief, min, max });
  const shown = tried ? errors : {};
  const saving = run === "saving";
  const picked = companies.data?.find((c) => c.id === pick);
  const history = useOwned<Placement>("placements", ["companyId", picked?.id], byDate);

  function interpreted(b: InterpretedBrief) {
    setBrief(b);
    setTitle(b.result.title?.trim() ?? "");
    const name = b.result.companyName?.trim() ?? "";
    const known = companies.data?.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (pick) { /* a company chosen already (or preselected from S11) wins over the brief */ }
    else if (known) setPick(known.id);
    else if (name) {
      setPick(NEW);
      setNewName(name);
    }
    const { min: lo, max: hi } = b.result.budget;
    setMin(lo ? String(lo) : "");
    setMax(hi ? String(hi) : "");
    setRun("idle");
  }

  async function save() {
    setTried(true);
    // Take the recruiter to the first field that needs them; the brief's message sits beside the button.
    const bad = errors.title ? titleId : errors.company ? (pick === NEW ? newId : companyId) : null;
    if (bad) document.getElementById(bad)?.focus();
    if (!brief || !uid || Object.keys(errors).length) return;
    setRun("saving");
    try {
      const withBudget = { ...brief, result: { ...brief.result, budget: budgetFrom(min, max, brief.result.budget) } };
      const id = await createRoleFromBrief({ uid, brief: withBudget, title, company: pick === NEW ? { name: newName } : { id: pick } });
      void navigate(`/roles/${id}`);
    } catch {
      setRun("failed");
    }
  }

  return (
    <>
      <PageHeader context="Roles" headline="Open a role." />
      <div className={styles.grid}>
        <div className={styles.main}>
          <BriefPicker onInterpreted={interpreted} initialSource={state === "upload" ? "upload" : "paste"} />

          <Card className={styles.form} role="region" aria-labelledby={`${titleId}-h`}>
            <h2 id={`${titleId}-h`} className="t-title">The role</h2>
            <div className={styles.row}>
              <Input
                id={titleId}
                label="Role title"
                value={title}
                readOnly={saving}
                error={shown.title}
                aria-required="true"
                onChange={(e) => setTitle(e.target.value)}
              />
              <div className={styles.field}>
                <label htmlFor={companyId} className={`${styles.label} t-body-s-strong`}>Company</label>
                <div className={`${styles.selectWrap} ${shown.company ? styles.invalid : ""}`}>
                  <Icon name="bx-buildings" size={18} />
                  <select
                    id={companyId}
                    className={`${styles.select} t-body-m`}
                    value={pick}
                    disabled={saving}
                    aria-required="true"
                    aria-invalid={shown.company ? true : undefined}
                    aria-describedby={shown.company ? companyErr : undefined}
                    onChange={(e) => setPick(e.target.value)}
                  >
                    <option value="">Choose a company</option>
                    {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value={NEW}>Add a new company</option>
                  </select>
                  <Icon name="bx-chevron-down" size={18} />
                </div>
                <div id={companyErr} aria-live="polite">{shown.company && pick !== NEW && <FieldError>{shown.company}</FieldError>}</div>
              </div>
            </div>

            {pick === NEW && (
              <Input id={newId} label="New company name" value={newName} readOnly={saving} error={shown.company} onChange={(e) => setNewName(e.target.value)} leading={<Icon name="bx-buildings" size={18} />} />
            )}

            <fieldset className={styles.band}>
              <legend className={`${styles.label} t-body-s-strong`}>
                Salary band (Rand)<span className={`${styles.note} t-caption`}>a month, before tax</span>
              </legend>
              <div className={styles.pair}>
                <Input label="Salary from" hideLabel inputMode="numeric" placeholder="R75 000" value={rand(min)} readOnly={saving} onChange={(e) => setMin(digits(e.target.value))} />
                <span className="t-body-s">to</span>
                <Input label="Salary to" hideLabel inputMode="numeric" placeholder="R85 000" value={rand(max)} readOnly={saving} error={shown.budget} onChange={(e) => setMax(digits(e.target.value))} />
              </div>
            </fieldset>

            <div aria-live="polite" className={styles.live}>
              {shown.brief && <FieldError>{shown.brief}</FieldError>}
              {run === "failed" && <ErrorBanner title="Couldn’t save the role." detail="Nothing was saved. Your brief is still here." onRetry={save} />}
            </div>

            <div className={styles.footer}>
              <Link to="/roles" className={buttonClass("ghost")}>Cancel</Link>
              <Button variant="primary" icon="bx-check" disabled={saving} onClick={save}>
                {saving ? "Saving…" : "Save role"}
              </Button>
            </div>
          </Card>
        </div>

        <div className={styles.side}>
          <Card>
            <h2 className="t-body-m-strong">What happens next</h2>
            <ol className={`${styles.next} t-body-s-para`}>
              {NEXT.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </Card>

          <Card aria-live="polite">
            <h2 className="t-body-m-strong">{picked ? `${picked.name}, last placements` : "Last placements"}</h2>
            {!picked ? (
              <p className={`${styles.quiet} t-body-s`}>Choose an existing company to see who it has hired.</p>
            ) : !history.data ? (
              <Skeleton height={48} />
            ) : history.data.length === 0 ? (
              <p className={`${styles.quiet} t-body-s`}>No placements with {picked.name} yet.</p>
            ) : (
              <ul className={styles.hist}>
                {history.data.slice(0, 3).map((p) => (
                  <li key={p.id} className={styles.placement}>
                    <span className={`${styles.pTitle} t-body-s-strong`}>{roles.data?.find((r) => r.id === p.roleId)?.title ?? "A role"}</span>
                    <span className="t-body-s">{OUTCOME[p.outcome]}</span>
                    <span className={`${styles.quiet} t-caption`}>{month(p.date)}</span>
                    {p.reason && <span className={`${styles.reason} ${styles.quiet} t-caption`}>{p.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
