import React, { createContext, useContext, useState, useEffect } from 'react';
import { resources, LanguageCode } from '../locales/resources';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<LanguageCode>('en');

  // Try to auto-detect language on first load
  useEffect(() => {
    const saved = localStorage.getItem('ccioi_language') as LanguageCode;
    if (saved && resources[saved]) {
      setLanguage(saved);
    } else {
      // Very basic detection
      const browserLang = navigator.language;
      if (browserLang.startsWith('zh')) {
        setLanguage(browserLang.includes('TW') || browserLang.includes('HK') ? 'zh-TW' : 'zh-CN');
      } else if (browserLang.startsWith('ja')) {
        setLanguage('ja');
      } else if (browserLang.startsWith('ko')) {
        setLanguage('ko');
      } else if (browserLang.startsWith('es')) {
        setLanguage('es');
      } else if (browserLang.startsWith('fr')) {
        setLanguage('fr');
      } else if (browserLang.startsWith('de')) {
        setLanguage('de');
      }
    }
  }, []);

  const handleSetLanguage = (lang: LanguageCode) => {
    setLanguage(lang);
    localStorage.setItem('ccioi_language', lang);
  };

  const t = (key: string): string => {
    return resources[language][key] || resources['en'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};