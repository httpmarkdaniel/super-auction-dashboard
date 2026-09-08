import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import HomePage from "./pages/HomePage.jsx";
import ComingSoonPage from "./pages/ComingSoonPage.jsx";
import HrhOnlineApp from "./hrh-online/HrhOnlineApp.jsx";
import { MODULES } from "./platform/modules.js";
import "./index.css";

// Plain pathname check — no router library. The Auction dashboard (App.jsx)
// and the HRH Online dashboard (hrh-online/HrhOnlineApp.jsx) each do their
// own navigation via in-memory tab state, never the URL, so a full page
// load between platform routes (Home <-> /auction <-> /hrh-online <-> a
// future "Coming Soon" module) is all that's needed here. See vercel.json
// for the SPA rewrite that makes a direct load/refresh of any of these
// paths work in production.
function matchesRoute(pathname, route) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function resolvePage(pathname) {
  if (matchesRoute(pathname, "/auction")) {
    return <App />;
  }

  if (matchesRoute(pathname, "/hrh-online")) {
    return <HrhOnlineApp />;
  }

  const comingSoonModule = MODULES.find(
    (module) => module.status === "coming-soon" && matchesRoute(pathname, module.route),
  );
  if (comingSoonModule) {
    return <ComingSoonPage title={comingSoonModule.name} description={comingSoonModule.description} />;
  }

  return <HomePage />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>{resolvePage(window.location.pathname)}</React.StrictMode>,
);
