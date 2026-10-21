import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { Attribute, Candidate, Match } from "@tacit/shared";
import type { WithId } from "../../lib/data";
import { MatchCard } from "./MatchCard";

afterEach(cleanup);

const now = new Date("2026-10-21T12:00:00Z");
const attr = (id: string, observedAt: string): WithId<Attribute> =>
  ({ id, candidateId: "c1", sourceType: "note", observedAt: new Date(observedAt) }) as WithId<Attribute>;
const attrs = new Map([attr("old", "2025-08-12T00:00:00Z"), attr("new", "2026-10-16T00:00:00Z")].map((a) => [a.id, a]));
const reason = (text: string, id: string) => ({ text, attributeIds: [id] });

const match = {
  id: "m1", rank: 1, staleness: "fresh", questionsToAsk: [], skillAlignment: [], evidenceAgeDays: 0,
  reasonsFor: [reason("One", "new"), reason("Two", "new"), reason("Three", "new")],
  reasonsAgainst: [reason("Too much", "old")],
} as unknown as WithId<Match>;
const person = { id: "c1", fullName: "Sipho Mabaso", headline: "SAP support lead", lastOpenedAt: new Date("2025-08-21T00:00:00Z") } as WithId<Candidate>;

const view = (m = match, c: WithId<Candidate> | undefined = person) =>
  render(
    <MemoryRouter>
      <MatchCard match={m} candidate={c} attrs={attrs} decision={undefined} focal={false} now={now} saving={false} onShortlist={vi.fn()} onReject={vi.fn()} />
    </MemoryRouter>,
  );

describe("MatchCard in the hierarchy direction", () => {
  it("counts each side in words, singular for one", () => {
    view();
    expect(screen.getByRole("group", { name: "3 reasons for" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "1 reason against" })).toBeTruthy();
  });

  it("puts the age on the stale fact only, and links the source line to S03", () => {
    view();
    const stale = screen.getByRole("link", { name: /^Your note · 12 Aug 2025 · 14 months ago.*show source$/ });
    expect(stale.getAttribute("href")).toBe("/candidates/c1?attr=old");
    expect(screen.getAllByRole("link", { name: /^Your note · 16 Oct 2026.*show source$/ }).length).toBe(2);
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
