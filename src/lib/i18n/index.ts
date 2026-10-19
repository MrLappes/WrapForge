import { useCallback } from 'react';
import { useUiStore } from '../store/uiStore';
import { en, type TranslationKey } from './en';
import { de } from './de';

export type { TranslationKey };

export function translate(
  language: 'en' | 'de',
  key: TranslationKey,
  values?: Record<string, string | number>,
): string {
  const dictionary = language === 'de' ? de : en;
  let text: string = dictionary[key] ?? en[key] ?? key;
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function useTranslation() {
  const language = useUiStore((state) => state.language);
  const t = useCallback(
    (key: TranslationKey, values?: Record<string, string | number>) =>
      translate(language, key, values),
    [language],
  );
  return { t, language };
}
