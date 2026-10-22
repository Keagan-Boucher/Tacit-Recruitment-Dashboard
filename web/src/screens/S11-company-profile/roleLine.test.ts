import { describe, expect, it } from "vitest";
import type { Match, Override } from "@tacit/shared";
import { roleCounts, roleLine } from "./roleLine";

const m = (id: string, roleId = "r1") => ({ id, roleId }) as unknown as Match & { id: string };
const o = (matchId: string, decision: Override["decision"], day: number, reversedAt?: Date) => ({ matchId, decision, decidedAt: new Date(2026, 9, day), reversedAt }) as unknown as Override;

describe("role line", () => {
  it("counts waiting, shortlisted and passed; the latest unreversed decision wins", () => {
    const c = roleCounts("r1", [m("a"), m("b"), m("c"), m("d"), m("x", "r2")], [o("a", "shortlist", 1), o("b", "reject", 2), o("c", "reject", 3), o("c", "shortlist", 4), o("d", "reject", 5, new Date(2026, 9, 6))]);
    expect(c).toEqual({ waiting: 1, shortlisted: 2, passed: 1 });
  });

  it("reads waiting first, then what was decided, then nothing", () => {
    expect(roleLine({ waiting: 7, shortlisted: 0, passed: 0 })).toBe("7 suggestions waiting on you");
    expect(roleLine({ waiting: 1, shortlisted: 0, passed: 0 })).toBe("1 suggestion waiting on you");
    expect(roleLine({ waiting: 0, shortlisted: 2, passed: 1 })).toBe("2 shortlisted, 1 passed");
    expect(roleLine({ waiting: 0, shortlisted: 0, passed: 0 })).toBe("No suggestions yet");
  });
});
