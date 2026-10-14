import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import type { Attribute, Candidate, InterviewNote } from "@tacit/shared";
import { useAuth } from "../features/auth";
import { db } from "./firebase";

// Live reads of the recruiter's own documents. Every query filters on ownerUid because rules are not filters.
// Sorting happens here, not in Firestore: the data is small (one recruiter) and it needs no extra composite indexes.
// ponytail: client-side sort over the whole result; add orderBy + an (ownerUid, …) index if a list passes ~1k docs.

export type WithId<T> = T & { id: string };
/** `data` undefined = still loading. */
export type Live<T> = { data: T | undefined; error: Error | undefined };

/** Firestore Timestamps -> Date, recursively (schemas use Date). */
export function toDates(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate();
  if (Array.isArray(v)) return v.map(toDates);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toDates(x)]));
  }
  return v;
}

const newestFirst = <T,>(key: keyof T) => (a: T, b: T) =>
  ((b[key] as Date | undefined)?.getTime() ?? 0) - ((a[key] as Date | undefined)?.getTime() ?? 0);

/** All of the recruiter's docs in `col`, optionally where `field == value`. */
export function useOwned<T>(col: string, filter?: [field: string, value: string | undefined], sort?: (a: WithId<T>, b: WithId<T>) => number): Live<WithId<T>[]> {
  const uid = useAuth().user?.uid;
  const [field, value] = filter ?? [];
  const key = `${uid}|${col}|${field}|${value}`;
  // Results are tagged with the query they answer, so a changed query reads as loading without a reset.
  const [state, setState] = useState<Live<WithId<T>[]> & { key?: string }>({ data: undefined, error: undefined });
  useEffect(() => {
    if (!uid || (field && !value)) return;
    const q = field
      ? query(collection(db, col), where("ownerUid", "==", uid), where(field, "==", value))
      : query(collection(db, col), where("ownerUid", "==", uid));
    return onSnapshot(
      q,
      (s) => {
        // An empty answer from the offline cache isn't "none yet": keep loading until the server answers.
        if (s.empty && s.metadata.fromCache) return;
        const rows = s.docs.map((d) => ({ ...(toDates(d.data()) as T), id: d.id }));
        setState({ key, data: sort ? rows.sort(sort) : rows, error: undefined });
      },
      (error) => setState({ key, data: undefined, error }),
    );
    // sort is a module-level comparator at every call site; key is derived from the other deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, col, field, value]);
  return state.key === key ? state : { data: undefined, error: undefined };
}

/** One doc. `data` null = not found (or not the recruiter's). */
export function useDocument<T>(col: string, id: string | undefined): Live<WithId<T> | null> {
  const uid = useAuth().user?.uid;
  const key = `${uid}|${col}|${id}`;
  const [state, setState] = useState<Live<WithId<T> | null> & { key?: string }>({ data: undefined, error: undefined });
  useEffect(() => {
    if (!uid || !id) return;
    return onSnapshot(
      doc(db, col, id),
      (s) => {
        // A cache miss while offline isn't "not found" (S03 would show the 404 page): wait for the server.
        if (!s.exists() && s.metadata.fromCache) return;
        setState({ key, data: s.exists() ? { ...(toDates(s.data()) as T), id: s.id } : null, error: undefined });
      },
      // Rules deny reading someone else's doc; to the recruiter that's the same as not found.
      (error) => setState(error.code === "permission-denied" ? { key, data: null, error: undefined } : { key, data: undefined, error }),
    );
    // key is derived from the other deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, col, id]);
  return state.key === key ? state : { data: undefined, error: undefined };
}

const byLastInterview = newestFirst<WithId<Candidate>>("lastInterviewAt");
const byCaptured = newestFirst<WithId<InterviewNote>>("capturedAt");
const byObserved = newestFirst<WithId<Attribute>>("observedAt");

export const useCandidates = () => useOwned<Candidate>("candidates", undefined, byLastInterview);
export const useCandidate = (id: string | undefined) => useDocument<Candidate>("candidates", id);
export const useNote = (id: string | undefined) => useDocument<InterviewNote>("interviewNotes", id);
/** Newest first. */
export const useNotes = (candidateId: string | undefined) => useOwned<InterviewNote>("interviewNotes", ["candidateId", candidateId], byCaptured);
/** Newest first. Includes unconfirmed ones: check `confirmedByRecruiter` before treating one as evidence. */
export const useAttributes = (candidateId: string | undefined) => useOwned<Attribute>("attributes", ["candidateId", candidateId], byObserved);
export const useNoteAttributes = (noteId: string | undefined) => useOwned<Attribute>("attributes", ["noteId", noteId], byObserved);
