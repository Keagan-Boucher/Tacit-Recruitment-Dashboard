import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router";
import { Placeholder } from "./Placeholder";
import { Shell } from "./Shell";

// One line per screen. To wire a finished screen, replace its <Placeholder/> with the screen component.
const DevGallery = import.meta.env.DEV ? lazy(() => import("../screens/dev-gallery/Gallery")) : null;

const ph = (id: string, title: string) => <Placeholder id={id} title={title} />;

export const routes: RouteObject[] = [
  { path: "/login", element: ph("S07", "Sign in") }, // no rail
  {
    element: <Shell />,
    children: [
      { path: "/", element: ph("S01", "Dashboard") },
      { path: "/candidates", element: ph("S08", "Candidates") },
      { path: "/candidates/new", element: ph("S09", "CV upload") },
      { path: "/candidates/:candidateId", element: ph("S03", "Candidate profile") },
      { path: "/candidates/:candidateId/notes/new", element: ph("S02", "Interview capture") },
      { path: "/companies", element: ph("S10", "Companies") },
      { path: "/companies/:companyId", element: ph("S11", "Company profile") },
      { path: "/roles", element: ph("S12", "Roles") },
      { path: "/roles/new", element: ph("S13", "New role") },
      { path: "/roles/:roleId", element: ph("S04", "Match view") }, // S06 override dialog: ?dialog=override
      { path: "/brief", element: ph("S05", "Brief intake") },
      { path: "/settings", element: ph("S14", "Settings") },
      { path: "/widgets", element: ph("S17", "Widgets") },
      ...(DevGallery
        ? [{ path: "/dev/components", element: <Suspense fallback={null}><DevGallery /></Suspense> }]
        : []),
      { path: "*", element: ph("S16", "Not found") },
    ],
  },
];
