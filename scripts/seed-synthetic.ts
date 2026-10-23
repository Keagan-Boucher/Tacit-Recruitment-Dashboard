// Seeds synthetic data into the snap account's Firestore. `npm run seed -- --dry` validates and prints counts only.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { buildDataset, COLLECTIONS } from "./seed/dataset.ts";

const dry = process.argv.includes("--dry");
const root = resolve(import.meta.dirname, "..");
const counts = (d: ReturnType<typeof buildDataset>) => Object.fromEntries(COLLECTIONS.map((c) => [c, d[c].length]));

async function main() {
  if (dry) {
    console.log("dry run (nothing written):", counts(buildDataset(new Date(), "dry-run-owner")));
    return;
  }
  const keyPath = process.env.TACIT_SERVICE_ACCOUNT ?? resolve(root, "server/service-account.json");
  const envFile = (k: string) => {
    const f = resolve(root, "server/.env");
    return existsSync(f) ? readFileSync(f, "utf8").match(new RegExp(`^${k}=(.+)$`, "m"))?.[1].trim() : undefined;
  };
  const bucket = process.env.FIREBASE_STORAGE_BUCKET ?? envFile("FIREBASE_STORAGE_BUCKET");
  if (!bucket) throw new Error("FIREBASE_STORAGE_BUCKET is not set (env or server/.env) - needed to upload the seed CVs");
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))), storageBucket: bucket });
  const email = process.env.SNAP_EMAIL;
  if (!email) throw new Error("SNAP_EMAIL is not set (see .env.snap)");
  const { uid } = await getAuth().getUserByEmail(email);
  // The two portal accounts already exist (claims set elsewhere); only their uids and emails are read.
  const portalAcct = async (k: string) => {
    const e = process.env[`SNAP_${k}_EMAIL`];
    if (!e) throw new Error(`SNAP_${k}_EMAIL is not set (see .env.snap)`);
    return { uid: (await getAuth().getUserByEmail(e)).uid, email: e };
  };
  const data = buildDataset(new Date(), uid, { candidate: await portalAcct("CANDIDATE"), company: await portalAcct("COMPANY") }); // validates everything before any write
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });

  // Chunks of 400 stay under the 500-op batch limit.
  const run = async (ops: ((b: FirebaseFirestore.WriteBatch) => void)[]) => {
    for (let i = 0; i < ops.length; i += 400) {
      const b = db.batch();
      ops.slice(i, i + 400).forEach((op) => op(b));
      await b.commit();
    }
  };
  for (const c of COLLECTIONS) {
    const old = await db.collection(c).where("ownerUid", "==", uid).get();
    await run(old.docs.map((d) => (b) => b.delete(d.ref)));
  }
  for (const c of COLLECTIONS) await run(data[c].map((d) => (b) => b.set(db.collection(c).doc(d.id), d.data as object)));
  // CV files: overwrite, so re-running is idempotent. Path comes from each candidate's cvFileRef.
  for (const c of data.candidates as { data: { cvFileRef?: string } }[]) {
    const ref = c.data.cvFileRef;
    if (ref) await getStorage().bucket().upload(resolve(root, "scripts/seed/cvs", ref.split("/").pop()!), { destination: ref, contentType: "application/pdf" });
  }
  console.log("seeded", counts(data));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
