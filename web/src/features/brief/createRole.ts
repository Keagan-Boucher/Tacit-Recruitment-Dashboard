import { collection, doc, writeBatch } from "firebase/firestore";
import { Company, Role } from "@tacit/shared";
import { db } from "../../lib/firebase";
import type { InterpretedBrief as Picked } from "./BriefPicker";

type Input = {
  uid: string;
  /** What the BriefPicker handed back. */
  brief: Picked;
  /** Editable by the recruiter; falls back to nothing, so the caller makes sure it is not empty. */
  title: string;
  /** An existing company, or the name of a new one (created in the same batch as the role). */
  company: { id: string } | { name: string };
};

/** The role doc for a brief: model nulls become "" / 0 / ZAR so it passes the shared `Role`. Throws if it doesn't. */
export function buildRoleDoc({ uid, brief, title, companyId, now }: { uid: string; brief: Picked; title: string; companyId: string; now: Date }): Role {
  const r = brief.result;
  const { min, max, currency } = r.budget;
  return Role.parse({
    ownerUid: uid,
    createdAt: now,
    updatedAt: now,
    companyId,
    title: title.trim(),
    briefText: brief.briefText,
    briefSource: brief.briefSource,
    // Firestore rejects undefined, so the key is left out for pasted and typed briefs.
    ...(brief.briefFileRef ? { briefFileRef: brief.briefFileRef } : {}),
    interpretedBrief: {
      workMode: r.workMode ?? "",
      travel: r.travel ?? "",
      // A one-sided budget reads as that figure; no budget at all is 0 to 0.
      budget: { min: min ?? max ?? 0, max: max ?? min ?? 0, currency: currency ?? "ZAR" },
      location: r.location ?? "",
      mustHave: r.mustHave,
      niceToHave: r.niceToHave,
      seniority: r.seniority ?? "",
    },
    status: "open",
    openedAt: now,
  });
}

/** Creates the open role for an interpreted brief (and the company, when it is new) in one batch. Returns the role id. */
export async function createRoleFromBrief({ uid, brief, title, company }: Input): Promise<string> {
  const now = new Date();
  const batch = writeBatch(db);
  let companyId: string;
  if ("id" in company) companyId = company.id;
  else {
    const ref = doc(collection(db, "companies"));
    companyId = ref.id;
    batch.set(ref, Company.parse({ ownerUid: uid, createdAt: now, updatedAt: now, name: company.name.trim(), sector: "", hiringPattern: "", notes: "" }));
  }
  const roleRef = doc(collection(db, "roles"));
  batch.set(roleRef, buildRoleDoc({ uid, brief, title, companyId, now }));
  await batch.commit();
  return roleRef.id;
}
