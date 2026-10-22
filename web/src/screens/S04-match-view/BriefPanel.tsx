import type { Role } from "@tacit/shared";
import { Card, Icon } from "../../components";
import { CvFileActions } from "../../features/files";
import { BriefRows } from "../../features/brief/BriefRows";
import { screeningRows } from "../../features/brief/helpers";
import styles from "./MatchView.module.css";

/** The brief and what Tacit understood from it, in screening order. The original file row exists only for uploaded briefs. */
export function BriefPanel({ role }: { role: Role }) {
  const file = role.briefSource === "upload" && role.briefFileRef ? role.briefFileRef : undefined;
  const fileName = file?.split("/").pop() ?? "";
  return (
    <Card className={styles.brief} role="region" aria-labelledby="brief-title">
      <h2 id="brief-title" className="t-title">The brief</h2>
      <p className={`${styles.briefText} t-body-s-para`} tabIndex={0}>“{role.briefText}”</p>
      {file && (
        <div className={styles.file}>
          <span className={styles.fileIcon}><Icon name="bx-file" size={20} /></span>
          <div className={styles.fileText}>
            <span className="t-body-s-strong">{fileName}</span>
            <CvFileActions fileRef={file} fileName={fileName} viewLabel="View original" className={styles.fileActions} />
          </div>
        </div>
      )}
      <hr className={styles.rule} />
      <h3 className={`${styles.understood} t-body-m-strong`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M10 3l1.9 5.6L17.5 10.5l-5.6 1.9L10 18l-1.9-5.6L2.5 10.5l5.6-1.9z" />
          <path d="M19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8z" />
        </svg>
        What Tacit understood
      </h3>
      {role.interpretedBrief ? (
        <BriefRows rows={screeningRows(role.interpretedBrief, role.interpretedBrief.quotes)} />
      ) : (
        <p className="t-body-s-para">Tacit hasn’t read this brief yet.</p>
      )}
    </Card>
  );
}
