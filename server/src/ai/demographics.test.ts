import { describe, expect, it } from "vitest";
import { mentionsDemographic } from "./demographics.ts";

describe("mentionsDemographic", () => {
  it.each([
    "Muslim, so needs a prayer room", "Three kids, wants to be home for them", "She is 52 years old", "Age: 45", "female candidate",
    "Black female candidate", "South African citizen", "has a disability", "pregnant", "recently married", "looks young in the photo", "date of birth 1980",
    "in her fifties", "late 40s", "too old for the role", "Catholic", "Afrikaner", "gay", "sexual orientation", "uses a wheelchair",
    "autism", "depression last year", "5 months along", "does the school run", "her husband is relocating", "goes to church on Sundays",
    // precision pass: person phrasings that must keep matching, plus one per alternation group
    "he is 45 years old", "she's 32 y/o", "aged 29", "their partner works in Durban", "his wife", "her husband", "the candidate's age", "in her thirties",
    "a 45-year-old man", "45 year old SAP consultant", "a 45 year old software engineer", "38-year-old database administrator", "30 year old SAP ECC consultant", "a 40 year old legacy guy", "her partner programme manager", "her partner consultancy job", "his partner's job is in Pretoria", "her partner", "their pronouns", "bisexual", "an elderly candidate",
    "a young woman", "ethnicity", "nationality", "Hindu", "cancer treatment", "maternity leave", "the candidate's photo", "headshot attached", "family commitments",
  ])("flags %s", (s) => expect(mentionsDemographic(s)).toBe(true));
  it.each([
    "SAP HR payroll specialist", "Led two S/4HANA FI/CO rollouts", "System health check and HANA system copies", "Age analysis of receivables in FI",
    "Parent-child company codes", "Builds SuiteScript workflows", "Wants R75k, notice one calendar month", "Hybrid, two days in Durban", "Sonny's team lead role",
    "Worked with implementation partners", "Debtors aged 90 days", "citizen developer on Power Apps", "big picture thinker", "product family hierarchy in MM",
    "sick leave configuration in SuccessFactors", "Church Street office", "Temple Capital", "Photo-realistic reporting", "Son of Anton Consulting",
    "Wants to work in Cape Town", "medical aid and provident fund", "Speaks isiZulu and English",
    "12 year old SAP ECC", "a 20-year-old ERP landscape", "their partner network", "SAP partner ecosystem", "the partner's implementation team",
    "a 15 year old legacy system", "12 year old SAP ECC system is still running", "their partner portal",
  ])("keeps %s", (s) => expect(mentionsDemographic(s)).toBe(false));
});
