import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PREFS } from "@tacit/shared";
import { initials } from "../auth/initials";
import { signInErrorMessage } from "../auth/errors";
import { parsePrefs, resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("honours explicit prefs and resolves system", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("initials", () => {
  it("uses displayName, else email local part", () => {
    expect(initials({ displayName: "Nomvula Mokoena" })).toBe("NO");
    expect(initials({ displayName: null, email: "snap.recruiter@x.com" })).toBe("SN");
    expect(initials(null)).toBe("?");
  });
});

describe("parsePrefs", () => {
  it("defaults on missing doc", () => expect(parsePrefs(undefined)).toEqual(DEFAULT_USER_PREFS));
  it("converts Timestamp to Date and fills missing fields", () => {
    const at = new Date("2026-10-25T10:00:00Z");
    const p = parsePrefs({ theme: "light", updatedAt: { toDate: () => at } });
    expect(p.theme).toBe("light");
    expect(p.updatedAt).toEqual(at);
    expect(p.dashboard).toEqual(DEFAULT_USER_PREFS.dashboard);
  });
  it("defaults on invalid data", () => expect(parsePrefs({ theme: "purple" })).toEqual(DEFAULT_USER_PREFS));
});

describe("signInErrorMessage", () => {
  it("is generic for credentials, distinct for network and throttling", () => {
    const a = signInErrorMessage("auth/invalid-credential");
    expect(signInErrorMessage("auth/wrong-password")).toBe(a);
    expect(signInErrorMessage("auth/too-many-requests")).not.toBe(a);
    expect(signInErrorMessage("auth/network-request-failed")).not.toBe(a);
  });
});
