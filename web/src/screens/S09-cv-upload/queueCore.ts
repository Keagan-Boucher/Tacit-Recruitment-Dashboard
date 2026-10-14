import type { ParseCvResponse } from "@tacit/shared";
import { blankDraft, describeError, draftFromResult, nextToRun, storagePath, type Draft, type QueueItem } from "./parse";

// The parse queue, free of Firebase and React so it unit-tests. It lives outside React so a recruiter can leave the screen and come back while CVs are still being
// read ("You can keep working in the meantime"). ponytail: module state only; a full page reload loses the queue
// (the uploaded files stay in Storage). Persist the queue to Firestore if that starts to hurt.

export interface Deps {
  uid: () => string | undefined;
  upload: (file: File, path: string) => Promise<void>;
  /** Groq's tier allows about 8000 tokens a minute, so the queue calls this one file at a time. */
  parse: (fileRef: string) => Promise<ParseCvResponse>;
  removeFile: (path: string) => Promise<void>;
}

export function createQueue(deps: Deps, seed: readonly QueueItem[] = []) {
  let items: readonly QueueItem[] = seed;
  let seq = 0;
  let lastStamp = 0;
  let pumping = false;
  const listeners = new Set<() => void>();

  const set = (next: readonly QueueItem[]) => {
    items = next;
    listeners.forEach((l) => l());
  };
  const patch = (id: string, p: Partial<QueueItem>) => set(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const find = (id: string) => items.find((i) => i.id === id);
  /** Two files picked in the same millisecond still get different paths. */
  const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));

  async function run(id: string) {
    let stage: "upload" | "read" = "upload";
    try {
      let fileRef = find(id)?.fileRef;
      if (!fileRef) {
        const uid = deps.uid();
        const file = find(id)?.file;
        if (!uid || !file) throw new Error("not signed in");
        fileRef = storagePath(uid, file.name, stamp());
        patch(id, { status: "uploading" });
        await deps.upload(file, fileRef);
        patch(id, { fileRef });
      }
      stage = "read";
      patch(id, { status: "reading" });
      const { result, modelVersion } = await deps.parse(fileRef);
      patch(id, { status: "ready", message: undefined, draft: draftFromResult(result, modelVersion) });
    } catch (e) {
      patch(id, describeError(e, stage));
    }
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      for (let next = nextToRun(items); next; next = nextToRun(items)) await run(next.id);
    } finally {
      pumping = false;
    }
  }

  return {
    subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
    getSnapshot: () => items,

    enqueue(files: readonly File[]) {
      set([...items, ...files.map((file): QueueItem => ({ id: `q${++seq}-${Date.now()}`, kind: "file", fileName: file.name, file, status: "waiting" }))]);
      void pump();
    },
    /** A blank draft nothing has read, for "Add by hand". Returns its id. */
    addByHand(): string {
      const id = `h${++seq}-${Date.now()}`;
      set([...items, { id, kind: "hand", fileName: "New candidate", status: "ready", draft: blankDraft() }]);
      return id;
    },
    /** A file the model couldn't read becomes a blank draft; the file stays attached so View CV still works. */
    byHandFromFile(id: string) {
      patch(id, { kind: "hand", status: "ready", message: undefined, draft: blankDraft() });
    },
    setDraft: (id: string, draft: Draft) => patch(id, { draft }),
    retry(id: string) {
      patch(id, { status: "waiting", message: undefined });
      void pump();
    },
    /** Written to Firestore already (or never going to be): just take it off the list. */
    remove: (id: string) => set(items.filter((i) => i.id !== id)),
    /** Nothing is saved, and the upload goes with it. */
    discard(id: string) {
      const fileRef = find(id)?.fileRef;
      set(items.filter((i) => i.id !== id));
      // ponytail: a failed delete leaves a private orphan in the recruiter's own folder; nothing else references it
      if (fileRef) void deps.removeFile(fileRef).catch(() => undefined);
    },
  };
}

export type Queue = ReturnType<typeof createQueue>;
