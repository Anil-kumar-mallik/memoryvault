"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Locale, messages, TranslationDictionary } from "@/lib/i18n/messages";

const LOCALE_STORAGE_KEY = "memoryvault_locale";

type I18nContextValue = {
  locale: Locale;
  setLocale: (nextLocale: Locale) => void;
  t: (key: string, fallback?: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function getDictionaryValue(dictionary: TranslationDictionary, key: string): string | null {
  const tokens = key.split(".");
  let cursor: string | TranslationDictionary | undefined = dictionary;

  for (const token of tokens) {
    if (!cursor || typeof cursor === "string" || typeof cursor !== "object") {
      return null;
    }

    cursor = cursor[token];
  }

  return typeof cursor === "string" ? cursor : null;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "en" || saved === "hi") {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const localized = getDictionaryValue(messages[locale], key);
      if (localized) {
        return localized;
      }

      const english = getDictionaryValue(messages.en, key);
      return english || fallback || key;
    },
    [locale]
  );

  const contextValue = useMemo(
    () => ({
      locale,
      setLocale,
      t
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }

  return context;
}
