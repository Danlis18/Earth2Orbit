import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";
import "./auth.css";
import { LanguageProvider } from "./i18n/LanguageContext.jsx";
import { ProfileProvider } from "./lib/profile.jsx";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <ProfileProvider>
        <App />
      </ProfileProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
