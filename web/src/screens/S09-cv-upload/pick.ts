// Browser-only: turn a drop into a flat list of files, walking dropped folders.
// webkitGetAsEntry is the only way to read a dropped folder; it is non-standard but supported by every current browser.

type Entry = { isFile: boolean; isDirectory: boolean; file?: (ok: (f: File) => void, no: (e: unknown) => void) => void; createReader?: () => { readEntries: (ok: (e: Entry[]) => void, no: (e: unknown) => void) => void } };

const readFile = (e: Entry) => new Promise<File>((ok, no) => e.file!(ok, no));

async function walk(e: Entry): Promise<File[]> {
  if (e.isFile) return [await readFile(e)];
  if (!e.isDirectory) return [];
  const reader = e.createReader!();
  const out: File[] = [];
  // readEntries returns at most ~100 entries a call; an empty batch means done
  for (;;) {
    const batch = await new Promise<Entry[]>((ok, no) => reader.readEntries(ok, no));
    if (!batch.length) return out;
    for (const child of batch) out.push(...(await walk(child)));
  }
}

export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  // Entries must be taken synchronously, before the first await: the DataTransfer is emptied after the event.
  const entries = [...dt.items].map((i) => (i.kind === "file" ? (i as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ?? null : null));
  if (entries.every((e) => e)) return (await Promise.all(entries.map((e) => walk(e!)))).flat();
  return [...dt.files];
}
