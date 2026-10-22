import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Attribute, AttributeType, Candidate, Match, Override } from "@tacit/shared";
import type { WithId } from "../../lib/data";
import { MatchCard } from "./MatchCard";

afterEach(cleanup);

const now = new Date("2026-10-21T12:00:00Z");
const attr = (id: string, observedAt: string, type: AttributeType = "salary"): WithId<Attribute> =>
  ({ id, candidateId: "c1", sourceType: "note", type, value: "R60k", observedAt: new Date(observedAt) }) as WithId<Attribute>;
const attrs = new Map([attr("old", "2025-08-12T00:00:00Z"), attr("new", "2026-10-16T00:00:00Z"), attr("skill", "2025-08-12T00:00:00Z", "skill")].map((a) => [a.id, a]));
const reason = (text: string, id: string) => ({ text, attributeIds: [id] });

const match = {
  id: "m1", rank: 1, staleness: "fresh", questionsToAsk: [], skillAlignment: [], evidenceAgeDays: 0,
  reasonsFor: [reason("One", "new"), reason("Two", "new"), reason("Three", "new")],
  reasonsAgainst: [reason("Too much", "old")],
} as unknown as WithId<Match>;
const person = { id: "c1", fullName: "Sipho Mabaso", headline: "SAP support lead", lastOpenedAt: new Date("2025-08-21T00:00:00Z") } as WithId<Candidate>;

const view = (m = match, c: WithId<Candidate> | undefined = person, decision: WithId<Override> | undefined = undefined, onChange = vi.fn()) =>
  render(
    <MemoryRouter>
      <MatchCard match={m} candidate={c} attrs={attrs} decision={decision} focal={false} now={now} saving={false} onShortlist={vi.fn()} onReject={vi.fn()} onChange={onChange} />
    </MemoryRouter>,
  );

describe("MatchCard in the hierarchy direction", () => {
  it("counts each side in words, singular for one", () => {
    view();
    expect(screen.getByRole("group", { name: "3 reasons for" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "1 reason against" })).toBeTruthy();
  });

  it("puts the age on the stale perishable fact only, and links the source line to S03", () => {
    view();
    const stale = screen.getByRole("link", { name: /^Your note · 12 Aug 2025 · 14 months ago.*show source$/ });
    expect(stale.getAttribute("href")).toBe("/candidates/c1?attr=old");
    expect(screen.getAllByRole("link", { name: /^Your note · 16 Oct 2026.*show source$/ }).length).toBe(2);
  });

  it("shows no age on a stale fact that does not go out of date", () => {
    view({ ...match, reasonsFor: [reason("Certified", "skill")] } as WithId<Match>);
    expect(screen.getByRole("link", { name: /^Your note · 12 Aug 2025s*— show source$/ })).toBeTruthy();
  });

  it("shows two reasons, then the rest behind 'and N more'", async () => {
    view();
    expect(screen.queryByText("Three")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "and 1 more" }));
    expect(screen.getByText("Three")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show fewer" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("says how long it has been since the profile was opened, as text with no chip", () => {
    view();
    expect(screen.getByText(/Not opened in/).textContent).toBe("Not opened in 14 months");
    cleanup();
    view(match, { ...person, lastOpenedAt: new Date("2026-10-20T00:00:00Z") } as WithId<Candidate>);
    expect(screen.queryByText(/Not opened/)).toBeNull();
  });

  it("keeps the honest empty text when nothing is against", () => {
    view({ ...match, reasonsAgainst: [] } as WithId<Match>);
    expect(screen.getByText(/Tacit couldn't ground a reason against/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "0 reasons against" })).toBeTruthy();
  });

  it("renders no link when a reason's source does not resolve", () => {
    view({ ...match, reasonsFor: [reason("Orphan", "missing")] } as WithId<Match>);
    expect(screen.getByText("Orphan")).toBeTruthy();
    expect(screen.queryAllByRole("link", { name: /show source/ }).length).toBe(1); // only the against reason's
  });
});

describe("skill alignment in words", () => {
  const withAlign = {
    ...match,
    skillAlignment: [
      { requirement: "FI/CO on S/4HANA", evidence: "passed the FICO certification", kind: "stated", attributeIds: ["skill"] },
      { requirement: "Group reporting", evidence: "worked on consolidation", kind: "interpreted", attributeIds: ["old"] },
      { requirement: "Asset accounting", evidence: "", kind: "not-seen", attributeIds: [] },
    ],
  } as unknown as WithId<Match>;

  it("heads the count, then each requirement with its evidence line and no chips", () => {
    view(withAlign);
    expect(screen.getByRole("heading", { name: "Skill alignment 2 of 3 in your notes" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^stated in your note · 12 Aug 2025 · passed the FICO certifications*— show source$/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^interpreted from your note · 12 Aug 2025 · worked on consolidation · 14 months ago/ })).toBeTruthy();
    expect(screen.getByText("Not in your notes")).toBeTruthy();
    expect(screen.queryByText("Stated")).toBeNull();
    expect(screen.queryByText("Interpreted")).toBeNull();
  });
});

describe("the stale prompt and the decision", () => {
  const stale = { ...match, staleness: "stale", questionsToAsk: ["Is R60k firm?"] } as unknown as WithId<Match>;
  it("puts Shortlist and Not this one beside the prompt, with the aged salary as its source", () => {
    view(stale);
    expect(screen.getByText("Before you shortlist, ask:")).toBeTruthy();
    expect(screen.getByRole("link", { name: /^Salary R60k · Your note · 12 Aug 2025 · 14 months ago/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Shortlist/ })).toBeTruthy();
  });

  const decided = (o: Partial<Override>) =>
    ({ id: "o1", matchId: "m1", decision: "shortlist", reasonCodes: [], reasonText: "", decidedAt: new Date("2026-10-21T12:00:00Z"), ...o }) as WithId<Override>;
  it("replaces the buttons with the decision in words, who and when, and a Change control", async () => {
    const onChange = vi.fn();
    view(match, person, decided({}), onChange);
    expect(screen.queryByRole("button", { name: /^Shortlist/ })).toBeNull();
    expect(screen.getByText("Shortlisted")).toBeTruthy();
    expect(screen.getByText("Your call · 21 Oct 2026")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Change decision on Sipho Mabaso" }));
    expect(onChange).toHaveBeenCalledOnce();
  });
  it("quotes the reason after Not this one", () => {
    view(match, person, decided({ decision: "reject", reasonText: "Wants R65k, above the budget." }));
    expect(screen.getByText("Not this one")).toBeTruthy();
    expect(screen.getByText(/^Your reason · 21 Oct 2026/).textContent).toBe("Your reason · 21 Oct 2026 · “Wants R65k, above the budget.”");
  });
});
