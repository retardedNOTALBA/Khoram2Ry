import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ("serviceWorker" in navigator && location.protocol === "https:" && !window.KhoramNative) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => { void navigator.serviceWorker.register("/sw.js").catch(() => undefined); });
  } else {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.filter((r) => r.active?.scriptURL === `${location.origin}/sw.js`).forEach((r) => void r.unregister());
    });
  }
}
