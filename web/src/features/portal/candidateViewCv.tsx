import { useState } from "react";
import { getDownloadURL, ref } from "firebase/storage";
import { Button } from "../../components";
import { storage } from "../../lib/firebase";

/** View CV in a new tab, from a Storage path the candidate owns. The URL is fetched at click time, never stored. */
export function ViewCv({ fileRef, label = "View CV", className }: { fileRef: string; label?: string; className?: string }) {
  const [error, setError] = useState(false);
  async function view() {
    setError(false);
    try {
      window.open(await getDownloadURL(ref(storage, fileRef)), "_blank", "noopener");
    } catch {
      setError(true);
    }
  }
  return (
    <>
      <Button icon="bx-show" className={className} onClick={view}>{label}</Button>
      {error && <p role="status" className="t-caption">Couldn’t open the file. Try again in a moment.</p>}
    </>
  );
}
