// Accessibility audit of every view with axe-core, the engine behind most accessibility
// checkers. Colour contrast is left out: jsdom does not lay out or paint the page.
import {describe, expect, it} from 'vitest';
import {fireEvent, render, screen} from '@testing-library/react';
import axe from 'axe-core';
import App from '@/App';
import {translations} from '@/theme';

/** The violations axe finds on the page, one readable line each. */
async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, {rules: {'color-contrast': {enabled: false}}});
  return result.violations.map(
    (violation) => `${violation.id} (${violation.impact ?? 'unknown'}, ${violation.nodes.length}×): ${violation.help}\n  ${violation.nodes[0]?.html ?? ''}`
  );
}

function openApp(search: string) {
  window.history.replaceState({}, '', `/app/?${search}`);
  render(<App/>);
}

const TABS = ['home', 'alluvial', 'parliament', 'turnout', 'compare', 'coalition'];

describe('accessibility', () => {
  it.each(TABS.flatMap((tab) => [[tab, 'en'], [tab, 'nl']]))('the %s view in %s has no violations', async (tab, lang) => {
    openApp(`tab=${tab}&lang=${lang}`);
    expect(await violations()).toEqual([]);
  });

  it('has no violations with the sources listed', async () => {
    openApp('tab=home');
    fireEvent.click(screen.getByRole('button', {name: new RegExp(translations.en.sources)}));
    expect(await violations()).toEqual([]);
  });

  it('has no violations with the country list open', async () => {
    openApp('tab=home');
    fireEvent.click(screen.getByRole('combobox', {name: translations.en.countryData}));
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(await violations()).toEqual([]);
  });

  it('has no violations with a party chosen in the coalition explorer', async () => {
    openApp('tab=coalition&cy=2021&cp=vvd,d66');
    expect(await violations()).toEqual([]);
  });
});
