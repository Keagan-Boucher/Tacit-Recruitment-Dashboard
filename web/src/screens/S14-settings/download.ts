/** Saves text as a file in the browser, no server involved. */
export function download({ filename, json }: { filename: string; json: string }) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
