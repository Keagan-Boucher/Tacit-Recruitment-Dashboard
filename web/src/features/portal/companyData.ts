import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from "firebase/firestore";
import type { AcceptInviteResponse, InvitePreview, PortalUser, ShortlistEntry, Submission, SubmitResponse } from "@tacit/shared";
import { devParam } from "../../app/dev";
import { api, ApiError } from "../../lib/api";
import { toDates, type Live } from "../../lib/data";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../auth";
import type { BriefDraft } from "./companyBrief";
import { buildSubmit } from "./companyBrief";
import type { InterpretedBrief } from "../brief";
import type { CompanyPortal } from "./company";
import { companyFixture } from "./companyFixtures";

// The company's live reads. Exactly three, each carrying the filter the rules require (rules are not filters):
//   portalUsers/{uid} · submissions where submittedBy == uid · shortlistEntries where companyId == claims.companyId.
// No recruiter collection, no other company's data and no role, note or attribute is read here.

const newestBy = <T,>(pick: (x: T) => Date | undefined) => (a: T, b: T) => (pick(b)?.getTime() ?? 0) - (pick(a)?.getTime() ?? 0);
const row = <T,>(d: { id: string; data(): unknown }) => ({ ...(toDates(d.data()) as T), id: d.id });

type Parts = { portalUser?: CompanyPortal["portalUser"]; submissions?: CompanyPortal["submissions"]; entries?: CompanyPortal["entries"] };

/** `data` undefined = still loading. `retry` re-subscribes after an error. */
export function useCompanyPortal(enabled = true): Live<CompanyPortal> & { retry: () => void } {
  const { user, claims } = useAuth();
  const uid = user?.uid;
  const companyId = claims.companyId;
  const [attempt, setAttempt] = useState(0);
  const key = `${uid}|${companyId}|${attempt}`;
  // Results are tagged with the subscription they answer, so a changed key reads as loading without a reset.
  const [state, setState] = useState<{ key: string; parts: Parts; error?: Error }>({ key: "", parts: {} });

  useEffect(() => {
    if (!enabled || !uid) return;
    const put = (p: Parts) => setState((s) => ({ key, parts: { ...(s.key === key ? s.parts : {}), ...p }, error: s.key === key ? s.error : undefined }));
    const fail = (error: Error) => setState((s) => ({ key, parts: s.key === key ? s.parts : {}, error }));
    const stops: Unsubscribe[] = [
      onSnapshot(doc(db, "portalUsers", uid), (s) => put({ portalUser: s.exists() ? row<PortalUser>(s) : null }), fail),
      onSnapshot(
        query(collection(db, "submissions"), where("submittedBy", "==", uid)),
        (s) => {
          if (s.empty && s.metadata.fromCache) return; // not "none yet": wait for the server
          put({ submissions: s.docs.map((d) => row<Submission>(d) as CompanyPortal["submissions"][number]).sort(newestBy((x) => x.submittedAt)) });
        },
        fail,
      ),
    ];
    // No companyId claim yet (invite not finished) means nothing to show, not something to ask the rules for.
    if (companyId)
      stops.push(
        onSnapshot(
          query(collection(db, "shortlistEntries"), where("companyId", "==", companyId)),
          (s) => {
            if (s.empty && s.metadata.fromCache) return;
            put({ entries: s.docs.map((d) => row<ShortlistEntry>(d)).sort(newestBy((x) => x.sharedAt)) });
          },
          fail,
        ),
      );
    return () => stops.forEach((stop) => stop());
  }, [enabled, uid, companyId, key]);

  const retry = () => setAttempt((n) => n + 1);
  if (state.key !== key) return { data: undefined, error: undefined, retry };
  const { portalUser, submissions, entries } = state.parts;
  if (state.error) return { data: undefined, error: state.error, retry };
  const ready = portalUser !== undefined && submissions !== undefined && (!companyId || entries !== undefined);
  return { data: ready ? { portalUser, submissions, entries: companyId ? (entries ?? []) : [] } : undefined, error: undefined, retry };
}

/** The screen's data: dev fixtures for `?state=`, the live reads otherwise. `dev` is the state name when a fixture is showing. */
export function useCompanyScreen(): Live<CompanyPortal> & { retry: () => void; dev: string | null } {
  const dev = devParam(useLocation().search, "state");
  const live = useCompanyPortal(dev === null);
  const fixture = useMemo(() => (dev && dev !== "loading" && dev !== "error" ? companyFixture(dev) : undefined), [dev]);
  if (dev === null) return { ...live, dev };
  if (dev === "loading") return { data: undefined, error: undefined, retry: live.retry, dev };
  if (dev === "error") return { data: undefined, error: new Error("dev"), retry: () => {}, dev };
  return { data: fixture, error: undefined, retry: () => {}, dev };
}

// ---- B01 ----------------------------------------------------------------------------------------------

// Same base as lib/api.ts. The preview is public (the random invite id is the secret), so no token is sent.
const base = import.meta.env.VITE_API_BASE_URL || "";

/** GET /api/invites/:id signed out. `null` = no such invite. Anything else that goes wrong throws. */
export async function fetchInvitePreview(inviteId: string, fetcher: typeof fetch = fetch): Promise<InvitePreview | null> {
  let res: Response;
  try {
    res = await fetcher(`${base}/api/invites/${encodeURIComponent(inviteId)}`);
  } catch {
    throw new ApiError(0, "internal", "Can't reach Tacit's server.");
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status, "internal", res.statusText);
  return (await res.json()) as InvitePreview;
}

export type JoinInput = { inviteId: string; email: string; name: string; password: string; existing: boolean };

/**
 * The account, then the invite. `existing` signs in to an account that already has this email. An account already
 * signed in with the invited email (an accept that failed half way) skips straight to accepting.
 */
export async function joinCompany({ inviteId, email, name, password, existing }: JoinInput): Promise<AcceptInviteResponse> {
  const displayName = name.trim();
  const current = auth.currentUser;
  if (!(current && current.email?.toLowerCase() === email.toLowerCase())) {
    if (existing) {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName }).catch(() => {});
    }
  }
  return api<AcceptInviteResponse>(`/api/invites/${encodeURIComponent(inviteId)}/accept`, { displayName });
}

// ---- B03 ----------------------------------------------------------------------------------------------

/** Sends the checked brief to the recruiter's review queue. In dev with a `?state=` fixture nothing is sent. */
export async function sendBrief(brief: InterpretedBrief, draft: BriefDraft, dev: boolean): Promise<void> {
  const body = buildSubmit(brief, draft);
  if (dev) return new Promise((resolve) => setTimeout(resolve, 400));
  await api<SubmitResponse>("/api/portal/submit", body);
}
