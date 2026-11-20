import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, renderHook, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ThemeContext, translations, useI18n, useTheme} from '@/theme';
import {DualRangeSlider, EmptyState, RangeControl, RibbonGradient} from '@/components/shared';
import {ErrorBoundary} from '@/components/ErrorBoundary';
import HomePage from '@/components/HomePage';
import CountrySelect from '@/components/CountrySelect';
import type {CountryInfo} from '@/data/loader';
import {en, renderWithLanguage} from './render';

describe('theme', () => {
  it('falls back to defaults outside the providers', () => {
    const {result: theme} = renderHook(() => useTheme());
    expect(theme.current.theme).toBe('dark');
    expect(() => theme.current.toggleTheme()).not.toThrow();
    const {result: i18n} = renderHook(() => useI18n());
    expect(i18n.current.lang).toBe('en');
    expect(i18n.current.t('appTitle')).toBe('');
  });

  it('reads the provided theme', () => {
    const toggleTheme = vi.fn();
    const {result} = renderHook(() => useTheme(), {
      wrapper: ({children}) => <ThemeContext.Provider value={{theme: 'light', toggleTheme}}>{children}</ThemeContext.Provider>,
    });
    expect(result.current.theme).toBe('light');
  });

  it('has a Dutch text for every English one', () => {
    expect(Object.keys(translations.nl).sort((a, b) => a.localeCompare(b)))
      .toEqual(Object.keys(translations.en).sort((a, b) => a.localeCompare(b)));
  });
});

describe('DualRangeSlider', () => {
  const renderSlider = (start: number, end: number) => {
    const onStartChange = vi.fn();
    const onEndChange = vi.fn();
    render(
      <DualRangeSlider min={0} max={10} start={start} end={end} onStartChange={onStartChange}
        onEndChange={onEndChange} startAriaLabel="from" endAriaLabel="to"/>
    );
    return {onStartChange, onEndChange};
  };

  it('keeps the start thumb at or before the end thumb', () => {
    const {onStartChange, onEndChange} = renderSlider(2, 6);
    fireEvent.change(screen.getByLabelText('from'), {target: {value: '8'}});
    expect(onStartChange).toHaveBeenCalledWith(6);
    fireEvent.change(screen.getByLabelText('to'), {target: {value: '1'}});
    expect(onEndChange).toHaveBeenCalledWith(2);
  });

  it('lifts the start thumb above the end thumb when they meet', () => {
    renderSlider(4, 4);
    expect(screen.getByLabelText('from').style.zIndex).toBe('5');
  });
});

