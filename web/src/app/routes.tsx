import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router";
import { RedirectIfSignedIn, RequireAuth } from "../features/auth";
import SignIn from "../screens/S07-sign-in/SignIn";
import CandidatesList from "../screens/S08-candidates-list/CandidatesList";
import CandidateProfile from "../screens/S03-candidate-profile/CandidateProfile";
import InterviewCapture from "../screens/S02-interview-capture/InterviewCapture";
import CvUpload from "../screens/S09-cv-upload/CvUpload";
import { Placeholder } from "./Placeholder";
import { Shell } from "./Shell";
import NotFound, { RouteError } from "../screens/S16-not-found/NotFound";

// One line per screen. To wire a finished screen, replace its <Placeholder/> with the screen component.
const DevGallery = import.meta.env.DEV ? lazy(() => import("../screens/dev-gallery/Gallery")) : null;

const Crash = import.meta.env.DEV ? lazy(() => import("../screens/S16-not-found/Crash")) : null;

const ph = (id: string, title: string) => <Placeholder id={id} title={title} />;

export const routes: RouteObject[] = [
  // DEV only, outside the auth guard so the component gallery opens without a session.
  ...(DevGallery ? [{ path: "/dev/components", errorElement: <RouteError standalone />, element: <Suspense fallback={null}><DevGallery /></Suspense> }] : []),
  { path: "/login", errorElement: <RouteError standalone />, element: <RedirectIfSignedIn><SignIn /></RedirectIfSignedIn> }, // no rail
  {
    errorElement: <RouteError standalone />, // the shell or the auth guard itself failed
    element: (
      <RequireAuth>
        <Shell />
      </RequireAuth>
    ),
    children: [
      { errorElement: <RouteError />, children: [ // a crash inside a screen keeps the shell
        ...(Crash ? [{ path: "/dev/crash", element: <Suspense fallback={null}><Crash /></Suspense> }] : []),
        { path: "/", element: ph("S01", "Dashboard") },
        { path: "/candidates", element: <CandidatesList /> },
        { path: "/candidates/new", element: <CvUpload /> },
        { path: "/candidates/:candidateId", element: <CandidateProfile /> },
        { path: "/candidates/:candidateId/notes/new", element: <InterviewCapture /> },
        { path: "/companies", element: ph("S10", "Companies") },
        { path: "/companies/:companyId", element: ph("S11", "Company profile") },
        { path: "/roles", element: ph("S12", "Roles") },
        { path: "/roles/new", element: ph("S13", "New role") },
        { path: "/roles/:roleId", element: ph("S04", "Match view") }, // S06 override dialog: ?dialog=override
        { path: "/brief", element: ph("S05", "Brief intake") },
        { path: "/settings", element: ph("S14", "Settings") },
        { path: "/widgets", element: ph("S17", "Widgets") },
        { path: "*", element: <NotFound /> },
      ] },
    ],
  },
];
