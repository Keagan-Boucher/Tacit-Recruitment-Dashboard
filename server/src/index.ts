import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { initFirebase } from "./firebase/admin.ts";

const config = loadConfig();
if (!config.recruiterUid) throw new Error("Missing required env var RECRUITER_UID. See server/.env.example.");
const verify = initFirebase(config);
createApp(config, verify, { db: getFirestore(), auth: getAuth(), bucket: getStorage().bucket() }).listen(config.port, () => {
  console.log(`Tacit proxy listening on :${config.port}`);
});
