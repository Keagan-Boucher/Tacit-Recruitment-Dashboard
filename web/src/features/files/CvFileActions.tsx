import { useState } from "react";
import { getBlob, getDownloadURL, ref } from "firebase/storage";
import { Button } from "../../components";
import { storage } from "../../lib/firebase";

/** View CV (new tab) and Download for an owner-only Storage file. URLs are fetched at click time, never stored. */
export function CvFileActions({ fileRef, fileName, className }: { fileRef: string; fileName: string; className?: string }) {
  const [error, setError] = useState(false);

  const run = (fn: () => Promise<void>) => async () => {
    setError(false);
    try {
      await fn();
    } catch {
      setError(true);
    }
  };

  const view = run(async () => {
    const url = await getDownloadURL(ref(storage, fileRef));
    window.open(url, "_blank", "noopener");
  });

  const download = run(async () => {
    // getBlob retries network errors (e.g. a bucket without CORS) for minutes; give up and say so instead.
    const blob = await Promise.race([
      getBlob(ref(storage, fileRef)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 15_000)),
    ]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  return (
    <>
      <div className={className}>
        <Button icon="bx-show" onClick={view}>View CV</Button>
        <Button icon="bx-download" onClick={download}>Download</Button>
      </div>
      {error && <p role="status" className="t-caption">Couldn't open the file. Try again in a moment.</p>}
    </>
  );
}
