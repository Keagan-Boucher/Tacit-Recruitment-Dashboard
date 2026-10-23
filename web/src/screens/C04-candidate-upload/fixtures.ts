import type { CvField, CvParseResult } from "@tacit/shared";
import { readFromParse, type Read } from "./cv";

// Dev only (?state=): the Figma C04 frame's candidate, synthetic. Nothing here is sent anywhere.

const f = (value: string | null, confidence = 0.95): CvField => ({ value, readAs: null, confidence, note: null });

const parsed: CvParseResult = {
  fullName: f("Lerato Dlamini"),
  headline: f("SAP FI analyst"),
  location: f("Johannesburg"),
  currentRole: f("SAP FI analyst, Mzansi Freight"),
  salaryExpectation: f("R60 000", 0.5), // under LOW_CONFIDENCE: outlined in stale
  history: [
    { title: "SAP FI analyst", company: "Mzansi Freight", from: "2022", to: null, readAs: null, confidence: 0.92, note: null },
    { title: "Finance intern", company: "Maluleke Foods", from: "2021", to: "2021", readAs: "Intern @ Ma?ula", confidence: 0.45, note: "Company name unclear." },
  ],
  education: ["BCom Accounting, University of Johannesburg"],
  skills: ["SAP FI", "SAP CO", "Month-end close", "Excel"],
  parseConfidence: 0.82,
};

export const FIXTURE_FILE = { name: "lerato-dlamini-cv-2026.pdf", size: 188_416 };
export const FIXTURE_EMAIL = "lerato.dlamini@mail.test";

/** What the Figma frame shows once the candidate has added a phone number and chosen hybrid. */
export function fixtureRead(): { read: Read; details: Read["details"] } {
  const read = readFromParse(parsed);
  return { read, details: { ...read.details, phone: "+27 82 555 0187", workMode: "hybrid" } };
}
