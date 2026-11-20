// Render a component inside the language context, as the app does.
import type {ReactElement} from 'react';
import {render} from '@testing-library/react';
import {LanguageContext, translations, type Language, type TranslationKey} from '@/theme';

export function renderWithLanguage(ui: ReactElement, lang: Language = 'en') {
  const value = {lang, t: (key: TranslationKey) => translations[lang][key]};
  return render(<LanguageContext.Provider value={value}>{ui}</LanguageContext.Provider>);
}

/** The English text of a translation key, to find elements by their label. */
export const en = (key: TranslationKey): string => translations.en[key];
