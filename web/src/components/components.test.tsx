import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Button, Dialog, FilterChip, Input, RadioGroup, SegmentedControl, Toggle } from ".";

afterEach(cleanup);

// jsdom has no modal <dialog> support in every version; give it the minimum.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  proto.showModal ||= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button, [href], input, textarea")?.focus(); // what the browser does
  };
  proto.close ||= function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Opener</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Not this one">
        <button>Inside</button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("closes on Escape and returns focus to the opener", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Opener" });
    await user.click(opener);
    const dialog = document.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    await user.keyboard("{Escape}");
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});

describe("Toggle", () => {
  it("is a switch whose aria-checked flips", async () => {
    const user = userEvent.setup();
    function T() {
      const [on, setOn] = useState(false);
      return <Toggle label="Reduce motion" checked={on} onChange={setOn} showWord />;
    }
    render(<T />);
    const sw = screen.getByRole("switch", { name: "Reduce motion" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await user.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });
});

describe("SegmentedControl", () => {
  it("moves selection with the arrow keys", async () => {
    const user = userEvent.setup();
    function S() {
      const [v, setV] = useState("1×1");
      return (
        <SegmentedControl
          label="Size"
          value={v}
          onChange={setV}
          options={[
            { value: "1×1", label: "1×1" },
            { value: "2×1", label: "2×1" },
            { value: "2×2", label: "2×2" },
          ]}
        />
      );
    }
    render(<S />);
    screen.getByRole("radio", { name: "1×1" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "2×1" }).getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "2×1" }));
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "2×2" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("Input", () => {
  it("marks itself invalid and links the error message", () => {
    render(<Input label="Password" error="That email and password don’t match." />);
    const input = screen.getByLabelText("Password");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(input.getAttribute("aria-describedby")!);
    expect(message?.textContent).toContain("don’t match");
  });

  it("has no aria-invalid without an error", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email").hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("FilterChip", () => {
  it("reports its state with aria-pressed", async () => {
    const user = userEvent.setup();
    function F() {
      const [s, setS] = useState(false);
      return <FilterChip selected={s} count={41} onClick={() => setS(!s)}>Stale evidence</FilterChip>;
    }
    render(<F />);
    const chip = screen.getByRole("button", { name: /Stale evidence/ });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    await user.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("RadioGroup chip variant", () => {
  it("shows the check icon only on the selected chip", async () => {
    const user = userEvent.setup();
    function G() {
      const [v, setV] = useState<string | null>(null);
      return (
        <RadioGroup legend="Reason" variant="chip" value={v} onChange={setV}
          options={[{ value: "a", label: "Salary above budget" }, { value: "b", label: "Something else" }]} />
      );
    }
    render(<G />);
    expect(document.querySelectorAll("i.bx-check").length).toBe(0);
    await user.click(screen.getByLabelText("Salary above budget"));
    const icons = document.querySelectorAll("i.bx-check");
    expect(icons.length).toBe(1);
    expect(icons[0]!.closest("label")?.textContent).toContain("Salary above budget");
  });
});

describe("Button", () => {
  it("lg adds the 44 px class, default does not", () => {
    render(<><Button size="lg">Big</Button><Button>Normal</Button></>);
    expect(screen.getByText("Big").className).not.toBe(screen.getByText("Normal").className);
  });
});
