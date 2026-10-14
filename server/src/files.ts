import { simpleParser } from "mailparser";
import mammoth from "mammoth";
import MsgReader from "@kenjiuno/msgreader";
import { extractText, getDocumentProxy } from "unpdf";

/** The slice of the Admin SDK Bucket we use, so tests can pass a tiny fake. */
export interface BucketLike {
  file(path: string): {
    download(): Promise<[Buffer]>;
    getMetadata(): Promise<[{ size?: string | number; contentType?: string }, ...unknown[]]>;
  };
}

/** A file-level failure the route turns into an ApiErrorBody. */
export class FileError extends Error {
  constructor(
    readonly status: number,
    readonly code: "bad_request" | "not_found" | "bad_file",
    message: string,
  ) {
    super(message);
  }
}

const MAX_BYTES = 10 * 1024 * 1024;
// ponytail: ~40k chars (about 10k tokens) keeps one CV/brief well inside the model context; longer specs are truncated, chunk if that bites.
export const MAX_CHARS = 40_000;
export const MAX_PDF_PAGES = 30;

// Sanity check only: browsers and Storage report many types for the same file, so octet-stream always passes.
const EXT_TYPES: Record<string, RegExp> = {
  pdf: /pdf|octet-stream/,
  docx: /wordprocessingml|msword|octet-stream|zip/,
  eml: /rfc822|text\/plain|octet-stream|email/,
  msg: /outlook|ms-tnef|octet-stream|msg/,
  txt: /text\/plain|octet-stream/,
};

const notYours = () => new FileError(400, "bad_request", "That file isn't in your uploads.");

export async function readUploadText(bucket: BucketLike, uid: string, fileRef: string, folder: "cvs" | "briefs") {
  // Trust boundary: exactly users/<uid>/<folder>/<name>, caller's uid, no traversal.
  const parts = fileRef.split("/");
  const name = parts[3];
  if (parts.length !== 4 || parts[0] !== "users" || parts[1] !== uid || parts[2] !== folder || !name) throw notYours();
  if (name.includes("..") || /[\\\0]/.test(fileRef)) throw notYours();

  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const typeOk = EXT_TYPES[ext];
  if (!typeOk) throw new FileError(400, "bad_file", "We can read PDF, DOCX, EML, MSG and TXT files.");

  const file = bucket.file(fileRef);
  let meta: { size?: string | number; contentType?: string };
  let buf: Buffer;
  try {
    [meta] = await file.getMetadata();
    if (Number(meta.size ?? 0) > MAX_BYTES) throw new FileError(400, "bad_file", "That file is over 10 MB.");
    [buf] = await file.download();
  } catch (e) {
    if (e instanceof FileError) throw e;
    if ((e as { code?: number })?.code === 404) throw new FileError(404, "not_found", "File not found.");
    throw e;
  }
  if (buf.length > MAX_BYTES) throw new FileError(400, "bad_file", "That file is over 10 MB.");
  if (meta.contentType && !typeOk.test(meta.contentType.toLowerCase())) {
    throw new FileError(400, "bad_file", "That file's type doesn't match its extension.");
  }

  let raw: string;
  try {
    if (ext === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      if (pdf.numPages > MAX_PDF_PAGES) throw new FileError(400, "bad_file", `That PDF is over ${MAX_PDF_PAGES} pages.`);
      raw = (await extractText(pdf, { mergePages: true })).text;
    } else if (ext === "docx") {
      raw = (await mammoth.extractRawText({ buffer: buf })).value;
    } else if (ext === "eml") {
      const m = await simpleParser(buf);
      raw = `${m.subject ?? ""}\n${m.text ?? ""}`;
    } else if (ext === "msg") {
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const d = new MsgReader(ab).getFileData();
      raw = `${d.subject ?? ""}\n${d.body ?? ""}`;
    } else {
      raw = buf.toString("utf8");
    }
  } catch (e) {
    if (e instanceof FileError) throw e;
    console.warn("file parse failed", ext, (e as Error)?.name); // name only: parser messages can contain file text
    // ponytail: parsers run in-process with no memory cap, so a decompression bomb could exhaust the proxy. Only
    // allow-listed users can call it (ALLOWED_UIDS); move extraction to a worker with resourceLimits if that changes.
    throw new FileError(400, "bad_file", "We couldn't open that file. It may be damaged.");
  }

  const text = raw
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\r?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
  if (!text) throw new FileError(422, "bad_file", "We couldn't read any text in this file.");
  return { text, fileName: name };
}
