import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import type { ShortlistEntry, ShortlistStatusRequest, ShortlistStatusResponse } from "@tacit/shared";
import { devParam } from "../../app/dev";
import { useAuth } from "../../features/auth";
import { api } from "../../lib/api";
import { toDates } from "../../lib/data";
import { db } from "../../lib/firebase";
import { FIXTURE_IDENTITY, fixtureEntries } from "./fixtures";
import { applyChange, byLabel } from "./shortlist";
import type { Entry } from "./shortlist";

type Result = {
  /** undefined = still loading. */
  entries: Entry[] | undefined;
  error: Error | undefined;
  retry: () => void;
  /** Sends one status change. Rejects with the proxy's ApiError; in a dev fixture it only changes local state. */
  send: (req: ShortlistStatusRequest) => Promise<void>;
};

/**
 * The company's own entries for one role. Both filters are required by the rules (a company reads only
 * `companyId == token.companyId`; rules are not filters). The entry doc carries no identity until Interviewing.
 * Dev: `?state=` shows fixtures; a refused read is an error.
 */
export function useShortlist(roleId: string | undefined): Result {
  const dev = devParam(useLocation().search, "state");
  const { user, claims } = useAuth();
  const companyId = claims.companyId;
  const [attempt, setAttempt] = useState(0);
  const key = `${user?.uid}|${companyId}|${roleId}|${attempt}`;
  const [live, setLive] = useState<{ key: string; entries?: Entry[]; error?: Error }>({ key: "" });
  const [local, setLocal] = useState<Entry[]>(() => fixtureEntries());

  useEffect(() => {
    if (dev !== null || !user || !companyId || !roleId) return;
    return onSnapshot(
      query(collection(db, "shortlistEntries"), where("companyId", "==", companyId), where("roleId", "==", roleId)),
      (s) => {
        if (s.empty && s.metadata.fromCache) return; // not "none yet": wait for the server
        setLive({ key, entries: s.docs.map((d) => ({ ...(toDates(d.data()) as ShortlistEntry), id: d.id })).sort(byLabel) });
      },
      (error) => setLive({ key, error }),
    );
  }, [dev, user, companyId, roleId, key]);

  const fixture = dev !== null; // a refused read is an error, never fixture data

  const send = useCallback(
    async (req: ShortlistStatusRequest) => {
      if (fixture) {
        await new Promise((r) => setTimeout(r, 300));
        setLocal((all) => applyChange(all, req, "dev-company", new Date(), FIXTURE_IDENTITY[req.entryId]));
        return;
      }
      // The snapshot above delivers the new status; nothing is written from here.
      await api<ShortlistStatusResponse>("/api/portal/shortlist-status", req);
    },
    [fixture],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const entries = useMemo<Entry[] | undefined>(() => {
    if (!fixture) return live.key === key && !live.error ? live.entries : undefined;
    if (dev === "loading" || dev === "error") return undefined;
    return dev === "empty" ? [] : [...local].sort(byLabel);
  }, [fixture, dev, local, live, key]);
  const error = dev === "error" ? new Error("dev") : fixture ? undefined : live.key === key ? live.error : undefined;
  return { entries, error, retry, send };
}
