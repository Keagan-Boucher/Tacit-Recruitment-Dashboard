import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PREFS } from "@tacit/shared";
import { withReviewWidget } from "./Dashboard";

const ids = (d: ReturnType<typeof withReviewWidget>) => d.filter((w) => w.visible).sort((a, b) => a.order - b.order).map((w) => w.widgetId);
const base = DEFAULT_USER_PREFS.dashboard;

describe("withReviewWidget (S14 auto Waiting for review)", () => {
  it("adds it last when on, without touching the saved layout", () => {
    const out = withReviewWidget(base, true);
    expect(ids(out).at(-1)).toBe("waiting-for-review");
    expect(ids(out)).toHaveLength(ids(base).length + 1);
    expect(base.find((w) => w.widgetId === "waiting-for-review")?.visible).toBe(false);
  });
  it("returns the same layout when off, or when it is already on the board", () => {
    expect(withReviewWidget(base, false)).toBe(base);
    const shown = base.map((w) => (w.widgetId === "waiting-for-review" ? { ...w, visible: true } : w));
    expect(withReviewWidget(shown, true)).toBe(shown);
  });
});
