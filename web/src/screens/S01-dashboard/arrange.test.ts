import { expect, it } from "vitest";
import { DEFAULT_USER_PREFS } from "@tacit/shared";
import { boardOf } from "../S17-widgets/layout";
import { NEW_ROW, reorder } from "./arrange";

const ids = (d: typeof DEFAULT_USER_PREFS.dashboard) => boardOf(d).map((w) => w.widgetId);

it("moves a widget to another widget's place and leaves the shelf alone", () => {
  const d = DEFAULT_USER_PREFS.dashboard;
  const next = reorder(d, "waiting", "forgotten");
  expect(ids(next)).toEqual(["waiting", "forgotten", "roles-to-shortlist", "to-confirm", "people-met", "roles-in-play", "worth-a-call"]);
  expect(next.filter((w) => !w.visible).map((w) => w.order)).toEqual(d.filter((w) => !w.visible).map((w) => w.order));
});

it("the new-row slot sends a widget to the end; an unknown target changes nothing", () => {
  const d = DEFAULT_USER_PREFS.dashboard;
  expect(ids(reorder(d, "forgotten", NEW_ROW)).at(-1)).toBe("forgotten");
  expect(reorder(d, "forgotten", "nope")).toBe(d);
});
