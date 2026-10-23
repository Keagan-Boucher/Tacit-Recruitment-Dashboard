import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: { currentUser: null as { email: string } | null },
  create: vi.fn(),
  signIn: vi.fn(),
  update: vi.fn(),
  api: vi.fn(),
}));
vi.mock("firebase/auth", () => ({ createUserWithEmailAndPassword: m.create, signInWithEmailAndPassword: m.signIn, updateProfile: m.update }));
vi.mock("firebase/firestore", () => ({}));
vi.mock("../../lib/firebase", () => ({ auth: m.auth, db: {} }));
vi.mock("../../lib/api", () => ({
  api: m.api,
  ApiError: class extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));
vi.mock("../../lib/data", () => ({ toDates: (v: unknown) => v }));
vi.mock("../auth", () => ({ useAuth: () => ({}) }));
vi.mock("../../app/dev", () => ({ devParam: () => null }));

import { briefFixture } from "./companyFixtures";
import { draftFrom } from "./companyBrief";
import { fetchInvitePreview, joinCompany, sendBrief } from "./companyData";

const join = { inviteId: "inv_demo_open", email: "megan.pillay@vantage.test", name: " Megan Pillay ", password: "0123456789", existing: false };

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.currentUser = null;
  m.create.mockResolvedValue({ user: { uid: "u1" } });
  m.update.mockResolvedValue(undefined);
  m.api.mockResolvedValue({ companyId: "co-vantage" });
});

describe("joining by invitation", () => {
  it("creates the account, sets the name, then accepts the invite with that name", async () => {
    await expect(joinCompany(join)).resolves.toEqual({ companyId: "co-vantage" });
    expect(m.create).toHaveBeenCalledWith(m.auth, "megan.pillay@vantage.test", "0123456789");
    expect(m.update).toHaveBeenCalledWith({ uid: "u1" }, { displayName: "Megan Pillay" });
    expect(m.api).toHaveBeenCalledWith("/api/invites/inv_demo_open/accept", { displayName: "Megan Pillay" });
    expect(m.signIn).not.toHaveBeenCalled();
  });
  it("signs in instead when the email already has an account", async () => {
    await joinCompany({ ...join, existing: true });
    expect(m.signIn).toHaveBeenCalledWith(m.auth, "megan.pillay@vantage.test", "0123456789");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("retries only the accept when the invited account is already signed in", async () => {
    m.auth.currentUser = { email: "Megan.Pillay@vantage.test" };
    await joinCompany(join);
    expect(m.create).not.toHaveBeenCalled();
    expect(m.signIn).not.toHaveBeenCalled();
    expect(m.api).toHaveBeenCalledTimes(1);
  });
  it("lets an account error through without calling the proxy", async () => {
    m.create.mockRejectedValue({ code: "auth/email-already-in-use" });
    await expect(joinCompany(join)).rejects.toMatchObject({ code: "auth/email-already-in-use" });
    expect(m.api).not.toHaveBeenCalled();
  });
  it("lets a proxy error through (the account is kept for the retry)", async () => {
    m.api.mockRejectedValue({ code: "email_mismatch" });
    await expect(joinCompany(join)).rejects.toMatchObject({ code: "email_mismatch" });
  });
});

describe("invite preview", () => {
  const preview = { companyName: "Vantage Logistics", email: "megan.pillay@vantage.test", expiresAt: "2026-10-30T12:00:00.000Z", status: "open" };
  it("reads without a token", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => preview });
    await expect(fetchInvitePreview("inv one", fetcher as unknown as typeof fetch)).resolves.toEqual(preview);
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/api/invites/inv%20one"));
    expect(fetcher.mock.calls[0]).toHaveLength(1); // no headers, so no token
  });
  it("returns null for an invite that does not exist and throws for anything else", async () => {
    const f = (status: number) => vi.fn().mockResolvedValue({ ok: status < 400, status, statusText: "x", json: async () => ({}) }) as unknown as typeof fetch;
    await expect(fetchInvitePreview("x", f(404))).resolves.toBeNull();
    await expect(fetchInvitePreview("x", f(500))).rejects.toMatchObject({ status: 500 });
    await expect(fetchInvitePreview("x", vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch)).rejects.toMatchObject({ status: 0 });
  });
});

describe("sending a brief", () => {
  const brief = briefFixture();
  it("posts the submit body", async () => {
    m.api.mockResolvedValue({ submissionId: "s1" });
    await sendBrief(brief, draftFrom(brief.result), false);
    expect(m.api).toHaveBeenCalledWith("/api/portal/submit", expect.objectContaining({ kind: "brief", text: null, fileRef: brief.briefFileRef }));
  });
  it("sends nothing from a dev fixture", async () => {
    await sendBrief(brief, draftFrom(brief.result), true);
    expect(m.api).not.toHaveBeenCalled();
  });
});
