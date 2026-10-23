import { Invite } from "@tacit/shared";
import { fmtDate } from "../S03-candidate-profile/profile";

export const INVITE_DAYS = 14;
const DAY_MS = 86_400_000;

/** The `invites` doc the recruiter creates (rules: owner may create). Throws if it would not pass the shared schema. */
export function buildInvite(a: { uid: string; companyId: string; email: string; now: Date }): Invite {
  return Invite.parse({
    ownerUid: a.uid,
    companyId: a.companyId,
    email: a.email.trim().toLowerCase(),
    expiresAt: new Date(a.now.getTime() + INVITE_DAYS * DAY_MS),
    createdBy: a.uid,
    createdAt: a.now,
    updatedAt: a.now,
  });
}

export const isEmail = (s: string) => Invite.shape.email.safeParse(s.trim()).success;

export const joinLink = (origin: string, inviteId: string) => `${origin}/company/join/${inviteId}`;

/** "Joined 3 Nov 2026" · "Expired" · "Waiting"; the word always carries the state. */
export function inviteStatus(i: Pick<Invite, "acceptedAt" | "expiresAt">, now: Date) {
  if (i.acceptedAt) return { kind: "joined", text: `Joined ${fmtDate(i.acceptedAt)}` } as const;
  if (i.expiresAt <= now) return { kind: "expired", text: `Expired ${fmtDate(i.expiresAt)}` } as const;
  return { kind: "waiting", text: `Waiting, expires ${fmtDate(i.expiresAt)}` } as const;
}
