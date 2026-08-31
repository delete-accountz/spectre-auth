"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type SiteLanguage = "pt-BR" | "en-US";

interface LanguageContextType {
  language: SiteLanguage;
  setLanguage: (language: SiteLanguage) => void;
  t: <T>(values: { "pt-BR": T; "en-US": T }) => T;
}

const STORAGE_KEY = "spectreauth-language";

const LanguageContext = createContext<LanguageContextType>({
  language: "pt-BR",
  setLanguage: () => {},
  t: (values) => values["pt-BR"],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<SiteLanguage>("pt-BR");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "pt-BR" || stored === "en-US") {
      setLanguage(stored);
      document.documentElement.lang = stored;
      return;
    }

    const browserLanguage = navigator.language?.toLowerCase() ?? "";
    const initialLanguage: SiteLanguage = browserLanguage.startsWith("pt")
      ? "pt-BR"
      : "en-US";

    setLanguage(initialLanguage);
    document.documentElement.lang = initialLanguage;
    window.localStorage.setItem(STORAGE_KEY, initialLanguage);
  }, []);

  const handleSetLanguage = (nextLanguage: SiteLanguage) => {
    setLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage;
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  };

  const value = useMemo<LanguageContextType>(
    () => ({
      language,
      setLanguage: handleSetLanguage,
      t: (values) => values[language],
    }),
    [language]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
