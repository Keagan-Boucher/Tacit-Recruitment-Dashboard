import type { DashboardWidget, WidgetId, WidgetSize } from "@tacit/shared";

// Pure helpers for S17. Titles match the S01 widgets.
export const TITLES: Record<WidgetId, string> = {
  forgotten: "Someone you forgot",
  "roles-to-shortlist": "Roles to shortlist",
  "to-confirm": "Things to confirm",
  "people-met": "People you have met",
  "roles-in-play": "Roles in play",
  "worth-a-call": "Worth a call",
  waiting: "Also waiting on you",
  "ask-next": "Ask on your next call",
  "recent-notes": "Recent notes",
  "brief-inbox": "Brief inbox",
  "company-coverage": "Company coverage",
  "match-history": "Match history",
  "override-log": "Override log",
  "waiting-for-review": "Waiting for review",
};

export const SIZES: { value: WidgetSize; label: string }[] = [
  { value: "1x1", label: "1×1" },
  { value: "2x1", label: "2×1" },
  { value: "2x2", label: "2×2" },
];

const CELLS: Record<WidgetSize, number> = { "1x1": 1, "2x1": 2, "2x2": 4 };

const patch = (d: DashboardWidget[], id: WidgetId, p: Partial<DashboardWidget>) => d.map((w) => (w.widgetId === id ? { ...w, ...p } : w));

export const setSize = (d: DashboardWidget[], id: WidgetId, size: WidgetSize) => patch(d, id, { size });

/** Turning a widget on puts it at the end of the board order. */
export const setVisible = (d: DashboardWidget[], id: WidgetId, visible: boolean) =>
  patch(d, id, visible ? { visible, order: Math.max(-1, ...d.map((w) => w.order)) + 1 } : { visible });

export const boardOf = (d: DashboardWidget[]) => d.filter((w) => w.visible).sort((a, b) => a.order - b.order);

/** Cells used by the board and the cells in the rows it fills (at least the 4 x 3 default). */
export function spaces(d: DashboardWidget[]) {
  const used = boardOf(d).reduce((n, w) => n + CELLS[w.size], 0);
  return { used, of: Math.max(12, Math.ceil(used / 4) * 4) };
}

/** Swap `id` with its neighbour among the visible widgets; returns the new order and its 1-based position, or undefined at an edge. */
export function move(order: WidgetId[], visible: Set<WidgetId>, id: WidgetId, dir: -1 | 1) {
  const shown = order.filter((w) => visible.has(w));
  const i = shown.indexOf(id);
  const other = shown[i + dir];
  if (i < 0 || !other) return undefined;
  const next = [...order];
  const a = next.indexOf(id);
  const b = next.indexOf(other);
  [next[a], next[b]] = [other, id];
  return { order: next, position: i + dir + 1 };
}
