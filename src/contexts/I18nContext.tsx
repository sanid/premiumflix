import React, { createContext, useContext, useState, useEffect } from 'react';
import { getTranslation, Translations } from '../i18n/translations';

interface I18nContextValue {
  t: Translations;
  language: string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState(localStorage.getItem('tmdb_language') ?? 'en-US');

  useEffect(() => {
    // Listen to changes in local storage from the Settings page
    const handleStorageChange = () => {
      setLanguage(localStorage.getItem('tmdb_language') ?? 'en-US');
    };
    
    // We can also poll or use a custom event to detect changes within the same window
    const interval = setInterval(handleStorageChange, 1000);
    
    return () => clearInterval(interval);
  }, []);

  const t = getTranslation(language);

  return (
    <I18nContext.Provider value={{ t, language }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
