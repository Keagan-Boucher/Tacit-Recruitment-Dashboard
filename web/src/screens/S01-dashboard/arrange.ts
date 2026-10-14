import type { CSSProperties } from "react";
import type { UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { DashboardWidget, WidgetId } from "@tacit/shared";
import { boardOf } from "../S17-widgets/layout";

/** The customise board is the real board drawn at this scale (Figma: 75%). */
export const ZOOM = 0.75;
/** Hands the scale to CSS as `--z`. */
export const zoomVar = { "--z": ZOOM } as CSSProperties;

/** Id of the "Drop here for a new row" slot: dropping on it sends the widget to the end. */
export const NEW_ROW = "new-row";

/** Move `from` to where `to` is among the visible widgets. Hidden widgets and their order slots stay as they were. */
export function reorder(d: DashboardWidget[], from: WidgetId, to: UniqueIdentifier): DashboardWidget[] {
  const board = boardOf(d);
  const ids = board.map((w) => w.widgetId);
  const dest = to === NEW_ROW ? ids.length - 1 : ids.indexOf(to as WidgetId);
  if (dest < 0) return d;
  const next = arrayMove(ids, ids.indexOf(from), dest);
  const slots = board.map((w) => w.order);
  return d.map((w) => (next.includes(w.widgetId) ? { ...w, order: slots[next.indexOf(w.widgetId)] ?? w.order } : w));
}
