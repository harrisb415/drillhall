import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTheme } from "./stores/theme";
import "./index.css";

initTheme();

// Registered after load so it never competes with the first render for
// bandwidth. Dev is excluded: a service worker caching a dev build is a
// reliable way to spend an afternoon debugging a stale bundle.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* unsupported or blocked — the app works fine without it */
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
