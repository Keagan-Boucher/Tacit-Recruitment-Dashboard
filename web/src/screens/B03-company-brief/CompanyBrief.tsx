import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { PageHeader } from "../../app";
import { devParam } from "../../app/dev";
import { Button, buttonClass, Card, ErrorBanner, FieldError, Icon, Input, Skeleton, Textarea } from "../../components";
import { BriefPicker, type InterpretedBrief } from "../../features/brief";
import { RECRUITER_FIRST } from "../../features/portal/company";
import { draftFrom, sendProblem, unclearFields, validateDraft, type BriefDraft, type DraftErrors, type DraftKey } from "../../features/portal/companyBrief";
import { briefFixture } from "../../features/portal/companyFixtures";
import { sendBrief } from "../../features/portal/companyData";
import styles from "./CompanyBrief.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** Four-point star, the "Tacit is reading" mark. */
function Sparkle() {
  return (
    <svg className={styles.spark} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
      <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
    </svg>
  );
}

type Flag = { className?: string; "aria-describedby"?: string };

/** One field: outlined in `stale` with a reason while Tacit found nothing and nothing has been typed yet. */
function Cell({ k, unclear, wide, children }: { k: DraftKey; unclear: DraftKey[]; wide?: boolean; children: (flag: Flag) => ReactNode }) {
  const flagged = unclear.includes(k);
  return (
    <div className={cx(styles.cell, wide && styles.wide)}>
      {children(flagged ? { className: styles.flagged, "aria-describedby": `flag-${k}` } : {})}
      {flagged && (
        <p id={`flag-${k}`} className={`t-caption-strong ${styles.flag}`}>
          <Icon name="bx-error-circle" size={16} />
          Not in the brief. Add it if you know it.
        </p>
      )}
    </div>
  );
}

type View = "idle" | "working" | "failed";

