import {describe, expect, it} from 'vitest';
import {fireEvent, screen} from '@testing-library/react';
import ParliamentDiagram from '@/components/ParliamentDiagram';
import {loadAllElections, loadCoalitions, loadParties} from '@/data/loader';
import type {CoalitionData} from '@/types';
import {en, renderWithLanguage} from './render';

const countryData = (country: string) => ({
  coalitions: loadCoalitions(country),
  parties: loadParties(country),
  elections: loadAllElections(country),
});
type Data = ReturnType<typeof countryData>;

const nl = countryData('nl');

function renderParliament(data: Data = nl, lang: 'en' | 'nl' = 'en', range?: {start: number; end: number}) {
  return renderWithLanguage(<ParliamentDiagram {...data} range={range}/>, lang);
}

/** Every cabinet of a country, from the first to the last. */
const everything = (data: Data) => ({start: 0, end: data.coalitions.length - 1});

/** The party blocks: one <g> per block, holding its rectangle and tooltip. */
const blocks = (container: HTMLElement) =>
  [...container.querySelectorAll('g[style*="cursor"]')].filter((group) => group.querySelector('rect'));
const blockRect = (group: Element) => group.querySelector('rect') as SVGRectElement;

/** The cabinet names above the columns; a shortened name has the full one in its tooltip. */
const headers = (container: HTMLElement) =>
  [...container.querySelectorAll('text.font-bold')].map((text) => text.querySelector('title')?.textContent ?? text.textContent);

describe('ParliamentDiagram', () => {
  it('shows a note without cabinets', () => {
    renderParliament({...nl, coalitions: []});
    expect(screen.getByText(en('noCoalitionData'))).toBeTruthy();
  });

  it('shows the last ten cabinets by default, with their election markers', () => {
    const {container} = renderParliament();
    expect(headers(container)).toEqual(nl.coalitions.slice(-10).map((coalition) => coalition.name));
    expect(screen.getAllByText(/^Election · \w+ \d{4}$/).length).toBeGreaterThan(0);
    expect(blocks(container).length).toBeGreaterThan(50);
  });

  it('shows the cabinets of the given range', () => {
    const {container} = renderParliament(nl, 'en', {start: 0, end: 1});
    expect(headers(container)).toEqual(nl.coalitions.slice(0, 2).map((coalition) => coalition.name));
  });

  it('formats the election markers in Dutch', () => {
    renderParliament(nl, 'nl');
    expect(screen.getAllByText(/^Verkiezing · /).length).toBeGreaterThan(0);
  });

  it('names an election without a known date by its year', () => {
    renderParliament({...nl, elections: []});
    expect(screen.getAllByText(/^election \d{4}$/).length).toBeGreaterThan(0);
  });

  it('draws mergers, splits and the tolerating party over all cabinets', () => {
    const {container} = renderParliament(nl, 'en', everything(nl));
    const gradients = [...container.querySelectorAll('linearGradient')].map((gradient) => gradient.id);
    expect(gradients.some((id) => id.startsWith('grad-m-'))).toBe(true);
    expect(gradients.some((id) => id.startsWith('grad-s-'))).toBe(true);
    // Rutte I's tolerating party is drawn see-through with a dashed outline.
    expect(container.querySelectorAll('rect[stroke-dasharray="4 3"]').length).toBeGreaterThan(1);
    expect(screen.getByText(en('toleratingParty'))).toBeTruthy();
  });

  it('names each party and its seats in its tooltip', () => {
    const {container} = renderParliament();
    const titles = blocks(container).map((group) => group.querySelector('title')?.textContent ?? '');
    expect(titles.every((title) => /^.+: \d+ seats$/.test(title))).toBe(true);
  });

  it('highlights a hovered party and its merge lineage', () => {
    const {container} = renderParliament(nl, 'en', everything(nl));
    const cda = blocks(container).find((group) => group.textContent.startsWith('CDA')) as Element;
    fireEvent.mouseEnter(cda);
    const faded = blocks(container).filter((group) => blockRect(group).getAttribute('opacity') === '0.3');
    expect(faded.length).toBeGreaterThan(0);
    // KVP merged into the CDA, so it stays highlighted.
    const kvp = blocks(container).find((group) => group.textContent.startsWith('KVP')) as Element;
    expect(blockRect(kvp).getAttribute('opacity')).toBe('1');
    fireEvent.mouseLeave(cda);
    expect(blocks(container).every((group) => blockRect(group).getAttribute('opacity') === '1')).toBe(true);
  });

  it('labels blocks to fit: one line, two lines or shortened', () => {
    const {container} = renderParliament(nl, 'en', everything(nl));
    const lineCounts = new Set(blocks(container).map((group) => group.querySelectorAll('tspan').length));
    expect([...lineCounts].sort((a, b) => a - b)).toEqual([1, 2]);
    expect(blocks(container).some((group) => group.querySelector('tspan')?.textContent.includes('…'))).toBe(true);
  });

  it('shortens long cabinet names in narrow columns, with the full name on hover', () => {
    const long = nl.coalitions.slice(-3).map((coalition): CoalitionData => ({...coalition, name: `${coalition.name} with a very long cabinet name`}));
    const {container} = renderParliament({...nl, coalitions: long});
    const titles = [...container.querySelectorAll('text > title')].map((title) => title.textContent);
    expect(titles.some((title) => title.endsWith('with a very long cabinet name'))).toBe(true);
  });

  it('draws a split within the first column when the parent is there too', () => {
    const de = countryData('de');
    const {container} = renderParliament(de, 'en', everything(de));
    expect(container.querySelectorAll('path').length).toBeGreaterThan(10);
  });

  it('picks readable text colours for light and dark parties', () => {
    // A very light colour, and one that is not a hex colour at all.
    const colours: Record<string, string> = {vvd: '#fff', cda: 'not-a-colour'};
    const parties = nl.parties.map((party) => ({...party, color: colours[party.party] ?? party.color}));
    const {container} = renderParliament({...nl, parties});
    const fills = new Set([...container.querySelectorAll('text[fill]')].map((text) => text.getAttribute('fill')));
    expect(fills.has('#111827')).toBe(true);
    expect(fills.has('#ffffff')).toBe(true);
  });
});
