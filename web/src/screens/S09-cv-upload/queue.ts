import { useSyncExternalStore } from "react";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import type { ParseCvResponse } from "@tacit/shared";
import { api } from "../../lib/api";
import { auth, storage } from "../../lib/firebase";
import { createQueue, type Deps, type Queue } from "./queueCore";

export const liveDeps: Deps = {
  uid: () => auth.currentUser?.uid,
  upload: async (file, path) => void (await uploadBytes(ref(storage, path), file)),
  parse: (fileRef) => api<ParseCvResponse>("/api/parse-cv", { fileRef }),
  removeFile: (path) => deleteObject(ref(storage, path)),
};

/** Module-level, so the queue survives leaving the screen and coming back. */
export const liveQueue = createQueue(liveDeps);

export const useQueue = (q: Queue) => useSyncExternalStore(q.subscribe, q.getSnapshot);
export { createQueue, type Queue } from "./queueCore";
