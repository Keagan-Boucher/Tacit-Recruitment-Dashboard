import { beforeEach, describe, expect, it, vi } from "vitest";

const createUser = vi.fn();
const updateProfile = vi.fn();
const post = vi.fn();
vi.mock("firebase/auth", () => ({ createUserWithEmailAndPassword: (...a: unknown[]) => createUser(...a), updateProfile: (...a: unknown[]) => updateProfile(...a) }));
vi.mock("../../lib/firebase", () => ({ auth: {} }));
vi.mock("../../lib/api", () => ({
  api: (...a: unknown[]) => post(...a),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));

import { ApiError } from "../../lib/api";
import { PASSWORD_MIN, registerBody, signUpCandidate, signUpError, validateSignUp } from "./signUp";

const good = { name: "Lerato Dlamini", email: "lerato@mail.test", password: "x".repeat(PASSWORD_MIN), consent: true };

describe("validateSignUp", () => {
  it("accepts a complete form", () => expect(validateSignUp(good)).toEqual({}));
  it("requires 10+ characters and consent", () => {
    expect(validateSignUp({ ...good, password: "x".repeat(PASSWORD_MIN - 1) }).password).toMatch(/10 characters/);
    expect(validateSignUp({ ...good, consent: false }).consent).toMatch(/consent/);
  });
  it("only checks the fields it is given (finishing: name + consent)", () => {
    expect(validateSignUp({ name: " ", consent: true })).toEqual({ name: "Enter your full name." });
  });
});

describe("signUpCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUser.mockResolvedValue({ user: { uid: "u1" } });
    updateProfile.mockResolvedValue(undefined);
    post.mockResolvedValue({ role: "candidate" });
  });

  it("creates the account, sets the name, registers with consent", async () => {
    await expect(signUpCandidate({ ...good, name: "  Lerato Dlamini ", email: " lerato@mail.test " })).resolves.toBe("ok");
    expect(createUser).toHaveBeenCalledWith({}, "lerato@mail.test", good.password);
    expect(updateProfile).toHaveBeenCalledWith({ uid: "u1" }, { displayName: "Lerato Dlamini" });
    expect(post).toHaveBeenCalledWith("/api/portal/register", { displayName: "Lerato Dlamini", consent: true });
    expect(registerBody(" A ")).toEqual({ displayName: "A", consent: true });
  });

  it("lands on finishing when register fails after the account exists", async () => {
    post.mockRejectedValue(new ApiError(500, "internal", "boom"));
    await expect(signUpCandidate(good)).resolves.toBe("finish");
  });

  it("treats already_registered as done", async () => {
    post.mockRejectedValue(new ApiError(409, "already_registered", "x"));
    await expect(signUpCandidate(good)).resolves.toBe("ok");
  });

  it("throws account errors and never calls register", async () => {
    createUser.mockRejectedValue({ code: "auth/email-already-in-use" });
    await expect(signUpCandidate(good)).rejects.toMatchObject({ code: "auth/email-already-in-use" });
    expect(post).not.toHaveBeenCalled();
    expect(signUpError("auth/email-already-in-use").field).toBe("email");
  });
});
