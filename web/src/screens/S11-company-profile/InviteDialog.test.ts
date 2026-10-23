import { describe, expect, it } from "vitest";
import { buildInvite, inviteStatus, isEmail, joinLink } from "./InviteDialog.logic";

const now = new Date("2026-10-27T10:00:00Z");

describe("buildInvite", () => {
  it("lower-cases the email and expires in 14 days", () => {
    const i = buildInvite({ uid: "u1", companyId: "co1", email: " Thandi@Acme.CO.za ", now });
    expect(i).toMatchObject({ ownerUid: "u1", createdBy: "u1", companyId: "co1", email: "thandi@acme.co.za" });
    expect(i.expiresAt.toISOString()).toBe("2026-11-10T10:00:00.000Z");
    expect("acceptedAt" in i).toBe(false);
  });
  it("refuses a bad address", () => expect(() => buildInvite({ uid: "u", companyId: "c", email: "nope", now })).toThrow());
});

describe("helpers", () => {
  it("validates email", () => { expect(isEmail("a@b.co")).toBe(true); expect(isEmail("a@")).toBe(false); });
  it("builds the join link", () => expect(joinLink("https://tacit.test", "abc")).toBe("https://tacit.test/company/join/abc"));
  it("reads status", () => {
    const later = new Date("2026-11-01");
    expect(inviteStatus({ expiresAt: later }, now).kind).toBe("waiting");
    expect(inviteStatus({ expiresAt: new Date("2026-10-01") }, now).kind).toBe("expired");
    expect(inviteStatus({ expiresAt: later, acceptedAt: now }, now).text).toBe("Joined 27 Oct 2026");
  });
});
