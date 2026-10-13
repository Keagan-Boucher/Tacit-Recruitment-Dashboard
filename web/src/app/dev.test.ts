import { afterEach, describe, expect, it } from "vitest";
import { applyDevTheme, devParam } from "./dev";

describe("dev hooks parsing", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("reads ?state= and ?dialog= when enabled", () => {
    expect(devParam("?state=ai-working&dialog=override", "state", true)).toBe("ai-working");
    expect(devParam("?state=ai-working&dialog=override", "dialog", true)).toBe("override");
    expect(devParam("", "state", true)).toBeNull();
  });

  it("is dead when disabled (production)", () => {
    expect(devParam("?state=ai-working", "state", false)).toBeNull();
  });

  it("?theme= toggles data-theme", () => {
    applyDevTheme("?theme=light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyDevTheme("?theme=dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
