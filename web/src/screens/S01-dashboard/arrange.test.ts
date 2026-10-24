import { expect, it } from "vitest";
import { DEFAULT_USER_PREFS } from "@tacit/shared";
import { boardOf, setSize } from "../S17-widgets/layout";
import { collide, fitScale, NEW_ROW, nextSize, reorder, ZOOM } from "./arrange";

const ids = (d: typeof DEFAULT_USER_PREFS.dashboard) => boardOf(d).map((w) => w.widgetId);

it("moves a widget to another widget's place and leaves the shelf alone", () => {
  const d = DEFAULT_USER_PREFS.dashboard;
  const next = reorder(d, "waiting", "forgotten");
  expect(ids(next)).toEqual(["waiting", "forgotten", "roles-to-shortlist", "to-confirm", "roles-in-play", "worth-a-call", "ask-next", "people-met"]);
  expect(next.filter((w) => !w.visible).map((w) => w.order)).toEqual(d.filter((w) => !w.visible).map((w) => w.order));
});

it("the new-row slot sends a widget to the end; an unknown target changes nothing", () => {
  const d = DEFAULT_USER_PREFS.dashboard;
  expect(ids(reorder(d, "forgotten", NEW_ROW)).at(-1)).toBe("forgotten");
  expect(reorder(d, "forgotten", "nope")).toBe(d);
});

it("the size button cycles 1x1, 2x1, 2x2 and round again, and a resize changes only that widget's size", () => {
  expect(nextSize("1x1")).toBe("2x1");
  expect(nextSize("2x1")).toBe("2x2");
  expect(nextSize("2x2")).toBe("1x1");
  const d = DEFAULT_USER_PREFS.dashboard;
  const next = setSize(d, "waiting", nextSize("1x1"));
  expect(next.find((w) => w.widgetId === "waiting")?.size).toBe("2x1");
  const rest = (x: typeof d) => x.filter((w) => w.widgetId !== "waiting");
  expect(rest(next)).toEqual(rest(d));
  expect(next.find((w) => w.widgetId === "waiting")).toEqual({ ...d.find((w) => w.widgetId === "waiting"), size: "2x1" });
});

it("a mouse released on empty space is over nothing; the keyboard falls back to the nearest centre", () => {
  const rect = { top: 0, left: 0, width: 100, height: 100, bottom: 100, right: 100 };
  const base = {
    active: { id: "a" }, collisionRect: { ...rect, top: 500, bottom: 600 },
    droppableRects: new Map([["b", rect]]), droppableContainers: [{ id: "b", rect: { current: rect } }],
  } as unknown as Parameters<typeof collide>[0];
  expect(collide({ ...base, pointerCoordinates: { x: 50, y: 900 } })).toEqual([]);
  expect(collide({ ...base, pointerCoordinates: { x: 50, y: 50 } }).map((c) => c.id)).toEqual(["b"]);
  expect(collide({ ...base, pointerCoordinates: null }).map((c) => c.id)).toEqual(["b"]);
});

it("one factor fits the real board: 75% where it fits, smaller for the shelf or a short window, never below the floor", () => {
  const board = { w: 1200, h: 700 };
  expect(fitScale(board, { w: 1200, h: 700 })).toBe(ZOOM);
  expect(fitScale(board, { w: 900, h: Infinity })).toBe(0.75);
  expect(fitScale(board, { w: 600, h: Infinity })).toBe(0.5);
  expect(fitScale(board, { w: 1200, h: 350 })).toBe(0.5);
  expect(fitScale(board, { w: 10, h: 10 })).toBe(0.25);
  expect(fitScale({ w: 0, h: 0 }, { w: 500, h: 500 })).toBe(ZOOM);
});
