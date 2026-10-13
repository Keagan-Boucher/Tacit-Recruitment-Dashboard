/** Two uppercase letters from the display name, else from the email's local part. */
export function initials(user: { displayName?: string | null; email?: string | null } | null): string {
  const source = user?.displayName?.trim() || user?.email?.split("@")[0] || "";
  return source.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
}
