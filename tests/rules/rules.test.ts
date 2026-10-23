import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadString } from "firebase/storage";

let env: RulesTestEnvironment;
const A = "alice";
const B = "bob";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "tacit-3cdd4",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  // Seed as the proxy (rules bypassed).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "candidates/c1"), { ownerUid: A, fullName: "x" });
    await setDoc(doc(db, "attributes/a1"), { ownerUid: A, value: "SAP FI", confirmedByRecruiter: false });
    await setDoc(doc(db, "matches/m1"), { ownerUid: A, rank: 1 });
    await setDoc(doc(db, "overrides/o1"), { ownerUid: A, decision: "reject", reasonText: "r" });
  });
});

const alice = () => env.authenticatedContext(A, { role: "recruiter" }).firestore();
const bob = () => env.authenticatedContext(B, { role: "recruiter" }).firestore();

describe("owner CRUD collections", () => {
  it("owner can create, read, update, delete own candidate", async () => {
    await assertSucceeds(setDoc(doc(alice(), "candidates/c2"), { ownerUid: A, fullName: "y" }));
    await assertSucceeds(getDoc(doc(alice(), "candidates/c1")));
    await assertSucceeds(updateDoc(doc(alice(), "candidates/c1"), { fullName: "z" }));
    await assertSucceeds(deleteDoc(doc(alice(), "candidates/c1")));
  });
  it("other user cannot read, update or delete it", async () => {
    await assertFails(getDoc(doc(bob(), "candidates/c1")));
    await assertFails(updateDoc(doc(bob(), "candidates/c1"), { fullName: "z" }));
    await assertFails(deleteDoc(doc(bob(), "candidates/c1")));
  });
  it("cannot create with another uid, or re-assign ownership", async () => {
    await assertFails(setDoc(doc(alice(), "candidates/c3"), { ownerUid: B }));
    await assertFails(updateDoc(doc(alice(), "candidates/c1"), { ownerUid: B }));
  });
  it("unauthenticated is denied", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "candidates/c1")));
    await assertFails(setDoc(doc(anon, "candidates/c9"), { ownerUid: A }));
  });
  it("unknown collections are denied", async () => {
    await assertFails(setDoc(doc(alice(), "misc/x"), { ownerUid: A }));
  });
});

describe("AI-derived collections", () => {
  it("owner reads attributes and matches; others cannot", async () => {
    await assertSucceeds(getDoc(doc(alice(), "attributes/a1")));
    await assertSucceeds(getDoc(doc(alice(), "matches/m1")));
    await assertFails(getDoc(doc(bob(), "attributes/a1")));
  });
  it("client cannot create or delete attributes or matches", async () => {
    await assertFails(setDoc(doc(alice(), "attributes/a2"), { ownerUid: A, value: "x" }));
    await assertFails(setDoc(doc(alice(), "matches/m2"), { ownerUid: A, rank: 1 }));
    await assertFails(deleteDoc(doc(alice(), "attributes/a1")));
    await assertFails(deleteDoc(doc(alice(), "matches/m1")));
  });
  it("client may create only an override-sourced salary/availability attribute", async () => {
    const ok = { ownerUid: A, sourceType: "override", type: "salary", overrideId: "o1", confirmedByRecruiter: true, value: "R60k" };
    await assertSucceeds(setDoc(doc(alice(), "attributes/a3"), ok));
    await assertFails(setDoc(doc(alice(), "attributes/a4"), { ...ok, sourceType: "note" }));
    await assertFails(setDoc(doc(alice(), "attributes/a5"), { ...ok, type: "skill" }));
    await assertFails(setDoc(doc(alice(), "attributes/a6"), { ...ok, confirmedByRecruiter: false }));
    await assertFails(setDoc(doc(bob(), "attributes/a7"), ok));
  });
  it("client cannot change attribute value or any match", async () => {
    await assertFails(updateDoc(doc(alice(), "attributes/a1"), { value: "forged" }));
    await assertFails(updateDoc(doc(alice(), "attributes/a1"), { confirmedByRecruiter: true, value: "forged" }));
    await assertFails(updateDoc(doc(alice(), "matches/m1"), { rank: 9 }));
  });
  it("client can confirm or edit an attribute", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "attributes/a1"), { confirmedByRecruiter: true }));
    await assertSucceeds(updateDoc(doc(alice(), "attributes/a1"), { editedValue: "SAP FICO", updatedAt: new Date() }));
    await assertFails(updateDoc(doc(bob(), "attributes/a1"), { confirmedByRecruiter: true }));
    await assertFails(updateDoc(doc(alice(), "attributes/a1"), { confirmedByRecruiter: "yes" }));
    await assertFails(updateDoc(doc(alice(), "attributes/a1"), { editedValue: { x: 1 } }));
  });
});

