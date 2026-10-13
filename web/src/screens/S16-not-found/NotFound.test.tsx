import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import Crash from "./Crash";
import NotFound, { RouteError } from "./NotFound";

afterEach(cleanup);

function renderAt(path: string) {
  const router = createMemoryRouter(
    [{ errorElement: <RouteError />, children: [{ path: "/boom", element: <Crash /> }, { path: "*", element: <NotFound /> }] }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe("S16", () => {
  it("shows not found for an unknown path, with a way home", () => {
    renderAt("/nope");
    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to dashboard/i }).getAttribute("href")).toBe("/");
  });

  it("shows the error variant, not a blank page, when a screen throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderAt("/boom");
    expect(screen.getByText(/nothing was lost/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /try again/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to dashboard/i })).toBeTruthy();
    expect(screen.queryByText(/Deliberate crash/)).toBeNull(); // no stack or message on screen
  });
});
