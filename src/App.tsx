import {useDeferredValue, useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef, type ReactNode} from 'react';
import {Users, ArrowDownUp, CalendarRange, Sun, Moon, Languages, Share2, Download, Check, ChevronDown, ChevronUp, Shuffle, Landmark, BarChart3, ArrowLeftRight, Handshake} from 'lucide-react';
import AlluvialDiagram, {type SortMode} from '@/components/AlluvialDiagram';
import TurnoutDiagram from '@/components/TurnoutDiagram';
import {DEFAULT_TURNOUT_VIEW, SEGMENT_KINDS, type ScaleMode, type TurnoutView} from '@/components/turnoutView';
import ParliamentDiagram from '@/components/ParliamentDiagram';
import ElectionCompare from '@/components/ElectionCompare';
import CoalitionExplorer, {type CoalitionSelection} from '@/components/CoalitionExplorer';
import CountrySelect from '@/components/CountrySelect';
import {Dropdown} from '@/components/Dropdown';
import HomePage, {type HomeView} from '@/components/HomePage';
import type {CoalitionData, ElectionYear, PartyInfo} from '@/types';
import {
  isCountryLoaded,
  loadCountries,
  loadCountryData,
  loadParties,
  loadElections,
  loadAllElections,
  loadDataSources,
  loadCoalitions,
  buildMultiElectionFlows,
  buildComparison,
  type CountryInfo,
  type DataSourceEntry,
} from '@/data/loader';
import {EmptyState, RangeControl} from '@/components/shared';
import {
  defaultRange,
  formatElectionLabel,
  partyButtonClass,
  readableTextColor,
  sliceByIndexRange,
  toggleButtonClass,
} from '@/components/diagramUtils';
import {
  ThemeContext,
  LanguageContext,
  translations,
  useI18n,
  useTheme,
  type Theme,
  type Language,
  type TranslationKey,
} from '@/theme';
import {updateUrl, copyShareUrl, exportSvg, exportCsv, type UrlState} from '@/utils/export';

type TabKey = 'home' | 'alluvial' | 'parliament' | 'turnout' | 'compare' | 'coalition';

interface AppData {
  parties: PartyInfo[];
  allElections: ElectionYear[];
  allElectionsForTurnout: ElectionYear[];
  dataSources: DataSourceEntry[];
  coalitions: CoalitionData[];
}

