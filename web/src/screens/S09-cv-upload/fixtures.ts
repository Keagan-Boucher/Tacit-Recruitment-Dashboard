import type { CvField, CvParseJob, CvParseResult } from "@tacit/shared";
import { draftFromResult, type QueueItem } from "./parse";

// Dev only (`?state=`): synthetic South African candidates. Nothing here uploads, calls the proxy or writes.

const f = (value: string | null, confidence = 0.97, readAs: string | null = null, note: string | null = null): CvField => ({ value, readAs, confidence, note });
const j = (title: string, company: string | null, from: string | null, to: string | null, confidence = 0.96, readAs: string | null = null, note: string | null = null): CvParseJob => ({
  title, company, from, to, readAs, confidence, note,
});

const sipho: CvParseResult = {
  fullName: f("Sipho Mabaso"),
  headline: f("SAP FI consultant"),
  location: f("Johannesburg, Gauteng"),
  currentRole: f("Senior SAP FI consultant"),
  salaryExpectation: f("R62 000 per month"),
  history: [
    j("Senior SAP FI consultant", "Rand Merchant Group", "2021", null),
    j("SAP FI analyst", "Karoo Mining Holdings", "2017", "2021"),
  ],
  education: ["BCom Accounting, University of Johannesburg"],
  skills: ["SAP FI", "S/4HANA", "Month-end close", "Excel"],
  parseConfidence: 0.95,
};

const lerato: CvParseResult = {
  fullName: f("Lerato Dlamini"),
  headline: f("SAP consultant", 0.55, "SAP Constlant (MM/SD) - Gqeberha", "Spelling garbled. Did they mean MM and SD?"),
  location: f("Gqeberha, Eastern Cape"),
  currentRole: f("SAP MM analyst", 0.5, "PositiOn: S?P MM ana1yst", "Scan unclear."),
  salaryExpectation: f("R45 000", 0.6, "Sal. exp: 45k neg.", "Not sure if this is a month or a year."),
  history: [
    j("SAP MM analyst", "Nelson Mandela Bay Municipality", "2022", "2025"),
    j("Finance intern", null, "2021", "2021", 0.5, "Intern @ Ma?ula Holdings 2021", "Company name unreadable."),
  ],
  education: [],
  skills: ["SAP MM", "SAP SD", "Excel", "Power BI"],
  parseConfidence: 0.58,
};

const file = (name: string) => new File([`Synthetic CV for ${name}. Not a real person.`], `${name}.txt`, { type: "text/plain" });
const item = (n: string, fileName: string, status: QueueItem["status"], extra: Partial<QueueItem> = {}): QueueItem => ({
  id: n, kind: "file", fileName, status, file: file(n), ...extra,
});

const siphoItem = item("sipho", "sipho-mabaso-cv.pdf", "ready", { draft: draftFromResult(sipho, "dev/fixture") });
const leratoItem = item("lerato", "lerato-dlamini-cv.pdf", "ready", { draft: draftFromResult(lerato, "dev/fixture") });
const scan = item("scan", "scan-0042.jpg", "unreadable", { message: "Couldn’t read this reliably. The photo is too blurred." });

export interface Fixture { items: QueueItem[]; reviewId?: string }

export const FIXTURES: Record<string, Fixture> = {
  empty: { items: [] },
  default: {
    items: [
      siphoItem,
      leratoItem,
      item("thabo", "thabo-nkosi-cv.docx", "reading"),
      item("ayesha", "ayesha-patel-cv.pdf", "uploading"),
      item("nomvula", "nomvula-zulu-cv.pdf", "waiting"),
      scan,
    ],
  },
  parsing: {
    items: [
      item("thabo", "thabo-nkosi-cv.docx", "reading"),
      item("ayesha", "ayesha-patel-cv.pdf", "uploading"),
      item("nomvula", "nomvula-zulu-cv.pdf", "waiting"),
      item("pieter", "pieter-jacobs-cv.pdf", "waiting"),
    ],
  },
  review: { items: [siphoItem, leratoItem], reviewId: "sipho" },
  "low-confidence": { items: [siphoItem, leratoItem], reviewId: "lerato" },
  "parse-failed": {
    items: [
      siphoItem,
      item("ayesha", "ayesha-patel-cv.pdf", "failed", { message: "Couldn’t read this reliably." }),
      item("nomvula", "nomvula-zulu-cv.pdf", "failed", { message: "Can’t reach Tacit’s server." }),
      scan,
    ],
  },
};
