"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  DEFAULT_LOCALE,
  getDictionary,
  readStoredLocale,
  writeStoredLocale,
} from "@/i18n/dictionary.mjs";
import type { Dictionary, Locale } from "@/i18n/dictionary.mjs";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Start from the default so SSR and first client paint agree, then hydrate the
  // persisted choice from localStorage.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = readStoredLocale(typeof window !== "undefined" ? window.localStorage : null);
    if (stored !== locale) setLocaleState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStoredLocale(typeof window !== "undefined" ? window.localStorage : null, next);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: getDictionary(locale) }}>
      {children}
    </I18nContext.Provider>
  );
}

/** Access the active dictionary + locale controls. Falls back to the default
 *  dictionary when used outside a provider (keeps leaf components resilient). */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return { locale: DEFAULT_LOCALE, setLocale: () => {}, t: getDictionary(DEFAULT_LOCALE) };
}