function loadAppData(country: string): AppData {
  try {
    return {
      parties: loadParties(country),
      allElections: loadElections(country),
      allElectionsForTurnout: loadAllElections(country),
      dataSources: loadDataSources(country),
      coalitions: loadCoalitions(country),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load election data: ${message}`, {cause: error});
  }
}

// Non-voters and "other parties" are not parties: their names in the data files are in
// each country's own language, so every view shows the interface's words instead.
const INTERFACE_PARTY_NAMES: Partial<Record<string, TranslationKey>> = {
  not_voted: 'didNotVote',
  other: 'otherParties',
};

/** The parties with the non-party groups named in the interface language. */
function localizeParties(parties: PartyInfo[], t: (key: TranslationKey) => string): PartyInfo[] {
  return parties.map((party) => {
    const key = INTERFACE_PARTY_NAMES[party.party];
    return key ? {...party, display_name: t(key)} : party;
  });
}

function getAvailableParties(elections: ElectionYear[], parties: PartyInfo[]): PartyInfo[] {
  const partySet = new Set<string>();

  for (const election of elections) {
    for (const movement of election.movements) {
      partySet.add(movement.party);
    }
  }

  return parties
    .filter((party) => partySet.has(party.party))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

const DEFAULT_COUNTRY = 'nl';

/** The requested country when it has data, else the default country, else the first one. */
function pickCountry(countryIds: string[], requested: string): string {
  if (countryIds.includes(requested)) return requested;
  if (countryIds.includes(DEFAULT_COUNTRY)) return DEFAULT_COUNTRY;
  return countryIds[0] ?? '';
}

const TAB_KEYS: readonly TabKey[] = ['home', 'alluvial', 'parliament', 'turnout', 'compare', 'coalition'];
const THEMES: readonly Theme[] = ['dark', 'light'];
const LANGUAGES: readonly Language[] = ['en', 'nl'];
// Each language named in itself, so a visitor finds their own.
const LANGUAGE_OPTIONS = [{value: 'en', label: 'English'}, {value: 'nl', label: 'Nederlands'}];
const SORT_MODES: readonly SortMode[] = ['votes', 'alphabetical'];
const SCALE_MODES: readonly ScaleMode[] = ['absolute', 'percentage'];

/** A URL value when it is one of `allowed`, else `fallback`. */
function pickOption<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

/** Parse the state that survives a country switch from the URL. */
function getInitialAppStateFromUrl(countries: CountryInfo[]) {
  const params = new URLSearchParams(window.location.search);
  return {
    country: pickCountry(countries.map((c) => c.id), params.get('country') ?? ''),
    tab: pickOption(params.get('tab'), TAB_KEYS, 'home'),
    theme: pickOption(params.get('theme'), THEMES, 'dark'),
    lang: pickOption(params.get('lang'), LANGUAGES, 'en'),
  };
}

/**
 * Parse a country's initial diagram state from the URL. After a country switch the
 * URL still describes the previous country, so `readUrl` is false and defaults apply.
 */
function getInitialStateFromUrl(
  allElections: ElectionYear[],
  comparisonElections: ElectionYear[],
  cabinetCount: number,
  readUrl: boolean
) {
  const params = new URLSearchParams(readUrl ? window.location.search : '');
  const electionYears = allElections.map((e) => e.year);
  const comparisonYears = comparisonElections.map((e) => e.year);

  const party = params.get('party');

  const readIndex = (key: string, fallback: number, max: number): number => {
    if (!params.has(key)) return fallback;
    const value = Number(params.get(key));
    return Number.isInteger(value) ? Math.max(0, Math.min(max, value)) : fallback;
  };
  // A range from the URL, else the default range of every view: the last ten.
  const readRange = (startKey: string, endKey: string, count: number) => {
    const fallback = defaultRange(count);
    const start = readIndex(startKey, fallback.start, fallback.end);
    return {start, end: Math.max(start, readIndex(endKey, fallback.end, fallback.end))};
  };
  const flowRange = readRange('ys', 'ye', electionYears.length);
  const turnoutRange = readRange('tys', 'tye', comparisonYears.length);

  const hidden = (params.get('hide') ?? '').split(',');
  const turnoutView: TurnoutView = {
    scale: pickOption(params.get('scale'), SCALE_MODES, DEFAULT_TURNOUT_VIEW.scale),
    hidden: SEGMENT_KINDS.filter((segment) => hidden.includes(segment)),
  };
  const coalitionYear = params.get('cy');
  const coalitionSelection: CoalitionSelection | undefined = coalitionYear
    ? {year: coalitionYear, parties: (params.get('cp') ?? '').split(',').filter(Boolean)}
    : undefined;

  const defaultCompareYearA = comparisonYears[Math.max(0, comparisonYears.length - 2)] ?? '';
  const defaultCompareYearB = comparisonYears.at(-1) ?? '';
  const requestedCompareYearA = params.get('cmpA');
  const requestedCompareYearB = params.get('cmpB');

  return {
    party: party || null,
    yearStart: flowRange.start,
    yearEnd: flowRange.end,
    turnoutYearStart: turnoutRange.start,
    turnoutYearEnd: turnoutRange.end,
    parliamentRange: readRange('ps', 'pe', cabinetCount),
    turnoutView,
    coalitionSelection,
    sortMode: pickOption(params.get('sort'), SORT_MODES, 'votes'),
    compareYearA: requestedCompareYearA && comparisonYears.includes(requestedCompareYearA)
      ? requestedCompareYearA
      : defaultCompareYearA,
    compareYearB: requestedCompareYearB && comparisonYears.includes(requestedCompareYearB)
      ? requestedCompareYearB
      : defaultCompareYearB,
  };
}

export default function App() {
  const countries = useMemo(() => loadCountries(), []);
  const initialAppState = useMemo(() => getInitialAppStateFromUrl(countries), [countries]);

  const [country, setCountry] = useState<string>(initialAppState.country);
  const [readUrl, setReadUrl] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>(initialAppState.tab);
  const [theme, setTheme] = useState<Theme>(initialAppState.theme);
  const [lang, setLang] = useState<Language>(initialAppState.lang);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const changeCountry = useCallback((id: string) => {
    setReadUrl(false);
    setCountry(id);
  }, []);

  // A country's data is downloaded when it is first shown. Until it is in, the previous
  // country stays on screen (or, on the first visit, a short loading note).
  const [shownCountry, setShownCountry] = useState<string | null>(isCountryLoaded(country) ? country : null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  useEffect(() => {
    let current = true;
    loadCountryData(country).then(
      () => {
        if (current) setShownCountry(country);
      },
      (error: unknown) =>
        setLoadError(error instanceof Error ? error : new Error('Could not load the election data', {cause: error}))
    );
    return () => {
      current = false;
    };
  }, [country]);
  // Thrown during render, so the error boundary shows it like any other loading failure.
  if (loadError) throw loadError;

  const t = useCallback((key: TranslationKey) => translations[lang][key], [lang]);
  // Stable context values: a new object every render would re-render every consumer.
  const themeContext = useMemo(() => ({theme, toggleTheme}), [theme, toggleTheme]);
  const languageContext = useMemo(() => ({lang, t}), [lang, t]);

  return (
    <ThemeContext.Provider value={themeContext}>
      <LanguageContext.Provider value={languageContext}>
        {shownCountry === null ? (
          <p className="min-h-screen flex items-center justify-center bg-app-bg text-app-muted">{t('loadingData')}</p>
        ) : (
          // Keyed by country: every country starts with its own fresh diagram state.
          <Dashboard
            key={shownCountry}
            country={shownCountry}
            countries={countries}
            onCountryChange={changeCountry}
            readUrl={readUrl}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onLangChange={setLang}
          />
        )}
      </LanguageContext.Provider>
    </ThemeContext.Provider>
  );
}

const HEADER_BUTTON_CLASS = 'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-app-btn text-app-btn-text hover:bg-app-btn-hover';
const CARD_CLASS = 'bg-app-card rounded-2xl p-3 sm:p-6 border border-app-border shadow-2xl';

/** Title and introduction shown above every tab. */
function TabHeading({title, description}: Readonly<{ title: string; description: string }>) {
  return (
    <div className="mb-6 sm:mb-8">
      <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-app-heading">{title}</h2>
      <p className="text-app-muted max-w-2xl">{description}</p>
    </div>
  );
}

/** Header button that briefly shows a check mark and `doneLabel` after it was used. */
function FeedbackButton({done, icon, label, doneLabel, onClick}: Readonly<{
  done: boolean;
  icon: ReactNode;
  label: string;
  doneLabel: string;
  onClick: () => void;
}>) {
  return (
    <button type="button" onClick={onClick} className={HEADER_BUTTON_CLASS} aria-label={label} title={label}>
      {done ? <Check className="w-4 h-4 text-app-good"/> : icon}
      {/* Phones show the icon only; the label stays available through aria-label. */}
      <span className="hidden sm:inline">{done ? doneLabel : label}</span>
    </button>
  );
}

/** "All parties" plus one toggle per party with voter movement data. */
function PartyFilter({parties, activeParty, onSelect}: Readonly<{
  parties: PartyInfo[];
  activeParty: string | null;
  onSelect: (party: string | null) => void;
}>) {
  const {t} = useI18n();
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-app-muted whitespace-nowrap">{t('partyFilter')}</span>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(activeParty === null)}`}
      >
        {t('allParties')}
      </button>
      {parties.map((p) => {
        const isSelected = activeParty === p.party;
        return (
          <button
            type="button"
            key={p.party}
            onClick={() => onSelect(isSelected ? null : p.party)}
            className={partyButtonClass(isSelected, 'ring-offset-app-bg')}
            style={isSelected ? {backgroundColor: p.color, color: readableTextColor(p.color), boxShadow: `0 0 0 2px ${p.color}`} : undefined}
          >
            <span className="w-3 h-3 rounded-full" style={{backgroundColor: p.color}}/>
            {p.display_name}
          </button>
        );
      })}
    </div>
  );
}

