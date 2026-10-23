/** Two uppercase letters: first and last word of the display name ("Naledi Mokoena" → NM), else the start of one word or the email's local part. */
export function initials(user: { displayName?: string | null; email?: string | null } | null): string {
  const source = user?.displayName?.trim() || user?.email?.split("@")[0] || "";
  const words = source.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  const pick = words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : (words[0] ?? "").slice(0, 2);
  return pick.toUpperCase() || "?";
}
