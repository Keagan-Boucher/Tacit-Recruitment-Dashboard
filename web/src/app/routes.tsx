import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router";
import { RedirectIfSignedIn, RequireAuth } from "../features/auth";
import SignIn from "../screens/S07-sign-in/SignIn";
import CandidatesList from "../screens/S08-candidates-list/CandidatesList";
import CandidateProfile from "../screens/S03-candidate-profile/CandidateProfile";
import InterviewCapture from "../screens/S02-interview-capture/InterviewCapture";
import CvUpload from "../screens/S09-cv-upload/CvUpload";
import MatchView from "../screens/S04-match-view/MatchView";
import Dashboard from "../screens/S01-dashboard/Dashboard";
import BriefIntake from "../screens/S05-brief-intake/BriefIntake";
import RolesList from "../screens/S12-roles-list/RolesList";
import RoleForm from "../screens/S13-role-form/RoleForm";
import Widgets from "../screens/S17-widgets/Widgets";
import CompaniesList from "../screens/S10-companies-list/CompaniesList";
import CompanyProfile from "../screens/S11-company-profile/CompanyProfile";
import Settings from "../screens/S14-settings/Settings";
import { RouteTitle } from "./RouteTitle";
import { Shell } from "./Shell";
import NotFound, { RouteError } from "../screens/S16-not-found/NotFound";

// One line per screen.
const DevGallery = import.meta.env.DEV ? lazy(() => import("../screens/dev-gallery/Gallery")) : null;

const Crash = import.meta.env.DEV ? lazy(() => import("../screens/S16-not-found/Crash")) : null;


export const routes: RouteObject[] = [
  // DEV only, outside the auth guard so the component gallery opens without a session.
  ...(DevGallery ? [{ path: "/dev/components", handle: { title: "Components" }, errorElement: <RouteError standalone />, element: <Suspense fallback={null}><DevGallery /></Suspense> }] : []),
  { path: "/login", handle: { title: "Sign in" }, errorElement: <RouteError standalone />, element: <><RouteTitle /><RedirectIfSignedIn><SignIn /></RedirectIfSignedIn></> }, // no rail
  {
    errorElement: <RouteError standalone />, // the shell or the auth guard itself failed
    element: (
      <>
        <RouteTitle />{/* before the gate, so the title is right while auth resolves */}
        <RequireAuth>
          <Shell />
        </RequireAuth>
      </>
    ),
    children: [
      { errorElement: <RouteError />, children: [ // a crash inside a screen keeps the shell
        ...(Crash ? [{ path: "/dev/crash", element: <Suspense fallback={null}><Crash /></Suspense> }] : []),
        { path: "/", handle: { title: "Dashboard" }, element: <Dashboard /> },
        { path: "/candidates", handle: { title: "Candidates" }, element: <CandidatesList /> },
        { path: "/candidates/new", handle: { title: "Add candidate" }, element: <CvUpload /> },
        { path: "/candidates/:candidateId", handle: { title: "Candidate" }, element: <CandidateProfile /> },
        { path: "/candidates/:candidateId/notes/new", handle: { title: "Interview notes" }, element: <InterviewCapture /> },
        { path: "/companies", handle: { title: "Companies" }, element: <CompaniesList /> },
        { path: "/companies/:companyId", handle: { title: "Company" }, element: <CompanyProfile /> },
        { path: "/roles", handle: { title: "Roles" }, element: <RolesList /> },
        { path: "/roles/new", handle: { title: "New role" }, element: <RoleForm /> },
        { path: "/roles/:roleId", handle: { title: "Role match" }, element: <MatchView /> }, // S06 override dialog: ?dialog=override
        { path: "/brief", handle: { title: "Brief" }, element: <BriefIntake /> },
        { path: "/settings", handle: { title: "Settings" }, element: <Settings /> },
        { path: "/widgets", handle: { title: "Widgets" }, element: <Widgets /> },
        { path: "*", handle: { title: "Page not found" }, element: <NotFound /> },
      ] },
    ],
  },
];