describe('RangeControl', () => {
  const labels = Array.from({length: 12}, (_, index) => `Item ${index + 1}`);
  const renderRange = (start: number, end: number, items = labels, lang: 'en' | 'nl' = 'en') => {
    const onChange = vi.fn();
    renderWithLanguage(<RangeControl labels={items} start={start} end={end} onChange={onChange}/>, lang);
    return onChange;
  };

  it('names the first and last item shown', () => {
    renderRange(2, 11);
    expect(screen.getByText('Item 3 — Item 12')).toBeTruthy();
  });

  it('moves either end with the slider', () => {
    const onChange = renderRange(2, 11);
    fireEvent.change(screen.getByLabelText(en('rangeStart')), {target: {value: '4'}});
    expect(onChange).toHaveBeenLastCalledWith(4, 11);
    fireEvent.change(screen.getByLabelText(en('rangeEnd')), {target: {value: '8'}});
    expect(onChange).toHaveBeenLastCalledWith(2, 8);
  });

  it('offers quick ranges and marks the active one', () => {
    const onChange = renderRange(2, 11);
    expect(screen.getByRole('button', {name: en('last10')}).className).toContain('bg-emerald-500');
    fireEvent.click(screen.getByRole('button', {name: en('all')}));
    expect(onChange).toHaveBeenLastCalledWith(0, 11);
    fireEvent.click(screen.getByRole('button', {name: en('last5')}));
    expect(onChange).toHaveBeenLastCalledWith(7, 11);
  });

  it('leaves out quick ranges that would show everything anyway', () => {
    renderRange(0, 3, labels.slice(0, 4));
    expect(screen.queryByRole('button', {name: en('last10')})).toBeNull();
    expect(screen.queryByRole('button', {name: en('last5')})).toBeNull();
    expect(screen.getByRole('button', {name: en('all')})).toBeTruthy();
  });

  it('labels the slider in the interface language', () => {
    renderRange(0, 3, labels, 'nl');
    expect(screen.getByLabelText(translations.nl.rangeStart)).toBeTruthy();
    expect(screen.getByText(translations.nl.range)).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('shows its message', () => {
    render(<EmptyState message="Nothing here"/>);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});

describe('RibbonGradient', () => {
  it('runs from the source colour to the target colour', () => {
    const {container} = render(
      <svg><RibbonGradient id="g" x1={0} x2={10} sourceColor="#111111" targetColor="#222222"/></svg>
    );
    const stops = container.querySelectorAll('stop');
    expect(stops[0]?.getAttribute('stop-color')).toBe('#111111');
    expect(stops[1]?.getAttribute('stop-color')).toBe('#222222');
  });
});

describe('ErrorBoundary', () => {
  function Broken(): never {
    throw new Error('bad data');
  }

  it('renders its children when nothing fails', () => {
    render(<ErrorBoundary><p>fine</p></ErrorBoundary>);
    expect(screen.getByText('fine')).toBeTruthy();
  });

  it.each([['en', translations.en.somethingWrong], ['nl', translations.nl.somethingWrong]])(
    'shows the error in the page language (%s)',
    (lang, message) => {
      document.documentElement.lang = lang;
      // The failure is expected: keep React's and jsdom's reports of it out of the output.
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const silence = (event: ErrorEvent) => event.preventDefault();
      window.addEventListener('error', silence);
      render(<ErrorBoundary><Broken/></ErrorBoundary>);
      window.removeEventListener('error', silence);
      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.getByText('bad data')).toBeTruthy();
      document.documentElement.lang = '';
    }
  );
});

describe('HomePage', () => {
  const views = [{key: 'turnout', title: 'Turnout', description: 'Who voted', icon: <span/>}];

  it('shows the data period and opens a view', async () => {
    const onOpen = vi.fn();
    renderWithLanguage(
      <HomePage countryName="Sweden" electionYears={['1974-02', '2022']} governmentCount={3} views={views} onOpen={onOpen}/>
    );
    expect(screen.getByText('Feb 1974–2022')).toBeTruthy();
    await userEvent.click(screen.getByText('Turnout'));
    expect(onOpen).toHaveBeenCalledWith('turnout');
  });

  it('shows a dash without elections', () => {
    renderWithLanguage(<HomePage countryName="X" electionYears={[]} governmentCount={0} views={[]} onOpen={vi.fn()}/>);
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('CountrySelect', () => {
  const countries: CountryInfo[] = [
    {id: 'se', name: {en: 'Sweden', nl: 'Zweden'}, flagUrl: 'se.svg'},
    {id: 'es', name: {en: 'Spain', nl: 'Spanje'}},
    {id: 'nl', name: {en: 'Netherlands', nl: 'Nederland'}, flagUrl: 'nl.svg'},
  ];
  const button = () => screen.getByRole('button');

  it('lists the countries alphabetically and picks one by mouse', async () => {
    const onChange = vi.fn();
    renderWithLanguage(<CountrySelect countries={countries} value="nl" onChange={onChange}/>);
    await userEvent.click(button());
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Netherlands', 'Spain', 'Sweden']);
    await userEvent.hover(screen.getByText('Sweden'));
    await userEvent.click(screen.getByText('Sweden'));
    expect(onChange).toHaveBeenCalledWith('se');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('sorts by the Dutch names in Dutch', async () => {
    renderWithLanguage(<CountrySelect countries={countries} value="nl" onChange={vi.fn()}/>, 'nl');
    await userEvent.click(button());
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Nederland', 'Spanje', 'Zweden']);
  });

  it('works with the keyboard', () => {
    const onChange = vi.fn();
    renderWithLanguage(<CountrySelect countries={countries} value="nl" onChange={onChange}/>);
    fireEvent.keyDown(button(), {key: 'x'});
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(button(), {key: 'ArrowDown'});
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(button(), {key: 'ArrowDown'});
    fireEvent.keyDown(button(), {key: 'ArrowDown'});
    fireEvent.keyDown(button(), {key: 'ArrowDown'});
    fireEvent.keyDown(button(), {key: 'ArrowUp'});
    fireEvent.keyDown(button(), {key: 'Enter'});
    expect(onChange).toHaveBeenCalledWith('es');

    fireEvent.keyDown(button(), {key: 'Enter'});
    fireEvent.keyDown(button(), {key: 'Escape'});
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(button(), {key: ' '});
    fireEvent.keyDown(button(), {key: 'Tab'});
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps the current country when it is chosen again, and closes on a click outside', async () => {
    const onChange = vi.fn();
    renderWithLanguage(<div><p>outside</p><CountrySelect countries={countries} value="nl" onChange={onChange}/></div>);
    await userEvent.click(button());
    await userEvent.click(screen.getAllByText('Netherlands')[1] as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(button());
    await userEvent.click(button());
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.click(button());
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('falls back to the first country, and renders nothing without countries', () => {
    renderWithLanguage(<CountrySelect countries={countries} value="xx" onChange={vi.fn()}/>);
    expect(button().textContent).toContain('Netherlands');
    const {container} = renderWithLanguage(<CountrySelect countries={[]} value="nl" onChange={vi.fn()}/>);
    expect(container.innerHTML).toBe('');
  });

  it('labels the selector', () => {
    renderWithLanguage(<CountrySelect countries={countries} value="nl" onChange={vi.fn()}/>);
    expect(screen.getByText(en('countryData'))).toBeTruthy();
  });
});