describe("overrides", () => {
  it("create ok for self only", async () => {
    await assertSucceeds(setDoc(doc(alice(), "overrides/o2"), { ownerUid: A, decision: "shortlist" }));
    await assertFails(setDoc(doc(alice(), "overrides/o3"), { ownerUid: B }));
  });
  it("only reversedAt may be updated", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "overrides/o1"), { reversedAt: new Date() }));
    await assertFails(updateDoc(doc(alice(), "overrides/o1"), { reasonText: "changed" }));
    await assertFails(updateDoc(doc(alice(), "overrides/o1"), { decision: "shortlist" }));
  });
  it("reversal is one-way and can't be pre-set", async () => {
    await assertSucceeds(updateDoc(doc(alice(), "overrides/o1"), { reversedAt: new Date() }));
    await assertFails(updateDoc(doc(alice(), "overrides/o1"), { reversedAt: new Date(0) }));
    await assertFails(updateDoc(doc(alice(), "overrides/o1"), { reversedAt: null }));
    await assertFails(setDoc(doc(alice(), "overrides/o4"), { ownerUid: A, reversedAt: new Date() }));
  });
  it("delete denied", async () => {
    await assertFails(deleteDoc(doc(alice(), "overrides/o1")));
  });
});

describe("userPrefs", () => {
  it("own doc only", async () => {
    await assertSucceeds(setDoc(doc(alice(), `userPrefs/${A}`), { theme: "dark" }));
    await assertSucceeds(getDoc(doc(alice(), `userPrefs/${A}`)));
    await assertFails(getDoc(doc(bob(), `userPrefs/${A}`)));
    await assertFails(setDoc(doc(bob(), `userPrefs/${A}`), { theme: "light" }));
  });
});

const ctx = (uid: string, claims: Record<string, string>) => env.authenticatedContext(uid, claims).firestore();
const cand = () => ctx("cand1", { role: "candidate", candidateId: "c1" });
const cand2 = () => ctx("cand2", { role: "candidate", candidateId: "c2" });
const compX = () => ctx("compx", { role: "company", companyId: "X" });
const noRole = () => ctx("nobody", {});

