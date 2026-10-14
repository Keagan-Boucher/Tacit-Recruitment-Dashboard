import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { UserPrefs } from "@tacit/shared";
import { PageHeader } from "../../app";
import { Button, buttonClass, Card, Chip, ErrorBanner, Icon, Radio, Toggle, type ChipTone } from "../../components";
import { signOut, useAuth } from "../../features/auth";
import { usePrefs } from "../../features/prefs";
import { aiStatus, fetchHealth, type AiStatus, type Health } from "./health";
import styles from "./Settings.module.css";

/** Decorative sketch of the app in one theme. data-theme re-scopes the tokens, so it shows that theme whatever the page is. */
function Mock({ theme, className }: { theme: "dark" | "light"; className?: string }) {
  return (
    <div data-theme={theme} className={[styles.mock, className].filter(Boolean).join(" ")} aria-hidden="true">
      <i className={styles.side} />
      <i className={styles.title} />
      <i className={styles.hero} />
      <i className={styles.t1} />
      <i className={styles.t2} />
      <i className={styles.t3} />
      <i className={styles.t4} />
    </div>
  );
}

const THEMES: { value: UserPrefs["theme"]; label: string; preview: React.ReactNode }[] = [
  { value: "dark", label: "Dark", preview: <Mock theme="dark" /> },
  { value: "light", label: "Light", preview: <Mock theme="light" /> },
  {
    value: "system",
    label: "Match system",
    preview: (
      <div className={styles.split}>
        <Mock theme="dark" />
        <Mock theme="light" className={styles.half} />
      </div>
    ),
  },
];

const AI: Record<AiStatus, { word: string; tone: ChipTone; icon: string }> = {
  connected: { word: "Connected", tone: "accent", icon: "bx-check" },
  "not-configured": { word: "Not configured", tone: "stale", icon: "bx-error-circle" },
  unreachable: { word: "Unreachable", tone: "against", icon: "bx-error-circle" },
};

export default function Settings() {
  const { user } = useAuth();
  const { prefs, savePrefs } = usePrefs();
  const [failed, setFailed] = useState<Parameters<typeof savePrefs>[0] | null>(null);
  const [health, setHealth] = useState<{ h: Health | null; at: Date } | null>(null);
  const [check, setCheck] = useState(0);

  // savePrefs applies the change first, so a failed write keeps what the recruiter chose and offers a retry.
  async function save(partial: Parameters<typeof savePrefs>[0]) {
    setFailed(null);
    try {
      await savePrefs(partial);
    } catch {
      setFailed(partial);
    }
  }

  useEffect(() => {
    let live = true;
    void fetchHealth().then((h) => live && setHealth({ h, at: new Date() }));
    return () => {
      live = false;
    };
  }, [check]);

  const onBoard = prefs.dashboard.filter((w) => w.visible).length;
  const status = health && aiStatus(health.h);
  const ai = status && AI[status];

  return (
    <div className={styles.page}>
      <PageHeader
        headline="Settings"
        actions={
          <div className={styles.account}>
            <span className={`${styles.who} t-body-s`}>Signed in as {user?.displayName ?? user?.email}</span>
            <Button onClick={() => void signOut()}>Sign out</Button>
          </div>
        }
      />
      {failed && <ErrorBanner title="Couldn’t save that." detail="It's applied here; saving to your account didn't go through." onRetry={() => void save(failed)} />}

      <Card className={styles.appearance}>
        <h2 className="t-title">Appearance</h2>
        <fieldset role="radiogroup" className={styles.themes}>
          <legend className="sr-only">Theme</legend>
          {THEMES.map((t) => (
            <div key={t.value} className={styles.tile}>
              {t.preview}
              <Radio
                className={styles.pick}
                name="theme"
                value={t.value}
                checked={prefs.theme === t.value}
                onChange={() => void save({ theme: t.value })}
              >
                <span className={styles.label}>
                  {t.label}
                  {t.value === "dark" && <Chip tone="accent">Default</Chip>}
                </span>
              </Radio>
            </div>
          ))}
        </fieldset>
        <hr className={styles.rule} />
        <div className={styles.row}>
          <span className="t-body-m-strong">Reduce motion</span>
          <Toggle label="Reduce motion" checked={prefs.reduceMotion} onChange={(reduceMotion) => void save({ reduceMotion })} />
        </div>
      </Card>

      <div className={styles.cards}>
        <Card className={styles.panel}>
          <div>
            <h2 className="t-title">Dashboard widgets</h2>
            <p className={`${styles.dim} t-body-m`}>
              {onBoard} on your board, {prefs.dashboard.length - onBoard} on the shelf.
            </p>
          </div>
          <Link to="/widgets" className={`${buttonClass("ghost")} ${styles.push}`}>
            Manage widgets
            <Icon name="bx-chevron-right" size={16} />
          </Link>
        </Card>

        <Card className={styles.panel} aria-busy={!health}>
          <div className={styles.head}>
            <h2 className="t-title">AI</h2>
            <div aria-live="polite">{ai ? <Chip tone={ai.tone} size="lg" icon={ai.icon}>{ai.word}</Chip> : <Chip tone="quiet" size="lg">Checking</Chip>}</div>
          </div>
          <dl className={`${styles.facts} t-body-s`}>
            <dt>Last checked</dt>
            <dd>{health ? health.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "…"}</dd>
            <dt>Provider</dt>
            <dd>OpenAI-compatible, through the Tacit server</dd>
            <dt>Model</dt>
            <dd>{!health ? "…" : health.h?.model ?? (status === "connected" ? "Not reported" : "None")}</dd>
          </dl>
          {status === "unreachable" && (
            <Button icon="bx-refresh" className={styles.push} onClick={() => { setHealth(null); setCheck((n) => n + 1); }}>
              Check again
            </Button>
          )}
        </Card>

        <Card className={styles.panel}>
          <div>
            <h2 className="t-title">Synthetic data</h2>
            <p className={`${styles.dim} t-body-m-para`}>Replaces all records with the demo set. Your account stays.</p>
          </div>
          <div className={styles.push}>
            <Button icon="bx-refresh" disabled aria-describedby="reset-hint">
              Reset synthetic data
            </Button>
            <p id="reset-hint" className={`${styles.hint} t-body-s`}>Not available in the app. Run “npm run seed” to reset.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
