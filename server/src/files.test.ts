import { describe, expect, it } from "vitest";
import { FileError, readUploadText, type BucketLike } from "./files.ts";

function pdf(text: string) {
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  return Buffer.from(out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

const bucket = (files: Record<string, { buf: Buffer; contentType?: string }>): BucketLike => ({
  file: (p) => ({
    getMetadata: async () => {
      const f = files[p];
      if (!f) throw Object.assign(new Error("nf"), { code: 404 });
      return [{ size: f.buf.length, contentType: f.contentType }];
    },
    download: async () => [files[p]!.buf],
  }),
});
const ok = (name: string, buf: Buffer, contentType?: string) => ({
  b: bucket({ [`users/u1/cvs/${name}`]: { buf, contentType } }),
  ref: `users/u1/cvs/${name}`,
});
const code = (p: Promise<unknown>) => p.then(() => null, (e: FileError) => [e.status, e.code]);

describe("readUploadText", () => {
  it("path check", async () => {
    const b = bucket({});
    const refs = ["users/u2/cvs/a.txt", "users/u1/cvs/../a.txt", "users/u1/briefs/a.txt", "users/u1/cvs/x/a.txt", "users/u1/cvs/", "a.txt", "users/u1/cvs/..\\a.txt"];
    for (const ref of refs) expect(await code(readUploadText(b, "u1", ref, "cvs")), ref).toEqual([400, "bad_request"]);
  });
  it("missing object 404, unknown extension, wrong content type", async () => {
    expect(await code(readUploadText(bucket({}), "u1", "users/u1/cvs/a.txt", "cvs"))).toEqual([404, "not_found"]);
    const x = ok("a.exe", Buffer.from("hi"));
    expect(await code(readUploadText(x.b, "u1", x.ref, "cvs"))).toEqual([400, "bad_file"]);
    const y = ok("a.pdf", Buffer.from("hi"), "image/png");
    expect(await code(readUploadText(y.b, "u1", y.ref, "cvs"))).toEqual([400, "bad_file"]);
  });
  it("over 10 MB", async () => {
    const b: BucketLike = { file: () => ({ getMetadata: async () => [{ size: 11 * 1024 * 1024 }], download: async () => [Buffer.alloc(1)] }) };
    expect(await code(readUploadText(b, "u1", "users/u1/cvs/a.txt", "cvs"))).toEqual([400, "bad_file"]);
  });
  it("empty text is 422", async () => {
    const x = ok("a.txt", Buffer.from("  \n \n"));
    expect(await code(readUploadText(x.b, "u1", x.ref, "cvs"))).toEqual([422, "bad_file"]);
    const p = ok("scan.pdf", pdf(""), "application/pdf");
    expect(await code(readUploadText(p.b, "u1", p.ref, "cvs"))).toEqual([422, "bad_file"]);
  });
  it("txt: normalises whitespace", async () => {
    const x = ok("a.txt", Buffer.from("Jo   Smith\n\n\n\nSAP\t FICO  "));
    expect(await readUploadText(x.b, "u1", x.ref, "cvs")).toEqual({ text: "Jo Smith\n\nSAP FICO", fileName: "a.txt" });
  });
  it("pdf", async () => {
    const x = ok("cv.pdf", pdf("Thandi Nkosi SAP FICO Consultant"), "application/pdf");
    expect((await readUploadText(x.b, "u1", x.ref, "cvs")).text).toContain("SAP FICO Consultant");
  });
  it("eml: subject and body", async () => {
    const eml = "From: a@b.test\r\nTo: c@d.test\r\nSubject: SAP FICO role\r\nContent-Type: text/plain\r\n\r\nHybrid, budget R50k.\r\n";
    const b = bucket({ "users/u1/briefs/m.eml": { buf: Buffer.from(eml), contentType: "message/rfc822" } });
    expect((await readUploadText(b, "u1", "users/u1/briefs/m.eml", "briefs")).text).toBe("SAP FICO role\nHybrid, budget R50k.");
  });
  it("corrupt docx/msg is bad_file", async () => {
    for (const n of ["a.docx", "a.msg"]) {
      const x = ok(n, Buffer.from("not a real file"));
      // 400 (can't open) or 422 (opened, no text): either way a plain bad_file, never a 500.
      expect((await code(readUploadText(x.b, "u1", x.ref, "cvs")))?.[1]).toBe("bad_file");
    }
  });
});
