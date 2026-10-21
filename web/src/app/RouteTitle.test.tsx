import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { routes } from "./routes";
import { RouteTitle } from "./RouteTitle";

afterEach(cleanup);

function leaves(rs: RouteObject[]): RouteObject[] {
  return rs.flatMap((r) => (r.children ? leaves(r.children) : [r]));
}

describe("route titles", () => {
  it("gives every page route a distinct title (the dev crash route aside)", () => {
    const titled = leaves(routes).filter((r) => r.path !== "/dev/crash");
    const titles = titled.map((r) => (r.handle as { title?: string } | undefined)?.title);
    expect(titles.every(Boolean)).toBe(true);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("sets document.title to '<Page> · Tacit' for the deepest match", () => {
    const router = createMemoryRouter(
      [{ element: <RouteTitle />, children: [{ path: "/roles", handle: { title: "Roles" }, element: null }] }],
      { initialEntries: ["/roles"] },
    );
    render(<RouterProvider router={router} />);
    expect(document.title).toBe("Roles · Tacit");
  });
});
