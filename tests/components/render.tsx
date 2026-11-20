// Render a component inside the language context, as the app does.
import type {ReactElement} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {LanguageContext, translations, type Language, type TranslationKey} from '@/theme';

export function renderWithLanguage(ui: ReactElement, lang: Language = 'en') {
  const value = {lang, t: (key: TranslationKey) => translations[lang][key]};
  return render(<LanguageContext.Provider value={value}>{ui}</LanguageContext.Provider>);
}

/** The English text of a translation key, to find elements by their label. */
export const en = (key: TranslationKey): string => translations.en[key];

/** Pick an option in one of the app's dropdowns, as a visitor would: open it, click the option. */
export function chooseOption(dropdown: string | RegExp, option: string | RegExp): void {
  fireEvent.click(screen.getByRole('combobox', {name: dropdown}));
  fireEvent.click(screen.getByRole('option', {name: option}));
}

/** What a dropdown shows as chosen. */
export function dropdownValue(dropdown: string | RegExp): string {
  return screen.getByRole('combobox', {name: dropdown}).textContent;
}
