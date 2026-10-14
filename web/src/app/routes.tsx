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
import { Shell } from "./Shell";
import NotFound, { RouteError } from "../screens/S16-not-found/NotFound";

// One line per screen.
const DevGallery = import.meta.env.DEV ? lazy(() => import("../screens/dev-gallery/Gallery")) : null;

const Crash = import.meta.env.DEV ? lazy(() => import("../screens/S16-not-found/Crash")) : null;


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
        { path: "/", element: <Dashboard /> },
        { path: "/candidates", element: <CandidatesList /> },
        { path: "/candidates/new", element: <CvUpload /> },
        { path: "/candidates/:candidateId", element: <CandidateProfile /> },
        { path: "/candidates/:candidateId/notes/new", element: <InterviewCapture /> },
        { path: "/companies", element: <CompaniesList /> },
        { path: "/companies/:companyId", element: <CompanyProfile /> },
        { path: "/roles", element: <RolesList /> },
        { path: "/roles/new", element: <RoleForm /> },
        { path: "/roles/:roleId", element: <MatchView /> }, // S06 override dialog: ?dialog=override
        { path: "/brief", element: <BriefIntake /> },
        { path: "/settings", element: <Settings /> },
        { path: "/widgets", element: <Widgets /> },
        { path: "*", element: <NotFound /> },
      ] },
    ],
  },
];
