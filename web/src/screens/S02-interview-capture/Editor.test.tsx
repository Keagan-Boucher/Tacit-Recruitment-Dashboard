import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Editor } from "./Editor";

const Q = ["Where are you now?", "Salary and notice"];

function Harness({ start, seen }: { start: string; seen: string[] }) {
  const [text, setText] = useState(start);
  return <Editor text={text} questions={Q} placeholder="Write." autoFocus={false} onChange={(t) => (seen.push(t), setText(t))} onCursor={() => {}} />;
}

describe("Editor", () => {
  it("shows each question as a label for its own answer and keeps the stored text unchanged", async () => {
    const seen: string[] = [];
    render(<Harness start={"Where are you now?\nBored.\n\nSalary and notice\n"} seen={seen} />);
    const answer = screen.getByLabelText("Where are you now?");
    expect((answer as HTMLTextAreaElement).value).toBe("Bored."); // the blank separator line stays in the text but is not shown
    await userEvent.type(answer, "!");
    expect(seen.at(-1)).toBe("Where are you now?\nBored.!\n\nSalary and notice\n");
    await userEvent.type(screen.getByLabelText("Salary and notice"), "R65k");
    expect(seen.at(-1)).toBe("Where are you now?\nBored.!\n\nSalary and notice\nR65k");
  });

  it("is one plain field until a heading is added", async () => {
    const seen: string[] = [];
    render(<Harness start="" seen={seen} />);
    await userEvent.type(screen.getByLabelText("Interview note"), "Hi");
    expect(seen.at(-1)).toBe("Hi");
  });
});
