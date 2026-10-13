// Seeds synthetic data into the snap account's Firestore. `npm run seed -- --dry` validates and prints counts only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
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
  initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))) });
  const email = process.env.SNAP_EMAIL;
  if (!email) throw new Error("SNAP_EMAIL is not set (see .env.snap)");
  const { uid } = await getAuth().getUserByEmail(email);
  const data = buildDataset(new Date(), uid); // validates everything before any write
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
  console.log("seeded", counts(data));
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
