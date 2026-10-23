import { lazy, Suspense, type ReactNode } from "react";
import type { RouteObject } from "react-router";
import type { AccountRole } from "@tacit/shared";
import { RedirectIfRole, RedirectIfSignedIn, RequireRole } from "../features/auth";
import ReviewQueue from "../screens/S18-review-queue/ReviewQueue";
import CandidateSignIn from "../screens/C01-candidate-sign-in/CandidateSignIn";
import CandidateHome from "../screens/C02-candidate-home/CandidateHome";
import CandidateDetails from "../screens/C03-candidate-details/CandidateDetails";
import CandidateUpload from "../screens/C04-candidate-upload/CandidateUpload";
import CompanySignIn from "../screens/B01-company-sign-in/CompanySignIn";
import CompanyHome from "../screens/B02-company-home/CompanyHome";
import CompanyBrief from "../screens/B03-company-brief/CompanyBrief";
import CompanyShortlist from "../screens/B04-company-shortlist/CompanyShortlist";
import CompanyRoles from "../screens/B05-company-roles/CompanyRoles";
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

/** A page with no rail (S07, C01, B01). */
const bare = (path: string, title: string, page: ReactNode): RouteObject =>
  ({ path, handle: { title }, errorElement: <RouteError standalone />, element: <><RouteTitle />{page}</> });

/** The shell for one role (or several), its screens as children. A crash inside a screen keeps the shell. */
const shell = (role: AccountRole | AccountRole[], children: RouteObject[]): RouteObject => ({
  errorElement: <RouteError standalone />, // the shell or the guard itself failed
  element: (
    <>
      <RouteTitle />{/* before the gate, so the title is right while auth resolves */}
      <RequireRole role={role}>
        <Shell />
      </RequireRole>
    </>
  ),
  children: [{ errorElement: <RouteError />, children }],
});

export const routes: RouteObject[] = [
  // DEV only, outside the auth guard so the component gallery opens without a session.
  ...(DevGallery ? [{ path: "/dev/components", handle: { title: "Components" }, errorElement: <RouteError standalone />, element: <Suspense fallback={null}><DevGallery /></Suspense> }] : []),
  bare("/login", "Sign in", <RedirectIfSignedIn><SignIn /></RedirectIfSignedIn>),
  bare("/candidate/login", "Candidate sign in", <RedirectIfRole><CandidateSignIn /></RedirectIfRole>), // ?finishing=1: signed in, no role yet
  bare("/candidate/signup", "Create your account", <RedirectIfRole><CandidateSignIn /></RedirectIfRole>),
  bare("/company/join/:inviteId", "Join Tacit", <RedirectIfRole><CompanySignIn /></RedirectIfRole>),
  bare("/company/login", "Company sign in", <RedirectIfRole><CompanySignIn /></RedirectIfRole>),
  shell("candidate", [
    { path: "/candidate", handle: { title: "Candidate home" }, element: <CandidateHome /> },
    { path: "/candidate/details", handle: { title: "My details" }, element: <CandidateDetails /> },
    { path: "/candidate/cv", handle: { title: "Upload your CV" }, element: <CandidateUpload /> },
  ]),
  shell("company", [
    { path: "/company", handle: { title: "Company home" }, element: <CompanyHome /> },
    { path: "/company/briefs/new", handle: { title: "Send a brief" }, element: <CompanyBrief /> },
    { path: "/company/roles", handle: { title: "Your roles" }, element: <CompanyRoles /> },
    { path: "/company/roles/:roleId", handle: { title: "Shortlist" }, element: <CompanyShortlist /> },
  ]),
  shell(["recruiter", "candidate", "company"], [
    { path: "/settings", handle: { title: "Settings" }, element: <Settings /> },
  ]),
  shell("recruiter", [
    ...(Crash ? [{ path: "/dev/crash", element: <Suspense fallback={null}><Crash /></Suspense> }] : []),
    { path: "/", handle: { title: "Dashboard" }, element: <Dashboard /> },
    { path: "/review", handle: { title: "Review queue" }, element: <ReviewQueue /> },
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
    { path: "/widgets", handle: { title: "Widgets" }, element: <Widgets /> },
    { path: "*", handle: { title: "Page not found" }, element: <NotFound /> }, // a portal user is sent to their own home instead
  ]),
];
