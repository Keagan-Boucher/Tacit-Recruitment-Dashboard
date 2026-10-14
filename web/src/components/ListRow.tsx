import type { ReactNode } from "react";
import { Icon } from "./Icon";
import styles from "./ListRow.module.css";

type Props = {
  title: ReactNode;
  /** The quiet line under the title (role, company, a quote). */
  meta?: ReactNode;
  /** Middle area, e.g. "8 wk ago". Sits after the title block. */
  children?: ReactNode;
  /** Up to about three Chips. Right-aligned, before the chevron. */
  chips?: ReactNode;
  /** Older rows fade: 0 = --text, 1 = --text-2, 2 = --text-3. */
  fade?: 0 | 1 | 2;
  /** Hide the chevron for non-navigating rows. Default shown when the row is clickable. */
  chevron?: boolean;
  /** Renders an <a>. */
  href?: string;
  /** Renders a <button>. */
  onClick?: () => void;
  /** In-widget row: tighter padding and a 13 px title (Roles to shortlist). */
  compact?: boolean;
  /** Fixed width in px for the title block so columns line up across rows. Default: fills the row. */
  mainWidth?: number;
  className?: string;
};

/** surface-2 row: title + quiet line + chips + chevron. Clickable when given href or onClick. */
export function ListRow({ title, meta, children, chips, fade = 0, chevron, href, onClick, compact, mainWidth, className }: Props) {
  const clickable = Boolean(href || onClick);
  const content = (
    <>
      <span className={styles.main} style={mainWidth ? { flex: `0 0 ${mainWidth}px` } : undefined}>
        <span className={`${styles.title} ${compact ? "t-body-s-strong" : "t-body-m-strong"}`}>{title}</span>
        {meta && <span className={`${styles.meta} t-caption`}>{meta}</span>}
      </span>
      {children}
      {chips && <span className={styles.chips}>{chips}</span>}
      {(chevron ?? clickable) && <Icon name="bx-chevron-right" size={18} />}
    </>
  );
  const cls = [styles.row, styles[`fade${fade}`], clickable && styles.clickable, compact && styles.compact, className].filter(Boolean).join(" ");
  if (href)
    return (
      <a className={cls} href={href} onClick={onClick}>
        {content}
      </a>
    );
  if (onClick)
    return (
      <button type="button" className={cls} onClick={onClick}>
        {content}
      </button>
    );
  return <div className={cls}>{content}</div>;
}
