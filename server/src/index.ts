import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initFirebase } from "./firebase/admin.ts";

const config = loadConfig();
const verify = initFirebase(config);
createApp(config, verify, { db: getFirestore(), bucket: getStorage().bucket() }).listen(config.port, () => {
  console.log(`Tacit proxy listening on :${config.port}`);
});
