import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { IconButton } from "./IconButton";
import { Icon } from "./Icon";
import styles from "./Card.module.css";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** accent = the lime hero card. */
  tone?: "default" | "accent";
  children: ReactNode;
};

/** Flat surface card: hairline, widget radius, 18/20/20 padding. */
export function Card({ tone = "default", className, children, ...rest }: CardProps) {
  return (
    <div className={[styles.card, tone === "accent" && styles.accent, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

type WidgetCardProps = {
  title: string;
  /** Number shown at the right of the title row. */
  count?: number;
  /** "See all N" link at the foot. Give href for a link or onClick for a button. */
  seeAll?: { count: number; href?: string; onClick?: () => void };
  /** Shows the hover/focus-only overflow button; wire it to open the widget menu. */
  onMenu?: () => void;
  tone?: "default" | "accent";
  className?: string;
  children?: ReactNode;
};

/** Dashboard widget: title 14 Medium, optional count, content, optional "See all N", overflow menu on hover/focus. */
export function WidgetCard({ title, count, seeAll, onMenu, tone = "default", className, children }: WidgetCardProps) {
  const id = useId();
  const seeAllContent = seeAll && (
    <>
      See all {seeAll.count}
      <Icon name="bx-chevron-right" size={16} />
    </>
  );
  return (
    <section
      aria-labelledby={id}
      className={[styles.card, styles.widget, tone === "accent" && styles.accent, className].filter(Boolean).join(" ")}
    >
      <header className={styles.header}>
        <h2 id={id} className={`${styles.title} t-body-m-strong`}>
          {title}
        </h2>
        {count !== undefined && <span className={`${styles.count} t-body-m-strong tabular`}>{count}</span>}
        {onMenu && (
          <IconButton
            icon="bx-dots-horizontal-rounded"
            label={`More actions for ${title}`}
            className={styles.menu}
            onClick={onMenu}
          />
        )}
      </header>
      <div className={styles.body}>{children}</div>
      {seeAll &&
        (seeAll.href ? (
          <a className={`${styles.seeAll} t-body-s-strong`} href={seeAll.href} onClick={seeAll.onClick}>
            {seeAllContent}
          </a>
        ) : (
          <button type="button" className={`${styles.seeAll} t-body-s-strong`} onClick={seeAll.onClick}>
            {seeAllContent}
          </button>
        ))}
    </section>
  );
}
