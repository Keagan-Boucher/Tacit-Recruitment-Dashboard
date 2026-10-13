import { useEffect, type ReactNode } from "react";
import { Link, useRouteError } from "react-router";
import { Button, buttonClass, Icon } from "../../components";
import styles from "./NotFound.module.css";

type Props = {
  /** Render as its own page (no shell around it): used when the shell itself failed. */
  standalone?: boolean;
  figure: string;
  message: string;
  actions: ReactNode;
};

function Layout({ standalone, figure, message, actions }: Props) {
  const Tag = standalone ? "main" : "div";
  return (
    <Tag className={standalone ? `${styles.page} ${styles.standalone}` : styles.page}>
      <section className={styles.block}>
        <p className={`t-display-xl ${styles.figure}`}>{figure}</p>
        <p className={`t-note ${styles.message}`}>{message}</p>
        <div className={styles.actions}>{actions}</div>
      </section>
    </Tag>
  );
}

const home = (variant: "primary" | "ghost") => (
  <Link to="/" className={buttonClass(variant)}>
    <Icon name="bx-left-arrow-alt" />
    Back to dashboard
  </Link>
);

/** S16: unknown path. */
export default function NotFound() {
  return <Layout figure="404" message="This link is out of date, or the record was removed." actions={home("primary")} />;
}

/** S16 error variant: route `errorElement`. No stack trace on screen; the error goes to the console in DEV only. */
export function RouteError({ standalone = false }: { standalone?: boolean }) {
  const error = useRouteError();
  useEffect(() => {
    if (import.meta.env.DEV) console.error(error);
  }, [error]);
  return (
    <Layout
      standalone={standalone}
      figure="Oops"
      message="This screen stopped working. Nothing was lost: notes are saved before anything else runs."
      actions={
        <>
          <Button variant="primary" icon="bx-refresh" onClick={() => window.location.reload()}>
            Try again
          </Button>
          {home("ghost")}
        </>
      }
    />
  );
}
