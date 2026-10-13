import { PageHeader } from "./PageHeader";
import { useDevOverlay, useScreenState } from "./dev";
import styles from "./Placeholder.module.css";

/** Stand-in until a screen is built: replace its element in routes.tsx. */
export function Placeholder({ id, title }: { id: string; title: string }) {
  const state = useScreenState();
  const dialog = useDevOverlay("dialog");
  const palette = useDevOverlay("palette");
  return (
    <>
      <PageHeader context={id} headline={title} />
      {import.meta.env.DEV ? (
        <p className={`t-body-s ${styles.dev}`}>
          state: {state}
          {dialog ? ` · dialog: ${dialog}` : ""}
          {palette ? ` · palette: ${palette}` : ""}
        </p>
      ) : null}
    </>
  );
}
