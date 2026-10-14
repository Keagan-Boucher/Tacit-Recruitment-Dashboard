import { describe, expect, it } from "vitest";
import { fileKind, readLabel } from "./helpers";

const now = new Date("2026-10-26T09:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("file helpers", () => {
  it("names the file type", () => {
    expect(fileKind("sipho-mabaso-cv.pdf")).toBe("PDF");
    expect(fileKind("cv")).toBe("File");
  });
  it("words the read date relatively", () => {
    expect(readLabel(ago(0), now)).toBe("Read today");
    expect(readLabel(ago(1), now)).toBe("Read 1 day ago");
    expect(readLabel(ago(425), now)).toBe("Read 1 year ago");
    expect(readLabel(ago(100), now)).toBe("Read 3 months ago");
  });
});
