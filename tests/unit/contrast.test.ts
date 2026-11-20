// Colour contrast of the app's colours, by WCAG 2.1 AA: 4.5:1 for text, 3:1 for chart
// graphics and the outlines that show where a control is. Reads both themes from
// index.css, so a new theme colour is checked as soon as it is used in a pair below.
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {contrastRatio, parseHexColor, readableTextColor} from '@/components/diagramUtils';
import {loadCountries, loadParties} from '@/data/loader';

const TEXT = 4.5;
const GRAPHIC = 3;

type Rgb = [number, number, number];

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

/** The --c-* colours of one theme block of index.css. */
function themeColours(selector: string): Record<string, Rgb> {
  const body = css.slice(css.indexOf(selector)).split('}')[0] ?? '';
  const colours: Record<string, Rgb> = {};
  for (const [, name, value] of body.matchAll(/--c-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    const rgb = name && value ? parseHexColor(value) : null;
    if (name && rgb) colours[name] = rgb;
  }
  return colours;
}

const themes = {light: themeColours(':root {'), dark: themeColours(':root.dark {')};

/** A colour drawn at `alpha` over `background`. */
const over = (colour: Rgb, alpha: number, background: Rgb): Rgb =>
  colour.map((channel, index) => channel * alpha + (background[index] ?? 0) * (1 - alpha)) as Rgb;

const hex = (colour: string): Rgb => parseHexColor(colour) ?? [0, 0, 0];

/** What is checked, its foreground and background colour names, and the minimum ratio. */
type Pair = [what: string, foreground: string, background: string, minimum: number];

/** Every pair to check in one theme. */
function pairs(c: Record<string, Rgb>): Pair[] {
  const surfaces = ['bg', 'bg-card'];
  const text = ['text', 'text-heading', 'text-muted', 'text-subtle', 'axis-text', 'link', 'link-hover', 'good', 'bad', 'warn'];
  const list: Pair[] = [
    ...surfaces.flatMap((surface) => text.map((name): Pair => [`${name} text`, name, surface, TEXT])),
    ['button text', 'btn-inactive-text', 'btn-inactive', TEXT],
    ['button text, hovered', 'btn-inactive-text', 'btn-inactive-hover', TEXT],
    ['dropdown text', 'text-heading', 'btn-inactive', TEXT],
    ['dropdown text, hovered', 'text-heading', 'btn-inactive-hover', TEXT],
    ['dropdown option, highlighted', 'text', 'btn-inactive-hover', TEXT],
    ['active button text', 'on-accent', 'accent', TEXT],
    ['tooltip text', 'tooltip-text', 'tooltip-bg', TEXT],
    ...surfaces.flatMap((surface): Pair[] => [
      ['turnout: valid votes', 'turnout-valid', surface, GRAPHIC],
      ['turnout: blank votes', 'turnout-blank', surface, GRAPHIC],
      ['turnout: invalid votes', 'turnout-invalid', surface, GRAPHIC],
      ['turnout: non-voters', 'turnout-not-voted', surface, GRAPHIC],
      ['slider track', 'slider-track', surface, GRAPHIC],
      ['slider range and focus outline', 'accent', surface, GRAPHIC],
      ['dropdown outline, empty seat outline', 'border-strong', surface, GRAPHIC],
    ]),
  ];
  return list.filter(([, foreground, background]) => c[foreground] && c[background]);
}

describe.each(Object.entries(themes))('the %s theme', (_, colours) => {
  it('defines every colour the checks need', () => {
    for (const name of ['bg', 'bg-card', 'text', 'good', 'bad', 'warn', 'accent', 'on-accent', 'marker', 'turnout-valid']) {
      expect(colours[name], `--c-${name}`).toBeDefined();
    }
  });

  it.each(pairs(colours))('%s (%s on %s) reaches %s:1', (_, foreground, background, minimum) => {
    expect(contrastRatio(colours[foreground] as Rgb, colours[background] as Rgb)).toBeGreaterThanOrEqual(minimum);
  });

  it('election marker text on its pill reaches 4.5:1', () => {
    const marker = colours.marker as Rgb;
    // The pill is the marker colour at 12% over the card (MARKER_PILL_OPACITY).
    expect(contrastRatio(marker, over(marker, 0.12, colours['bg-card'] as Rgb))).toBeGreaterThanOrEqual(TEXT);
  });

  it('the icon on a home page card reaches 3:1', () => {
    const good = colours.good as Rgb;
    expect(contrastRatio(good, over(good, 0.15, colours['bg-card'] as Rgb))).toBeGreaterThanOrEqual(GRAPHIC);
  });
});

describe('party colours', () => {
  const parties = loadCountries().flatMap((country) =>
    loadParties(country.id).map((party) => ({id: `${country.id}/${party.party}`, color: party.color}))
  );

  it('are all hex colours, so text can be picked for them', () => {
    expect(parties.filter((party) => !parseHexColor(party.color)).map((party) => party.id)).toEqual([]);
  });

  it('carry readable text: chosen parties, coalition chips and parliament blocks', () => {
    const unreadable = parties.filter((party) => contrastRatio(hex(readableTextColor(party.color)), hex(party.color)) < TEXT);
    expect(unreadable.map((party) => `${party.id} ${party.color}`)).toEqual([]);
  });

  it.each(Object.entries(themes))('carry readable headings on a tolerating party’s see-through block (%s)', (_, colours) => {
    // A tolerating party is drawn at 35% over the card, labelled in the heading colour.
    const unreadable = parties.filter((party) => {
      const block = over(hex(party.color), 0.35, colours['bg-card'] as Rgb);
      return contrastRatio(colours['text-heading'] as Rgb, block) < TEXT;
    });
    expect(unreadable.map((party) => `${party.id} ${party.color}`)).toEqual([]);
  });
});
