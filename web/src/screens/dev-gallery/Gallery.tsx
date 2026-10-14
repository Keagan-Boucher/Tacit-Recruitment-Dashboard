// Dev-only component gallery at /dev/components: every base component and variant, Dark / Light switch.
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  ErrorBanner,
  FieldError,
  FilterChip,
  Input,
  ListRow,
  PasswordInput,
  RadioGroup,
  SegmentedControl,
  Skeleton,
  Textarea,
  Toast,
  ToastRegion,
  Toggle,
  WidgetCard,
} from "../../components";
import { useAuth } from "../../features/auth";
import { BriefPicker } from "../../features/brief";
import styles from "./Gallery.module.css";

const REASONS = [
  "Salary above budget",
  "Seniority does not fit",
  "Location does not work",
  "Missing a must-have skill",
  "Not looking right now",
  "Client turned them down before",
  "Something else",
].map((label) => ({ value: label, label }));

const SIZES = ["1×1", "2×1", "2×2"].map((label) => ({ value: label, label }));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className="t-title">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children, stack }: { label: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={styles.row}>
      <p className={`${styles.rowLabel} t-caption`}>{label}</p>
      <div className={stack ? styles.stack : styles.inline}>{children}</div>
    </div>
  );
}

export default function Gallery() {
  const [theme, setTheme] = useState<"dark" | "light">(
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  useEffect(() => {
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = theme;
    return () => {
      if (prev === undefined) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = prev;
    };
  }, [theme]);

  const [filter, setFilter] = useState("all");
  const [reason, setReason] = useState<string | null>(null);
  const [reasonTried, setReasonTried] = useState(false);
  const [theme3, setTheme3] = useState("dark");
  const [size, setSize] = useState("2×1");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [toast, setToast] = useState(false);
  const [pw, setPw] = useState("");
  const { user, loading: authLoading } = useAuth();

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <h1 className="t-headline">Components</h1>
        <SegmentedControl
          label="Theme"
          value={theme}
          onChange={(v) => setTheme(v === "light" ? "light" : "dark")}
          options={[
            { value: "dark", label: "Dark" },
            { value: "light", label: "Light" },
          ]}
        />
      </header>

      <Section title="Buttons">
        <Row label="Primary, ghost, on-lime, disabled">
          <Button variant="primary" icon="bx-plus">New interview note</Button>
          <Button icon="bx-search">Search everyone</Button>
          <Button icon="bx-refresh">Reset to default</Button>
          <Button iconAfter="bx-chevron-right">Manage widgets</Button>
          <Button variant="primary" disabled>Record decision</Button>
          <Button disabled>Cancel</Button>
          <span className={styles.lime}>
            <Button variant="on-lime" iconAfter="bx-chevron-right">See the full case</Button>
          </span>
        </Row>
        <Row label="Full width (sign in)">
          <div className={styles.narrow}>
            <Button variant="primary" size="lg" fullWidth iconAfter="bx-chevron-right">Sign in</Button>
          </div>
        </Row>
      </Section>

      <Section title="Chips">
        <Row label="Outlined: for, against, stale, neutral, quiet, accent, low confidence">
          <Chip tone="for">For · 3</Chip>
          <Chip tone="against">Against · 2</Chip>
          <Chip tone="stale">Stale · 14 mo</Chip>
          <Chip>Not opened in 14 months</Chip>
          <Chip tone="quiet">SAP FI</Chip>
          <Chip tone="accent">7 new</Chip>
          <Chip icon="bx-error-circle">Low confidence</Chip>
        </Row>
        <Row label="On lime">
          <span className={`${styles.lime} ${styles.inline}`}>
            <Chip tone="stale" onLime size="lg">Stale · 14 mo</Chip>
            <Chip tone="for" onLime size="lg">For · 3</Chip>
            <Chip tone="against" onLime size="lg">Against · 2</Chip>
            <Chip onLime icon="bx-error-circle">Check this</Chip>
          </span>
        </Row>
        <Row label="Filter chips (toggle, aria-pressed)">
          <FilterChip selected={filter === "all"} count={214} onClick={() => setFilter("all")}>All</FilterChip>
          <FilterChip selected={filter === "six"} count={38} onClick={() => setFilter("six")}>Not opened in 6 months</FilterChip>
          <FilterChip selected={filter === "stale"} count={41} onClick={() => setFilter("stale")}>Stale evidence</FilterChip>
          <FilterChip selected={filter === "cv"} count={2} onClick={() => setFilter("cv")}>CV needs checking</FilterChip>
        </Row>
      </Section>

      <Section title="Inputs">
        <div className={styles.grid3}>
          <Input label="Email" type="email" defaultValue="naledi.mokoena@tacit.test" />
          <Input label="Email" type="email" defaultValue="naledi.mokoena@tacit.test" error="That email and password don’t match." />
          <PasswordInput label="Password" placeholder="Enter your password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Input
            label="Search"
            hideLabel
            size="sm"
            placeholder="Search by name, skill or anything in a note"
            leading={<i className="bx bx-search" aria-hidden="true" />}
          />
          <Textarea label="In your words" note="Optional" placeholder="What should you remember about this next time?" />
          <Textarea label="In your words" placeholder="What should you remember about this next time?" error="Add a reason so you remember why next time." />
        </div>
        <Row label="Bare error message">
          <FieldError>Add a reason so you remember why next time.</FieldError>
        </Row>
      </Section>

      <Section title="Toggle, radio, segmented">
        <Row label="Toggle (switch)">
          <Toggle checked={on} onChange={setOn} label="Show Someone you forgot" showWord />
          <Toggle checked={off} onChange={setOff} label="Show Recent notes" showWord />
          <Toggle checked={off} onChange={setOff} label="Reduce motion" />
          <Toggle checked label="Disabled on" onChange={() => undefined} disabled />
        </Row>
        <Row label="Radio group">
          <RadioGroup
            legend="Appearance"
            value={theme3}
            onChange={setTheme3}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
              { value: "system", label: "Match system" },
            ]}
          />
        </Row>
        <Row label="Segmented control (size)">
          <SegmentedControl label="Size for Someone you forgot" value={size} onChange={setSize} options={SIZES} />
        </Row>
      </Section>

      <Section title="Cards and rows">
        <div className={styles.grid3}>
          <WidgetCard title="Roles to shortlist" count={4} onMenu={() => undefined} seeAll={{ count: 6, href: "#" }}>
            <ListRow compact chevron={false} title="SAP FICO consultant (S/4HANA)" meta="Vantage Logistics" chips={<Chip tone="accent">7 new</Chip>} />
            <ListRow compact chevron={false} title="Oracle Financials analyst" meta="Karoo Health Systems" chips={<Chip tone="accent">4 new</Chip>} />
          </WidgetCard>
          <WidgetCard title="Someone you forgot" tone="accent" onMenu={() => undefined}>
            <span><Chip tone="stale" onLime size="lg">Stale · 14 mo</Chip></span>
            <p className="t-title">Sipho Mabaso</p>
          </WidgetCard>
          <Card>
            <p className="t-body-m-strong">Plain card</p>
          </Card>
        </div>
        <Row label="List rows, older rows fade" stack>
          <ListRow href="#" title="Thabo Nkosi" meta="Finance systems analyst, Durban" chips={<><Chip tone="quiet">SAP FI</Chip><Chip tone="quiet">S/4HANA</Chip></>}>
            <span className="t-body-s">this week</span>
          </ListRow>
          <ListRow onClick={() => undefined} fade={1} title="Johan Pretorius" meta="SAP finance solution architect, Centurion" chips={<Chip tone="quiet">Architecture</Chip>}>
            <span className="t-body-s">5 mo ago</span>
          </ListRow>
          <ListRow onClick={() => undefined} fade={2} title="Sipho Mabaso" meta="SAP support lead, Cape Town" chips={<Chip tone="stale">Stale · 14 mo</Chip>}>
            <span className="t-body-s">14 mo ago</span>
          </ListRow>
        </Row>
      </Section>

      <Section title="Dialog and toast">
        <Row label="Native dialog (Escape closes, focus returns to the button)">
          <Button onClick={() => setDialog(true)}>Open override dialog</Button>
          <Button onClick={() => setToast((t) => !t)}>{toast ? "Hide" : "Show"} toast</Button>
        </Row>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          eyebrow="SAP FICO consultant (S/4HANA) · Vantage Logistics"
          title="Not this one: Sipho Mabaso"
          description="Your reason is recorded on Sipho’s profile and on Vantage Logistics’ hiring history."
          footer={
            <>
              <Button onClick={() => setDialog(false)}>Cancel</Button>
              <Button variant="primary" disabled={!reason} onClick={() => { setReasonTried(false); setDialog(false); }}>Record decision</Button>
            </>
          }
        >
          <RadioGroup
            legend="Reason"
            note="Required"
            variant="chip"
            value={reason}
            onChange={(v) => { setReason(v); setReasonTried(true); }}
            options={REASONS}
            error={reasonTried && !reason ? "Add a reason so you remember why next time." : undefined}
          />
          <Textarea label="In your words" placeholder="What should you remember about this next time?" />
        </Dialog>
        <ToastRegion>
          {toast && <Toast message="Moved to Not this one." action={{ label: "Undo", onClick: () => setToast(false) }} onDismiss={() => setToast(false)} />}
        </ToastRegion>
      </Section>

      <Section title="Brief picker">
        {authLoading ? null : user ? (
          <BriefPicker onInterpreted={console.log} />
        ) : (
          <p className="t-body-s">Sign in to try the brief picker: it uploads to your Storage folder and calls the proxy.</p>
        )}
      </Section>

      <Section title="States">
        <Row label="Error banner" stack>
          <ErrorBanner title="Couldn’t load today’s list." detail="Nothing was lost. Showing what loaded at 08:12." onRetry={() => undefined} />
        </Row>
        <Row label="Empty state">
          <Card>
            <EmptyState message="Paste a client brief to see who fits." action={<Button icon="bx-file">Paste a brief</Button>} />
          </Card>
        </Row>
        <Row label="Skeleton on lime" stack>
          <Card tone="accent">
            <div className={styles.skeletons}>
              <Skeleton width={120} height={22} radius="pill" tone="lime" />
              <Skeleton height={44} tone="lime" />
              <Skeleton width={200} height={14} tone="lime" />
            </div>
          </Card>
        </Row>
        <Row label="Skeletons (loading)" stack>
          <Card>
            <div className={styles.skeletons}>
              <Skeleton width={160} height={18} />
              <Skeleton height={53} />
              <Skeleton height={53} />
              <div className={styles.inline}>
                <Skeleton width={72} height={22} radius="pill" tone={3} />
                <Skeleton width={96} height={22} radius="pill" tone={3} />
              </div>
            </div>
          </Card>
        </Row>
      </Section>
    </div>
  );
}