describe("portal roles", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, "submissions/s1"), { ownerUid: A, submittedBy: "cand1", kind: "cv", status: "pending" });
      await setDoc(doc(db, "submissions/s2"), { ownerUid: A, submittedBy: "compx", kind: "brief", status: "pending" });
      await setDoc(doc(db, "shortlistEntries/e1"), { ownerUid: A, companyId: "X", roleId: "r1" });
      await setDoc(doc(db, "shortlistEntries/e2"), { ownerUid: A, companyId: "Y", roleId: "r2" });
      await setDoc(doc(db, "candidateUpdates/u1"), { ownerUid: A, portalUid: "cand1", status: "shortlisted" });
      await setDoc(doc(db, "courseSuggestions/c1"), { ownerUid: A, status: "approved", items: [{ title: "t" }] });
      await setDoc(doc(db, "courseSuggestions/c2"), { ownerUid: A, status: "draft", items: [] });
      await setDoc(doc(db, "portalUsers/cand1"), { ownerUid: A, role: "candidate" });
      await setDoc(doc(db, "invites/i1"), { ownerUid: A, companyId: "X", email: "m@x.test" });
    });
  });

  it("recruiter reads portal collections and manages invites", async () => {
    for (const p of ["submissions/s1", "shortlistEntries/e1", "candidateUpdates/u1", "courseSuggestions/c2", "portalUsers/cand1", "invites/i1"])
      await assertSucceeds(getDoc(doc(alice(), p)));
    await assertSucceeds(setDoc(doc(alice(), "invites/i2"), { ownerUid: A, companyId: "X" }));
    await assertSucceeds(deleteDoc(doc(alice(), "invites/i1")));
    await assertFails(getDoc(doc(bob(), "submissions/s1")));
  });

  it("candidate cannot read recruiter collections, even with a matching ownerUid", async () => {
    const mine = ctx(A, { role: "candidate", candidateId: "c1" });
    for (const p of ["candidates/c1", "attributes/a1", "matches/m1", "overrides/o1", "invites/i1", "shortlistEntries/e1"])
      await assertFails(getDoc(doc(mine, p)));
  });

  it("candidate reads own side only", async () => {
    await assertSucceeds(getDoc(doc(cand(), "submissions/s1")));
    await assertSucceeds(getDoc(doc(cand(), "candidateUpdates/u1")));
    await assertSucceeds(getDoc(doc(cand(), "courseSuggestions/c1")));
    await assertSucceeds(getDoc(doc(cand(), "portalUsers/cand1")));
    await assertFails(getDoc(doc(cand2(), "submissions/s1")));
    await assertFails(getDoc(doc(cand2(), "candidateUpdates/u1")));
    await assertFails(getDoc(doc(cand2(), "courseSuggestions/c1")));
    await assertFails(getDoc(doc(cand2(), "courseSuggestions/c2"))); // own id, but a draft
  });

  it("candidate may only snooze or dismiss an approved suggestion", async () => {
    const d = () => doc(cand(), "courseSuggestions/c1");
    await assertSucceeds(updateDoc(d(), { status: "snoozed", snoozedUntil: new Date(), updatedAt: new Date() }));
    await assertFails(updateDoc(d(), { status: "approved" }));
    await assertFails(updateDoc(d(), { status: "snoozed", items: [] }));
    await assertFails(updateDoc(d(), { status: "snoozed", snoozedUntil: "soon" }));
    await assertFails(updateDoc(doc(cand2(), "courseSuggestions/c1"), { status: "dismissed" }));
    await assertFails(deleteDoc(d()));
    await assertSucceeds(updateDoc(d(), { status: "dismissed" }));
    await assertFails(updateDoc(d(), { status: "snoozed" })); // dismissed is final
  });

  it("candidate cannot approve or touch a draft", async () => {
    await assertFails(updateDoc(doc(cand2(), "courseSuggestions/c2"), { status: "approved" }));
    await assertFails(updateDoc(doc(cand2(), "courseSuggestions/c2"), { status: "snoozed" }));
  });

  it("company reads own entries and submissions only", async () => {
    await assertSucceeds(getDoc(doc(compX(), "shortlistEntries/e1")));
    await assertSucceeds(getDoc(doc(compX(), "submissions/s2")));
    await assertFails(getDoc(doc(compX(), "shortlistEntries/e2")));
    await assertFails(getDoc(doc(compX(), "submissions/s1")));
    await assertFails(getDoc(doc(compX(), "invites/i1")));
    await assertFails(getDoc(doc(compX(), "candidates/c1")));
    await assertFails(getDoc(doc(compX(), "roles/r1")));
    await assertFails(updateDoc(doc(compX(), "shortlistEntries/e1"), { status: "hired" }));
    await assertFails(setDoc(doc(compX(), "shortlistEntries/e3"), { companyId: "X" }));
  });

  it("token with no role reads nothing but its own userPrefs", async () => {
    for (const p of ["candidates/c1", "attributes/a1", "submissions/s1", "shortlistEntries/e1", "candidateUpdates/u1", "courseSuggestions/c1", "portalUsers/cand1", "invites/i1"])
      await assertFails(getDoc(doc(noRole(), p)));
    const own = ctx(A, {}); // matching ownerUid, no role
    await assertFails(getDoc(doc(own, "candidates/c1")));
    await assertFails(setDoc(doc(own, "candidates/c9"), { ownerUid: A }));
    await assertSucceeds(setDoc(doc(noRole(), "userPrefs/nobody"), { theme: "dark" }));
    await assertSucceeds(setDoc(doc(cand(), "userPrefs/cand1"), { theme: "light" }));
  });

  it("no client creates, updates or deletes proxy-written portal docs", async () => {
    const targets = [
      [alice(), "submissions/s1"], [alice(), "shortlistEntries/e1"], [alice(), "candidateUpdates/u1"], [alice(), "portalUsers/cand1"],
      [cand(), "submissions/s1"], [compX(), "submissions/s2"],
    ] as const;
    for (const [c, p] of targets) {
      await assertFails(updateDoc(doc(c, p), { status: "accepted" }));
      await assertFails(deleteDoc(doc(c, p)));
    }
    for (const col of ["submissions", "shortlistEntries", "candidateUpdates", "portalUsers"]) {
      await assertFails(setDoc(doc(alice(), `${col}/new`), { ownerUid: A, submittedBy: A, portalUid: A }));
      await assertFails(setDoc(doc(cand(), `${col}/new`), { ownerUid: "cand1", submittedBy: "cand1", portalUid: "cand1" }));
    }
  });
});

describe("storage", () => {
  const st = (uid: string, claims: Record<string, string> = {}) => env.authenticatedContext(uid, claims).storage();
  it("recruiter reads another uid's cvs and briefs, nothing else", async () => {
    await assertSucceeds(uploadString(ref(st("cand1"), "users/cand1/cvs/a.pdf"), "pdf"));
    await assertSucceeds(uploadString(ref(st("cand1"), "users/cand1/other/a.txt"), "x"));
    const r = st(B, { role: "recruiter" });
    await assertSucceeds(getBytes(ref(r, "users/cand1/cvs/a.pdf")));
    await assertFails(getBytes(ref(r, "users/cand1/other/a.txt")));
    await assertFails(uploadString(ref(r, "users/cand1/cvs/b.pdf"), "pdf"));
    await assertFails(getBytes(ref(st("cand2", { role: "candidate", candidateId: "c2" }), "users/cand1/cvs/a.pdf")));
  });
  it("owner-only under users/{uid}", async () => {
    await assertSucceeds(uploadString(ref(st(A), `users/${A}/cvs/a.pdf`), "pdf"));
    await assertSucceeds(getBytes(ref(st(A), `users/${A}/cvs/a.pdf`)));
    await assertFails(getBytes(ref(st(B), `users/${A}/cvs/a.pdf`)));
    await assertFails(uploadString(ref(st(B), `users/${A}/cvs/b.pdf`), "pdf"));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), `users/${A}/cvs/a.pdf`)));
  });
});
