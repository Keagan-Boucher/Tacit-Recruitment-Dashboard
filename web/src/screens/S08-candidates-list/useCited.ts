import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import type { Attribute, SearchHit } from "@tacit/shared";
import { toDates, type WithId } from "../../lib/data";
import { db } from "../../lib/firebase";

/** The attributes the hits cite, by id. A read the rules refuse or a deleted doc just leaves that hit without a source line. */
export function useCited(hits: SearchHit[] | null) {
  const [cited, setCited] = useState<ReadonlyMap<string, WithId<Attribute>>>(new Map());
  const key = hits ? [...new Set(hits.flatMap((h) => h.attributeIds))].sort().join(",") : "";
  useEffect(() => {
    if (!key) return;
    let live = true;
    void Promise.all(
      key.split(",").map((id) =>
        getDoc(doc(db, "attributes", id)).then(
          (s) => (s.exists() ? ([id, { ...(toDates(s.data()) as Attribute), id }] as const) : null),
          () => null,
        ),
      ),
    ).then((rows) => live && setCited(new Map(rows.filter((r) => r !== null))));
    return () => {
      live = false;
    };
  }, [key]);
  return cited;
}
