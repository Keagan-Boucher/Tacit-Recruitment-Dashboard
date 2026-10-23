import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { collection, doc, onSnapshot, query, updateDoc, where, type Unsubscribe } from "firebase/firestore";
import type { CandidateUpdate, CourseSuggestion, DetailsChangeFields, PortalUser, Submission, SubmitResponse } from "@tacit/shared";
import { devParam } from "../../app/dev";
import { api } from "../../lib/api";
import { db } from "../../lib/firebase";
import { toDates, type Live } from "../../lib/data";
import { useAuth } from "../auth";
import { snoozeUntil, type CandidatePortal } from "./candidate";
import { candidateFixture } from "./candidateFixtures";

// The candidate's live reads. Exactly four, each carrying the filter the rules require (rules are not filters):
//   portalUsers/{uid} · submissions where submittedBy == uid · candidateUpdates where portalUid == uid ·
//   courseSuggestions/{claims.candidateId}. No recruiter collection is read here.

const newestBy = <T,>(pick: (x: T) => Date | undefined) => (a: T, b: T) => (pick(b)?.getTime() ?? 0) - (pick(a)?.getTime() ?? 0);
const row = <T,>(d: { id: string; data(): unknown }) => ({ ...(toDates(d.data()) as T), id: d.id });

type Parts = { portalUser?: CandidatePortal["portalUser"]; submissions?: CandidatePortal["submissions"]; updates?: CandidatePortal["updates"]; suggestion?: CandidatePortal["suggestion"] };

/** `data` undefined = still loading. `retry` re-subscribes after an error. */
export function useCandidatePortal(enabled = true): Live<CandidatePortal> & { retry: () => void } {
  const { user, claims } = useAuth();
  const uid = user?.uid;
  const candidateId = claims.candidateId;
  const [attempt, setAttempt] = useState(0);
  const key = `${uid}|${candidateId}|${attempt}`;
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
          put({ submissions: s.docs.map((d) => row<Submission>(d) as CandidatePortal["submissions"][number]).sort(newestBy((x) => x.submittedAt)) });
        },
        fail,
      ),
      onSnapshot(
        query(collection(db, "candidateUpdates"), where("portalUid", "==", uid)),
        (s) => {
          if (s.empty && s.metadata.fromCache) return;
          put({ updates: s.docs.map((d) => row<CandidateUpdate>(d)).sort(newestBy((x) => x.at)) });
        },
        fail,
      ),
    ];
    // The course doc only exists once approved; a refused read means "nothing to show", never an error.
    if (candidateId)
      stops.push(onSnapshot(doc(db, "courseSuggestions", candidateId), (s) => put({ suggestion: s.exists() ? row<CourseSuggestion>(s) : null }), () => put({ suggestion: null })));
    return () => stops.forEach((stop) => stop());
  }, [enabled, uid, candidateId, key]);

  const retry = () => setAttempt((n) => n + 1);
  if (state.key !== key) return { data: undefined, error: undefined, retry };
  const { portalUser, submissions, updates, suggestion } = state.parts;
  const ready = portalUser !== undefined && submissions !== undefined && updates !== undefined && (!candidateId || suggestion !== undefined);
  if (state.error) return { data: undefined, error: state.error, retry };
  return { data: ready ? { portalUser, submissions, updates, suggestion: candidateId ? (suggestion ?? null) : null } : undefined, error: undefined, retry };
}

/** The screen's data: dev fixtures for `?state=`, the live reads otherwise. `dev` is the state name when a fixture is showing. */
export function useCandidateScreen(): Live<CandidatePortal> & { retry: () => void; dev: string | null } {
  const dev = devParam(useLocation().search, "state");
  const live = useCandidatePortal(dev === null);
  // A refused read is an error, never fixture data: a rules bug must show, not be papered over.
  const fixture = useMemo(() => (dev && dev !== "loading" && dev !== "error" ? candidateFixture(dev) : undefined), [dev]);
  if (dev === null) return { ...live, dev };
  if (dev === "loading") return { data: undefined, error: undefined, retry: live.retry, dev };
  if (dev === "error") return { data: undefined, error: new Error("dev"), retry: () => {}, dev };
  return { data: fixture, error: undefined, retry: () => {}, dev };
}

/** "Still right" and "Change them": a details-change submission. The pool keeps the old values until the recruiter passes it. */
export async function sendDetailsChange(fields: DetailsChangeFields, dev: boolean): Promise<void> {
  if (dev) return new Promise((resolve) => setTimeout(resolve, 400));
  await api<SubmitResponse>("/api/portal/submit", { kind: "details-change", fields });
}

/** Remind me in a month / Got it. The rules allow only status, snoozedUntil and updatedAt. */
export async function answerCourses(candidateId: string | undefined, answer: "snooze" | "dismiss", dev: boolean): Promise<void> {
  if (dev || !candidateId) return;
  const now = new Date();
  await updateDoc(doc(db, "courseSuggestions", candidateId), answer === "snooze" ? { status: "snoozed", snoozedUntil: snoozeUntil(now), updatedAt: now } : { status: "dismissed", updatedAt: now });
}
