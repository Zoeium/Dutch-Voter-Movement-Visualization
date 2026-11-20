import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, within} from '@testing-library/react';
import App from '@/App';
import {translations} from '@/theme';

const en = translations.en;
const nl = translations.nl;

/** Open the app at a URL, as a visitor following a shared link would. */
function openApp(search = '') {
  window.history.replaceState({}, '', `/app/${search}`);
  return render(<App/>);
}

const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:test');

const tab = (label: string) => within(screen.getByRole('main')).getAllByRole('button', {name: label})[0] as HTMLElement;

describe('App', () => {
  beforeEach(() => {
    createObjectURL.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.className = '';
  });

  it('opens on the home page of the Netherlands and opens a view from its card', () => {
    openApp();
    expect(screen.getByText(en.homeTitle)).toBeTruthy();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByText(en.homeTurnout));
    expect(screen.getByText(en.turnoutTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: en.homeLink}));
    expect(screen.getByText(en.homeTitle)).toBeTruthy();
  });

  it('restores a shared view from the URL', () => {
    openApp('?country=se&tab=alluvial&lang=nl&theme=light&party=s&ys=0&ye=2&sort=alphabetical');
    expect(screen.getByText(nl.alluvialTitle)).toBeTruthy();
    expect(document.documentElement.lang).toBe('nl');
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(screen.getByRole('button', {name: nl.sortAlphabetical}).className).toContain('bg-emerald-500');
  });

  it('ignores URL values it does not know', () => {
    openApp('?country=xx&tab=nope&lang=fr&theme=pink&sort=random&ys=abc&cmpA=1800');
    expect(screen.getByText(en.homeTitle)).toBeTruthy();
    fireEvent.click(tab(en.tabAlluvial));
    expect(screen.getByRole('button', {name: en.sortByVotes}).className).toContain('bg-emerald-500');
  });

  it('filters the voter movements by party, sorts them and narrows the years', () => {
    const {container} = openApp('?tab=alluvial');
    const partyButton = screen.getByRole('button', {name: 'VVD'});
    fireEvent.click(partyButton);
    expect(partyButton.style.backgroundColor).not.toBe('');
    fireEvent.click(partyButton);
    fireEvent.click(partyButton);
    fireEvent.click(screen.getByRole('button', {name: en.allParties}));
    expect(partyButton.style.backgroundColor).toBe('');

    fireEvent.click(screen.getByRole('button', {name: en.sortAlphabetical}));
    fireEvent.click(screen.getByRole('button', {name: en.sortByVotes}));

    fireEvent.change(screen.getByLabelText(en.rangeEnd), {target: {value: '1'}});
    fireEvent.change(screen.getByLabelText(en.rangeStart), {target: {value: '1'}});
    expect(screen.getByText(en.noFlowData)).toBeTruthy();
    expect(container.querySelector('svg[data-export-chart]')).toBeNull();
  });

  it('moves through every tab and narrows the turnout years', () => {
    openApp();
    fireEvent.click(tab(en.tabParliament));
    expect(screen.getByText(en.parliamentTitle)).toBeTruthy();
    fireEvent.click(tab(en.tabCoalition));
    expect(screen.getByText(en.coalitionSelectElection)).toBeTruthy();
    fireEvent.click(tab(en.tabCompare));
    expect(screen.getByText(en.compareTitle)).toBeTruthy();
    fireEvent.click(tab(en.tabTurnout));
    fireEvent.change(screen.getByLabelText(en.rangeStart), {target: {value: '3'}});
    fireEvent.change(screen.getByLabelText(en.rangeEnd), {target: {value: '5'}});
    expect(screen.getByText('1956 — 1963')).toBeTruthy();
  });

  it('keeps the URL in step with the view', () => {
    vi.useFakeTimers();
    openApp('?tab=compare');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(window.location.search).toContain('tab=compare');
    expect(window.location.search).toContain('cmpA=');
    fireEvent.click(tab(en.tabTurnout));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(window.location.search).toContain('tys=');
  });

  it('switches the language and the theme', () => {
    openApp();
    fireEvent.change(screen.getByLabelText(en.language), {target: {value: 'nl'}});
    expect(screen.getByText(nl.homeTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: nl.lightMode}));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(screen.getByRole('button', {name: nl.darkMode})).toBeTruthy();
  });

  it('copies a link to the current view', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
    openApp();
    const share = screen.getByRole('button', {name: en.share});
    await act(async () => {
      fireEvent.click(share);
      await Promise.resolve();
    });
    expect(screen.getByText(en.shareCopied)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByText(en.shareCopied)).toBeNull();
    await act(async () => {
      fireEvent.click(share);
      await Promise.resolve();
    });
    expect(screen.queryByText(en.shareCopied)).toBeNull();
  });

  it('exports the chart, and the compare table as CSV', () => {
    vi.useFakeTimers();
    openApp('?tab=turnout');
    fireEvent.click(screen.getByRole('button', {name: en.exportChart}));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByText(en.exportDone)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    fireEvent.click(tab(en.tabCompare));
    fireEvent.click(screen.getByRole('button', {name: en.exportData}));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    // Comparing an election with itself has no rows, so nothing is exported.
    const [selectA, selectB] = screen.getAllByRole<HTMLSelectElement>('combobox', {name: ''});
    fireEvent.change(selectA as HTMLSelectElement, {target: {value: (selectB as HTMLSelectElement).value}});
    fireEvent.click(screen.getByRole('button', {name: en.exportData}));
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });

  it('has nothing to export when the flow view has no flows', () => {
    // A range of one election has no voter movements to draw.
    openApp('?tab=alluvial&ys=1&ye=1');
    expect(screen.getByText(en.noFlowData)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: en.exportChart}));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByText(en.exportDone)).toBeNull();
  });

  it('switches country, and leaves out the flow view where no movements are known', () => {
    openApp('?tab=alluvial');
    fireEvent.click(screen.getByRole('button', {name: new RegExp(en.countryData)}));
    fireEvent.click(screen.getByRole('option', {name: 'France'}));
    expect(screen.getByText(en.turnoutTitle)).toBeTruthy();
    expect(within(screen.getByRole('main')).queryByRole('button', {name: en.tabAlluvial})).toBeNull();
  });

  it('names non-voters and other parties in the interface language', () => {
    const {container} = openApp('?tab=alluvial');
    const labels = [...container.querySelectorAll('svg text')].map((text) => text.textContent);
    expect(labels).toContain(en.didNotVote);
    expect(labels).not.toContain('Niet Gestemd');
    fireEvent.change(screen.getByLabelText(en.language), {target: {value: 'nl'}});
    expect([...container.querySelectorAll('svg text')].map((text) => text.textContent)).toContain(nl.didNotVote);
  });

  it('keeps every view’s settings when switching tabs', () => {
    openApp('?tab=parliament');
    fireEvent.click(screen.getByRole('button', {name: en.all}));
    fireEvent.click(tab(en.tabTurnout));
    fireEvent.click(screen.getByText(en.percentage));
    fireEvent.click(screen.getByText(en.invalid));
    fireEvent.click(tab(en.tabCoalition));
    fireEvent.click(screen.getByText(en.coalitionSelectParties, {selector: 'button'}));

    fireEvent.click(tab(en.tabParliament));
    expect(screen.getByRole('button', {name: en.all}).className).toContain('bg-emerald-500');
    fireEvent.click(tab(en.tabTurnout));
    expect(screen.getByText(en.pctOfElectorate)).toBeTruthy();
    expect(screen.getByText(en.invalid).className).toContain('line-through');
    fireEvent.click(tab(en.tabCoalition));
    expect(screen.getByText(en.coalitionClear)).toBeTruthy();
  });

  it('shares and restores every view’s settings through the URL', () => {
    vi.useFakeTimers();
    openApp('?tab=parliament&ps=0&pe=1');
    const firstCabinet = screen.getByText(/ — /).textContent;
    expect(firstCabinet).toMatch(/^Schermerhorn|^Beel/);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(window.location.search).toContain('ps=0&pe=1');
  });

  it('opens Turnout and the Coalition Explorer from a shared link', () => {
    openApp('?tab=turnout&scale=percentage&hide=notVoted,bogus');
    expect(screen.getByText(en.pctOfElectorate)).toBeTruthy();
    expect(screen.getByText(en.didNotVote).className).toContain('line-through');

    openApp('?tab=coalition&cy=2021&cp=vvd,d66,cda,cu');
    expect((screen.getAllByRole('combobox', {name: ''})[0] as HTMLSelectElement).value).toBe('2021');
    expect(screen.getByText(en.coalitionClear)).toBeTruthy();
  });

  it('lists the data sources on request', () => {
    openApp();
    const toggle = screen.getByRole('button', {name: new RegExp(en.sources)});
    fireEvent.click(toggle);
    const list = document.getElementById('all-data-sources') as HTMLElement;
    expect(within(list).getAllByText(new RegExp(`^${en.totals} \\(`)).length).toBeGreaterThan(10);
    expect(within(list).getAllByText(new RegExp(`^${en.movements} \\(`)).length).toBeGreaterThan(0);
    expect(within(list).getAllByRole('link').length).toBeGreaterThan(10);
    fireEvent.click(toggle);
    expect(document.getElementById('all-data-sources')).toBeNull();
  });
});
