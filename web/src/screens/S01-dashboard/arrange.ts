import type { CSSProperties } from "react";
import { closestCenter, pointerWithin, type CollisionDetection, type UniqueIdentifier } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { DashboardWidget, WidgetId, WidgetSize } from "@tacit/shared";
import { boardOf, SIZES } from "../S17-widgets/layout";

/** The customise board is the real board drawn at most at this scale (Figma: 75%); it shrinks further to leave room for the shelf. */
export const ZOOM = 0.75;
const MIN_ZOOM = 0.25;
/** Hands the scale to CSS as `--z`. */
export const zoomVar = (z: number) => ({ "--z": z }) as CSSProperties;

/** The one factor that fits the real board (`board`, px at its real size) into `room`, never above ZOOM. Infinity means no limit. */
export function fitScale(board: { w: number; h: number }, room: { w: number; h: number }): number {
  if (!(board.w > 0) || !(board.h > 0)) return ZOOM;
  const z = Math.min(ZOOM, room.w / board.w, room.h / board.h);
  return Math.round(Math.max(MIN_ZOOM, z) * 1000) / 1000;
}

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

/** What the lifted widget is over. The centre of a big lifted copy is far from the pointer, so the pointer decides.
 *  A mouse released on empty space is over nothing (the order stays); only the keyboard, which has no pointer, uses the centre. */
export const collide: CollisionDetection = (args) => {
  const hit = pointerWithin(args);
  return hit.length || args.pointerCoordinates ? hit : closestCenter(args);
};

/** The size the size button switches to: 1x1, 2x1, 2x2, then round again (the sizes S17 offers). */
export const nextSize = (s: WidgetSize): WidgetSize => SIZES[(SIZES.findIndex((o) => o.value === s) + 1) % SIZES.length]!.value;
