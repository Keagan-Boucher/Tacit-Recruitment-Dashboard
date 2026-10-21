import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PREFS } from "@tacit/shared";
import { boardOf, move, setSize, setVisible, spaces } from "./layout";

const d = DEFAULT_USER_PREFS.dashboard;

describe("S17 widgets", () => {
  it("default board uses 12 of 12 spaces", () => expect(spaces(d)).toEqual({ used: 12, of: 12 }));
  it("turning a widget on appends it and adds a row", () => {
    const next = setVisible(d, "recent-notes", true);
    expect(boardOf(next).at(-1)?.widgetId).toBe("recent-notes");
    expect(spaces(next)).toEqual({ used: 13, of: 16 });
  });
  it("resizing and hiding change only that widget", () => {
    expect(setSize(d, "waiting", "2x2").find((w) => w.widgetId === "waiting")?.size).toBe("2x2");
    expect(boardOf(setVisible(d, "forgotten", false))).toHaveLength(7);
  });
  it("move skips hidden widgets and stops at the edges", () => {
    const vis = new Set(["forgotten", "to-confirm", "waiting"] as const);
    const order = DEFAULT_USER_PREFS.smallScreenOrder;
    const r = move(order, vis as never, "waiting", -1);
    expect(r?.position).toBe(2);
    expect(r?.order.indexOf("waiting")).toBe(order.indexOf("to-confirm"));
    expect(move(order, vis as never, "forgotten", -1)).toBeUndefined();
  });
});
