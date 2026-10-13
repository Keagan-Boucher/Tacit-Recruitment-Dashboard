import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "boxicons/css/boxicons.min.css";
import "./styles/tokens.css";
import "./styles/globals.css";

// F-04 replaces this placeholder with the router and app shell.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main style={{ padding: 104 }}>
      <h1 className="t-headline">Tacit</h1>
    </main>
  </StrictMode>,
);