/** Collapsible list of every data source of the selected country. */
function SourcesFooter({dataSources}: Readonly<{ dataSources: DataSourceEntry[] }>) {
  const {lang, t} = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const getSourceLabel = (source: DataSourceEntry) =>
    source.kind === 'totals'
      ? `${t('totals')} (${formatElectionLabel(source.year, lang)})`
      : `${t('movements')} (${formatElectionLabel(source.fromYear ?? source.year, lang)} → ${formatElectionLabel(source.toYear ?? source.year, lang)})`;

  return (
    <footer className="border-t border-app-border mt-12 py-8">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setIsOpen((open) => !open)}
            aria-expanded={isOpen}
            aria-controls="all-data-sources"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-app-muted hover:text-app-text"
          >
            {t('sources')}
            <span className="normal-case tracking-normal">
              — {isOpen ? t('sourcesHide') : t('sourcesShow')}
            </span>
            {isOpen ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
          </button>
          <span className="text-xs text-app-subtle">{t('version')} {__APP_VERSION__}</span>
        </div>
        {isOpen && (
          <ul id="all-data-sources" className="mt-4 space-y-3 text-sm text-app-subtle">
            {dataSources.map((source) => (
              <li key={`${source.year}-${source.kind}-${source.name}`}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-app-text font-medium min-w-[170px]">{getSourceLabel(source)}</span>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer"
                     className="text-app-link underline decoration-dotted underline-offset-4 hover:text-app-link-hover">
                    {source.name}
                  </a>
                ) : (
                  <span>{source.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}

interface DashboardProps {
  country: string;
  countries: CountryInfo[];
  onCountryChange: (country: string) => void;
  readUrl: boolean;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onLangChange: (lang: Language) => void;
}

function Dashboard({
  country,
  countries,
  onCountryChange,
  readUrl,
  activeTab: requestedTab,
  onTabChange,
  onLangChange,
}: Readonly<DashboardProps>) {
  const {theme, toggleTheme} = useTheme();
  const {lang, t} = useI18n();
  const {parties: dataParties, allElections, allElectionsForTurnout, dataSources, coalitions} = useMemo(
    () => loadAppData(country),
    [country]
  );
  const parties = useMemo(() => localizeParties(dataParties, t), [dataParties, t]);

  const initialState = useMemo(
    () => getInitialStateFromUrl(allElections, allElectionsForTurnout, coalitions.length, readUrl),
    [allElections, allElectionsForTurnout, coalitions.length, readUrl]
  );

  // A country without any known voter movements has no flow diagram at all.
  const hasMovements = allElections.length >= 2;
  const activeTab: TabKey = requestedTab === 'alluvial' && !hasMovements ? 'turnout' : requestedTab;
  const setActiveTab = onTabChange;
  const setLang = onLangChange;

  const electionYears = useMemo(() => allElections.map((e) => e.year), [allElections]);

  const [selectedParty, setSelectedParty] = useState<string | null>(initialState.party);
  const [sortMode, setSortMode] = useState<SortMode>(initialState.sortMode);
  const [yearStart, setYearStart] = useState<number>(initialState.yearStart);
  const [yearEnd, setYearEnd] = useState<number>(initialState.yearEnd);

  // Compare tab state
  const [compareYearA, setCompareYearA] = useState<string>(initialState.compareYearA);
  const [compareYearB, setCompareYearB] = useState<string>(initialState.compareYearB);

  const turnoutYears = useMemo(() => allElectionsForTurnout.map((e) => e.year), [allElectionsForTurnout]);
  const [turnoutYearStart, setTurnoutYearStart] = useState<number>(initialState.turnoutYearStart);
  const [turnoutYearEnd, setTurnoutYearEnd] = useState<number>(initialState.turnoutYearEnd);

  // Each view's own settings, kept here so they survive a tab switch and go into the URL.
  const [turnoutView, setTurnoutView] = useState<TurnoutView>(initialState.turnoutView);
  const [parliamentRange, setParliamentRange] = useState(initialState.parliamentRange);
  const [coalitionSelection, setCoalitionSelection] = useState<CoalitionSelection | undefined>(
    initialState.coalitionSelection
  );

  const deferredYearStart = useDeferredValue(yearStart);
  const deferredYearEnd = useDeferredValue(yearEnd);

  const elections = useMemo(
    () => sliceByIndexRange(allElections, deferredYearStart, deferredYearEnd),
    [allElections, deferredYearStart, deferredYearEnd]
  );

  const electionLabels = elections.map((e) => formatElectionLabel(e.year, lang));

  const availableParties = useMemo(() => getAvailableParties(elections, parties), [elections, parties]);

  // A party from the URL, or one with no movements in the current range, has no filter
  // button, so it must not silently filter the diagram. The selection is kept so it
  // applies again once the range includes the party.
  const activeParty = selectedParty && availableParties.some((p) => p.party === selectedParty)
    ? selectedParty
    : null;

  const {nodes, links} = useMemo(() => {
    return buildMultiElectionFlows(elections, parties, activeParty);
  }, [elections, parties, activeParty]);

  const deferredTurnoutYearStart = useDeferredValue(turnoutYearStart);
  const deferredTurnoutYearEnd = useDeferredValue(turnoutYearEnd);

  const turnoutElections = useMemo(
    () => sliceByIndexRange(allElectionsForTurnout, deferredTurnoutYearStart, deferredTurnoutYearEnd),
    [allElectionsForTurnout, deferredTurnoutYearStart, deferredTurnoutYearEnd]
  );

  const urlState = useMemo(() => {
    const state: UrlState = {
      country,
      tab: activeTab,
      theme,
      lang,
    };
    if (activeTab === 'alluvial') {
      state.ys = yearStart;
      state.ye = yearEnd;
      state.party = activeParty;
      state.sort = sortMode;
    } else if (activeTab === 'turnout') {
      state.tys = turnoutYearStart;
      state.tye = turnoutYearEnd;
      state.scale = turnoutView.scale === DEFAULT_TURNOUT_VIEW.scale ? null : turnoutView.scale;
      state.hide = turnoutView.hidden.join(',');
    } else if (activeTab === 'parliament') {
      state.ps = parliamentRange.start;
      state.pe = parliamentRange.end;
    } else if (activeTab === 'compare') {
      state.cmpA = compareYearA;
      state.cmpB = compareYearB;
    } else if (activeTab === 'coalition' && coalitionSelection) {
      state.cy = coalitionSelection.year;
      state.cp = coalitionSelection.parties.join(',');
    }
    return state;
  }, [country, activeTab, yearStart, yearEnd, activeParty, sortMode, turnoutYearStart, turnoutYearEnd, turnoutView,
    parliamentRange, compareYearA, compareYearB, coalitionSelection, theme, lang]);

  // Debounced: dragging a slider changes urlState on every step, and Safari/Firefox
  // throw once replaceState is called more than ~100-200 times in 10 seconds.
  useEffect(() => {
    const timeout = setTimeout(() => updateUrl(urlState), 300);
    return () => clearTimeout(timeout);
  }, [urlState]);

  // Share & export state
  const [shareFeedback, setShareFeedback] = useState(false);
  const [exportFeedback, setExportFeedback] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isCompareTab = activeTab === 'compare';

  const handleShare = useCallback(async () => {
    const success = await copyShareUrl(urlState);
    if (success) {
      setShareFeedback(true);
      setTimeout(() => setShareFeedback(false), 2000);
    }
  }, [urlState]);

  const handleExportChart = useCallback(() => {
    const svg = chartContainerRef.current?.querySelector<SVGSVGElement>('svg[data-export-chart]');
    if (!svg) return;
    const filename = `voterflow-${activeTab}-${Date.now()}.svg`;
    exportSvg(svg, filename);
    setExportFeedback(true);
    setTimeout(() => setExportFeedback(false), 2000);
  }, [activeTab]);

  const handleExportData = useCallback(() => {
    const headers = ['Party', `Votes ${compareYearA}`, `Votes ${compareYearB}`, 'Vote change', `Share ${compareYearA}`, `Share ${compareYearB}`, 'Share change pp', `Seats ${compareYearA}`, `Seats ${compareYearB}`, 'Seat change'];
    const comparisonRows = buildComparison(allElectionsForTurnout, compareYearA, compareYearB, coalitions, parties).rows;
    if (comparisonRows.length === 0) return;
    const rows = comparisonRows.map((row) => [
      row.label, row.votesA, row.votesB, row.voteChange,
      row.shareA.toFixed(1), row.shareB.toFixed(1), row.shareChange.toFixed(1),
      row.seatsA ?? '', row.seatsB ?? '', row.seatChange ?? '',
    ]);
    exportCsv(headers, rows, `voterflow-compare-${Date.now()}.csv`);
    setExportFeedback(true);
    setTimeout(() => setExportFeedback(false), 2000);
  }, [allElectionsForTurnout, coalitions, parties, compareYearA, compareYearB]);

  const tabs: {key: TabKey; label: string}[] = [
    ...(hasMovements ? [{key: 'alluvial' as TabKey, label: t('tabAlluvial')}] : []),
    {key: 'parliament', label: t('tabParliament')},
    {key: 'turnout', label: t('tabTurnout')},
    {key: 'compare', label: t('tabCompare')},
    {key: 'coalition', label: t('tabCoalition')},
  ];

  // The front page offers the same views, in the same order, as cards.
  const homeViews: HomeView[] = [
    ...(hasMovements ? [{key: 'alluvial', title: t('tabAlluvial'), description: t('homeAlluvial'), icon: <Shuffle className="w-5 h-5"/>}] : []),
    {key: 'parliament', title: t('tabParliament'), description: t('homeParliament'), icon: <Landmark className="w-5 h-5"/>},
    {key: 'turnout', title: t('tabTurnout'), description: t('homeTurnout'), icon: <BarChart3 className="w-5 h-5"/>},
    {key: 'compare', title: t('tabCompare'), description: t('homeCompare'), icon: <ArrowLeftRight className="w-5 h-5"/>},
    {key: 'coalition', title: t('tabCoalition'), description: t('homeCoalition'), icon: <Handshake className="w-5 h-5"/>},
  ];
  const currentCountry = countries.find((c) => c.id === country);

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      {/* Header. Phones: brand and action icons on the first row, data and language on the
          second, scrolling away with the page. Wider screens: one sticky row. */}
      <header className="border-b border-app-border bg-app-header backdrop-blur-xs sm:sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* Logo and title lead back to the front page. */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            aria-label={t('homeLink')}
            title={t('homeLink')}
            className="flex items-center gap-3 min-w-0 flex-1 lg:flex-none text-left rounded-lg"
          >
            <span
              className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-lg bg-app-accent flex items-center justify-center">
              <Users className="w-5 h-5 text-app-on-accent"/>
            </span>
            <h1 className="text-base sm:text-lg font-bold leading-tight tracking-tight text-app-heading">{t('appTitle')}</h1>
          </button>

          {/* Data and language: their own full-width row on phones. The data selector stays at
              the start and the language at the end, so the two never read as one choice. */}
          <div className="order-3 lg:order-2 w-full lg:w-auto lg:flex-1 flex items-end lg:items-center justify-between gap-3">
            {countries.length > 1 && (
              <div className="lg:pl-4 lg:border-l border-app-border">
                <CountrySelect countries={countries} value={country} onChange={onCountryChange}/>
              </div>
            )}

            <div className="ml-auto">
              <Dropdown
                label={t('language')}
                hideLabel
                hint={t('languageHint')}
                buttonIcon={<Languages className="w-4 h-4 text-app-muted"/>}
                options={LANGUAGE_OPTIONS}
                value={lang}
                onChange={(value) => setLang(pickOption(value, LANGUAGES, lang))}
              />
            </div>
          </div>

          <div className="order-2 lg:order-3 flex items-center gap-2">
            <FeedbackButton
              done={shareFeedback}
              icon={<Share2 className="w-4 h-4"/>}
              label={t('share')}
              doneLabel={t('shareCopied')}
              onClick={() => void handleShare()}
            />
            {/* The compare tab exports its table as CSV; the chart tabs their chart as SVG.
                The front page has nothing to export. */}
            {activeTab !== 'home' && (
              <FeedbackButton
                done={exportFeedback}
                icon={<Download className="w-4 h-4"/>}
                label={isCompareTab ? t('exportData') : t('exportChart')}
                doneLabel={t('exportDone')}
                onClick={isCompareTab ? handleExportData : handleExportChart}
              />
            )}

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className={HEADER_BUTTON_CLASS}
              aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
              <span className="hidden sm:inline">{theme === 'dark' ? t('lightMode') : t('darkMode')}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Tabs */}
        <div className="mb-6 sm:mb-8 flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 sm:px-6 sm:py-3 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(activeTab === tab.key)}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'home' && (
          <HomePage
            countryName={currentCountry?.name[lang] ?? country}
            electionYears={turnoutYears}
            governmentCount={coalitions.length}
            views={homeViews}
            onOpen={(key) => setActiveTab(pickOption(key, TAB_KEYS, 'home'))}
          />
        )}

        {/* Alluvial Tab */}
        {activeTab === 'alluvial' && (
          <>
            <TabHeading title={t('alluvialTitle')} description={t('alluvialDescription')}/>

            <div className="mb-6 flex flex-col lg:flex-row gap-4 items-start lg:items-center">
              <PartyFilter parties={availableParties} activeParty={activeParty} onSelect={setSelectedParty}/>
            </div>

            <div className="mb-6 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
                <CalendarRange className="w-4 h-4 text-app-muted"/>
                <RangeControl
                  labels={electionYears.map((year) => formatElectionLabel(year, lang))}
                  start={yearStart}
                  end={yearEnd}
                  onChange={(start, end) => {
                    setYearStart(start);
                    setYearEnd(end);
                  }}
                />
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <ArrowDownUp className="w-4 h-4 text-app-muted"/>
                <span className="text-sm font-medium text-app-muted whitespace-nowrap">{t('sort')}</span>
                <button type="button" onClick={() => setSortMode('votes')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(sortMode === 'votes')}`}>{t('sortByVotes')}</button>
                <button type="button" onClick={() => setSortMode('alphabetical')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(sortMode === 'alphabetical')}`}>{t('sortAlphabetical')}</button>
              </div>
            </div>

            <div ref={chartContainerRef} className={CARD_CLASS}>
              {nodes.length === 0 ? (
                <EmptyState message={t('noFlowData')}/>
              ) : (
                <AlluvialDiagram
                  nodes={nodes}
                  links={links}
                  electionLabels={electionLabels}
                  selectedParty={activeParty}
                  sortMode={sortMode}
                />
              )}
            </div>

          </>
        )}

        {/* Turnout Tab */}
        {activeTab === 'turnout' && (
          <>
            <TabHeading title={t('turnoutTitle')} description={t('turnoutDescription')}/>

            <div className="mb-6 flex items-center gap-3 flex-wrap">
              <CalendarRange className="w-4 h-4 text-app-muted"/>
              <RangeControl
                labels={turnoutYears.map((year) => formatElectionLabel(year, lang))}
                start={turnoutYearStart}
                end={turnoutYearEnd}
                onChange={(start, end) => {
                  setTurnoutYearStart(start);
                  setTurnoutYearEnd(end);
                }}
              />
            </div>

            <div ref={chartContainerRef} className={CARD_CLASS}>
              <TurnoutDiagram elections={turnoutElections} view={turnoutView} onViewChange={setTurnoutView}/>
            </div>

          </>
        )}

        {/* Parliament Tab */}
        {activeTab === 'parliament' && (
          <>
            <TabHeading title={t('parliamentTitle')} description={t('parliamentDescription')}/>

            <div className="mb-6 flex items-center gap-3 flex-wrap">
              <CalendarRange className="w-4 h-4 text-app-muted"/>
              <RangeControl
                labels={coalitions.map((coalition) => `${coalition.name} (${coalition.inauguration.slice(0, 4)})`)}
                start={parliamentRange.start}
                end={parliamentRange.end}
                onChange={(start, end) => setParliamentRange({start, end})}
              />
            </div>

            <div ref={chartContainerRef} className={CARD_CLASS}>
              <ParliamentDiagram
                coalitions={coalitions}
                parties={parties}
                elections={allElectionsForTurnout}
                range={parliamentRange}
              />
            </div>

          </>
        )}

        {/* Compare Tab */}
        {isCompareTab && (
          <>
            <TabHeading title={t('compareTitle')} description={t('compareDescription')}/>

            <div className={CARD_CLASS}>
              <ElectionCompare
                elections={allElectionsForTurnout}
                coalitions={coalitions}
                parties={parties}
                yearA={compareYearA}
                yearB={compareYearB}
                onYearAChange={setCompareYearA}
                onYearBChange={setCompareYearB}
              />
            </div>
          </>
        )}

        {/* Coalition Explorer Tab */}
        {activeTab === 'coalition' && (
          <>
            <TabHeading title={t('coalitionExplTitle')} description={t('coalitionExplDescription')}/>

            <div ref={chartContainerRef} className={CARD_CLASS}>
              <CoalitionExplorer
                coalitions={coalitions}
                parties={parties}
                selection={coalitionSelection}
                onSelectionChange={setCoalitionSelection}
              />
            </div>
          </>
        )}
      </main>

      <SourcesFooter dataSources={dataSources}/>
    </div>
  );
}
