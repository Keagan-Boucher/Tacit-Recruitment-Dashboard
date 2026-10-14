const DAY = 86_400_000;

/** "PDF" from "x.pdf"; "File" when there is no extension. */
export const fileKind = (name: string) => {
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return ext ? ext.toUpperCase() : "File";
};

/** "Read today", "Read 5 days ago", "Read 14 months ago". */
export function readLabel(readAt: Date, now = new Date()) {
  const days = Math.max(0, Math.floor((now.getTime() - readAt.getTime()) / DAY));
  if (days < 1) return "Read today";
  if (days < 30) return `Read ${days} day${days === 1 ? "" : "s"} ago`;
  const m = Math.floor(days / 30.4375);
  if (m < 12) return `Read ${m} month${m === 1 ? "" : "s"} ago`;
  const y = Math.floor(m / 12);
  return `Read ${y} year${y === 1 ? "" : "s"} ago`;
}