export default function CompanyBrief() {
  const dev = devParam(useLocation().search, "state");
  const [brief, setBrief] = useState<InterpretedBrief | null>(() => (dev === "default" || dev === "sent" ? briefFixture() : null));
  const [draft, setDraft] = useState<BriefDraft | null>(() => (dev === "default" || dev === "sent" ? draftFrom(briefFixture().result) : null));
  const [view, setView] = useState<View>(dev === "ai-working" ? "working" : dev === "ai-failed" ? "failed" : "idle");
  const [errors, setErrors] = useState<DraftErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(dev === "sent");
  const [problem, setProblem] = useState<string | null>(null);
  const checkHeading = useRef<HTMLHeadingElement>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const retryRead = useRef<() => void>(() => {});
  // What Tacit read, to tell which fields are still unclear after the company has typed.
  const original = brief ? draftFrom(brief.result) : null;

  // The brief has been read, or sent: move focus to the new step's heading so it is announced.
  useEffect(() => {
    if (brief && !sent) checkHeading.current?.focus({ preventScroll: true });
  }, [brief, sent]);
  useEffect(() => {
    if (sent) sentHeading.current?.focus({ preventScroll: true });
  }, [sent]);

  function interpreted(r: InterpretedBrief) {
    setBrief(r);
    setDraft(draftFrom(r.result));
    setErrors({});
    setProblem(null);
    setView("idle");
  }

  /** The picker's read, live: the check card shows it working or failed. A dev ?state= keeps the view it was given. */
  function phased(phase: "idle" | "uploading" | "reading" | "error", retry: () => void) {
    if (dev !== null) return;
    retryRead.current = retry;
    setView(phase === "uploading" || phase === "reading" ? "working" : phase === "error" ? "failed" : "idle");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!brief || !draft || sending) return;
    const found = validateDraft(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      // first invalid control, in page order, once React has flagged it
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      await sendBrief(brief, draft, dev !== null);
      setSent(true);
    } catch (err) {
      const { code, status } = err as { code?: string; status?: number };
      setProblem(sendProblem(code, status));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <section className={styles.sent}>
        <span className={styles.tick} aria-hidden="true">
          <Icon name="bx-check" size={36} />
        </span>
        <h1 ref={sentHeading} tabIndex={-1} className="t-headline">Brief sent.</h1>
        <p className={`t-body-m-para ${styles.sentText}`}>
          {RECRUITER_FIRST} checks it within a working day. Once it is accepted the role opens, and her shortlist appears on your home page.
        </p>
        <Link to="/company" className={buttonClass("primary")}>Back to home</Link>
      </section>
    );
  }

  const unclear = original && draft ? unclearFields(original, draft) : [];
  const set = (key: DraftKey) => (e: { target: { value: string } }) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d));
  const cur = brief?.result.budget.currency;
  const sym = !cur || cur === "ZAR" ? "R" : cur;

  return (
    <div className={styles.page}>
      <PageHeader context="Roles / New brief" headline="Send a brief." actions={<Link to="/company" className={buttonClass("ghost")}>Cancel</Link>} />
      <div className={styles.layout}>
        <div className={styles.left}>
          <div>
            <BriefPicker modes={["paste", "upload"]} initialSource={dev === null ? "paste" : "upload"} onInterpreted={interpreted} showUnderstood={false} onPhase={phased} />
          </div>
          <div aria-live="polite">
            {brief && (
              <p className={`t-body-s-para ${styles.note}`}>
                <Sparkle />
                <span>Tacit read your brief to fill in the details. Check them before you send. {RECRUITER_FIRST} uses them to search everyone she has met.</span>
              </p>
            )}
          </div>
        </div>

        <Card className={styles.check} aria-busy={view === "working" || undefined}>
          <h2 ref={checkHeading} tabIndex={-1} className="t-title">Check what Tacit understood</h2>
          <p className={`t-body-s ${styles.quiet}`}>{RECRUITER_FIRST} sees this exactly as you send it.</p>

          <div aria-live="polite" className={styles.state}>
            {view === "working" && (
              <>
                <p className={`t-body-s ${styles.say}`}>
                  <Sparkle />
                  <span>Reading your brief and sorting it into screening order…</span>
                </p>
                <div className={styles.skeletons} aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={46} />)}
                </div>
              </>
            )}
            {view === "failed" && <ErrorBanner title="Couldn’t read this brief reliably." detail="Nothing was lost. Your brief is still here." onRetry={() => (dev === null ? retryRead.current() : setView("working"))} />}
            {view === "idle" && !brief && <p className={`t-body-m-para ${styles.quiet}`}>Add your brief on the left and choose Read brief. What Tacit understood shows here for you to check.</p>}
          </div>

          {brief && draft && view === "idle" && (
            <form ref={form} className={styles.formWrap} onSubmit={(e) => void submit(e)} noValidate>
              {brief.result.unclear.length > 0 && (
                <div className={styles.unclear}>
                  <Icon name="bx-error-circle" size={18} />
                  <div>
                    <p className="t-body-s-strong">Tacit wasn’t sure about</p>
                    <ul>
                      {brief.result.unclear.map((q) => (
                        <li key={q} className="t-body-s-para">{q}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <div className={styles.grid}>
                <Cell k="title" unclear={unclear} wide>{(f) => <Input {...f} label="Role title" value={draft.title} onChange={set("title")} error={errors.title} />}</Cell>
                <Cell k="workMode" unclear={unclear}>{(f) => <Input {...f} label="Work mode" value={draft.workMode} onChange={set("workMode")} />}</Cell>
                <Cell k="travel" unclear={unclear}>{(f) => <Input {...f} label="Travel" value={draft.travel} onChange={set("travel")} />}</Cell>
                <Cell k="budgetMin" unclear={unclear}>{(f) => <Input {...f} label={`Budget from (${sym})`} inputMode="numeric" value={draft.budgetMin} onChange={set("budgetMin")} />}</Cell>
                <Cell k="budgetMax" unclear={unclear}>{(f) => <Input {...f} label={`Budget to (${sym})`} inputMode="numeric" value={draft.budgetMax} onChange={set("budgetMax")} error={errors.budgetMax} />}</Cell>
                <Cell k="location" unclear={unclear} wide>{(f) => <Input {...f} label="Location" value={draft.location} onChange={set("location")} />}</Cell>
                <Cell k="mustHave" unclear={unclear}>{(f) => <Textarea {...f} label="Must have" note="One a line" rows={3} value={draft.mustHave} onChange={set("mustHave")} />}</Cell>
                <Cell k="niceToHave" unclear={unclear}>{(f) => <Textarea {...f} label="Nice to have" note="One a line" rows={3} value={draft.niceToHave} onChange={set("niceToHave")} />}</Cell>
                <Cell k="seniority" unclear={unclear}>{(f) => <Input {...f} label="Seniority" value={draft.seniority} onChange={set("seniority")} />}</Cell>
              </div>

              <div className={styles.footer}>
                <div aria-live="polite" className={styles.problem}>{problem && <FieldError>{problem}</FieldError>}</div>
                <Button type="submit" variant="primary" iconAfter="bx-chevron-right" disabled={sending} aria-busy={sending} className={styles.send}>
                  Send to {RECRUITER_FIRST}
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

