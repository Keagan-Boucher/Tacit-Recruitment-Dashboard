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

const alice = () => env.authenticatedContext(A).firestore();
const bob = () => env.authenticatedContext(B).firestore();

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

describe("storage", () => {
  const st = (uid: string) => env.authenticatedContext(uid).storage();
  it("owner-only under users/{uid}", async () => {
    await assertSucceeds(uploadString(ref(st(A), `users/${A}/cvs/a.pdf`), "pdf"));
    await assertSucceeds(getBytes(ref(st(A), `users/${A}/cvs/a.pdf`)));
    await assertFails(getBytes(ref(st(B), `users/${A}/cvs/a.pdf`)));
    await assertFails(uploadString(ref(st(B), `users/${A}/cvs/b.pdf`), "pdf"));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), `users/${A}/cvs/a.pdf`)));
  });
});
