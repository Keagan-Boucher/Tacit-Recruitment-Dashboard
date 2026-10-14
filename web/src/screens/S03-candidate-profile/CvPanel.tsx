import type { ReactNode } from "react";
import type { Candidate } from "@tacit/shared";
import { Card, Chip, Icon } from "../../components";
import { CvFileActions, fileKind, readLabel } from "../../features/files";
import styles from "./CandidateProfile.module.css";

type Job = NonNullable<Candidate["cv"]>["history"][number];

const job = (j: Job) => [j.title, j.company, j.from && `${j.from} to ${j.to ?? "now"}`].filter(Boolean).join(", ");

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt className="t-caption">{label}</dt>
      <dd className="t-body-m">{children}</dd>
    </div>
  );
}

/** Original CV file row: name, type and when it was read, then the actions. Rendered only when the file exists. */
export function CvFileRow({ fileName, meta, actions }: { fileName: string; meta?: string; actions?: ReactNode }) {
  return (
    <div className={styles.file}>
      <div className={styles.fileHead}>
        <span className={styles.fileIcon}>
          <Icon name="bx-file" size={20} />
        </span>
        <div className={styles.fileText}>
          <span className="t-body-m-strong">{fileName}</span>
          {meta && <span className="t-caption">{meta}</span>}
        </div>
      </div>
      {actions}
    </div>
  );
}

/** What the CV claims. Never mixed with what the recruiter observed. */
export function CvPanel({ candidate }: { candidate: Candidate }) {
  const cv = candidate.cv;
  return (
    <Card className={styles.panel} aria-labelledby="cv-title" role="region">
      <h2 id="cv-title" className="t-title">What the CV says</h2>
      <dl className={styles.facts}>
        {cv?.history.map((j, i) => (
          <Fact key={i} label={j.to ? "Before" : "Now"}>
            {job(j)}
          </Fact>
        ))}
        {cv?.education.map((e, i) => (
          <Fact key={`e${i}`} label="Education">
            {e}
          </Fact>
        ))}
        <Fact label="Location">{candidate.location}</Fact>
        {cv?.salaryExpectation && <Fact label="Salary expectation">{cv.salaryExpectation}</Fact>}
      </dl>
      {cv?.skills.length ? (
        <div className={styles.skills}>
          <p className="t-caption">Skills listed</p>
          <ul className={styles.chipList}>
            {cv.skills.map((s) => (
              <li key={s}>
                <Chip>{s}</Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!cv && <p className="t-body-s-para">No CV has been read for this candidate.</p>}
      {cv?.fileName && candidate.cvFileRef ? (
        <CvFileRow
          fileName={cv.fileName}
          meta={[fileKind(cv.fileName), cv.readAt && readLabel(cv.readAt)].filter(Boolean).join(" · ")}
          actions={<CvFileActions fileRef={candidate.cvFileRef} fileName={cv.fileName} className={styles.fileActions} />}
        />
      ) : null}
    </Card>
  );
}
