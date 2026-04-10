import { useEffect, useState } from 'react';

import {
  detectInitialLocale,
  messagesByLocale,
  setStoredLocale,
  type Locale,
  type Messages
} from '../i18n';

interface UseLocaleResult {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
}

export function useLocale(): UseLocaleResult {
  const [locale, setLocaleState] = useState<Locale>(() => detectInitialLocale());

  useEffect(() => {
    setStoredLocale(locale);
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  return {
    locale,
    messages: messagesByLocale[locale],
    setLocale: (nextLocale) => setLocaleState(nextLocale)
  };
}
