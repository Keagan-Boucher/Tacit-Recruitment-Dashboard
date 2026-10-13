import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import "boxicons/css/boxicons.min.css";
import "./styles/tokens.css";
import "./styles/globals.css";
import { applyDevTheme } from "./app/dev";
import { AuthProvider } from "./features/auth";
import { PrefsProvider } from "./features/prefs";
import { routes } from "./app/routes";

applyDevTheme();
const queryClient = new QueryClient();
const router = createBrowserRouter(routes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PrefsProvider>
          <RouterProvider router={router} />
        </PrefsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
