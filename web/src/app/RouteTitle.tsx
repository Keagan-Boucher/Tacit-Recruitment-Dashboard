import { useEffect } from "react";
import { useMatches } from "react-router";

/** Sets `document.title` to "<Page> · Tacit" from the deepest matched route's `handle.title`. */
export function RouteTitle() {
  const title = useMatches()
    .map((m) => (m.handle as { title?: string } | undefined)?.title)
    .filter(Boolean)
    .pop();
  useEffect(() => {
    document.title = title ? `${title} · Tacit` : "Tacit";
  }, [title]);
  return null;
}
