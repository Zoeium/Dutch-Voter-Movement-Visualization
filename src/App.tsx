import {useDeferredValue, useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef} from 'react';
import {Users, Info, ArrowDownUp, CalendarRange, Sun, Moon, Languages, Share2, Download, Check, ChevronDown, ChevronUp} from 'lucide-react';
import AlluvialDiagram, {type SortMode} from '@/components/AlluvialDiagram';
import TurnoutDiagram from '@/components/TurnoutDiagram';
import ParliamentDiagram from '@/components/ParliamentDiagram';
import ElectionCompare from '@/components/ElectionCompare';
import CoalitionExplorer from '@/components/CoalitionExplorer';
import CountrySelect from '@/components/CountrySelect';
import type {CoalitionData, ElectionYear, PartyInfo} from '@/types';
import {
  loadCountries,
  loadParties,
  loadElections,
  loadAllElections,
  loadDataSources,
  loadCoalitions,
  buildMultiElectionFlows,
  buildComparisonRows,
  type CountryInfo,
  type DataSourceEntry,
} from '@/data/loader';
import {DualRangeSlider} from '@/components/shared';
import {formatElectionLabel, partyButtonClass, sliceByIndexRange, toggleButtonClass} from '@/components/diagramUtils';
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
import {updateUrl, copyShareUrl, exportSvg, exportCsv} from '@/utils/export';

type TabKey = 'alluvial' | 'turnout' | 'parliament' | 'compare' | 'coalition';

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
    throw new Error(`Failed to load election data: ${message}`);
  }
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

/** Parse the state that survives a country switch from the URL. */
function getInitialAppStateFromUrl(countries: CountryInfo[]) {
  const params = new URLSearchParams(window.location.search);
  const countryIds = countries.map((c) => c.id);
  const country = params.get('country') ?? '';
  const tab = (params.get('tab') as TabKey) || 'alluvial';
  const validTabs: TabKey[] = ['alluvial', 'turnout', 'parliament', 'compare', 'coalition'];
  const theme = (params.get('theme') as Theme) || 'dark';
  const lang = (params.get('lang') as Language) || 'en';

  return {
    country: countryIds.includes(country)
      ? country
      : countryIds.includes(DEFAULT_COUNTRY) ? DEFAULT_COUNTRY : countryIds[0] ?? '',
    tab: validTabs.includes(tab) ? tab : 'alluvial' as TabKey,
    theme: (theme === 'light' || theme === 'dark') ? theme : 'dark' as Theme,
    lang: (lang === 'en' || lang === 'nl') ? lang : 'en' as Language,
  };
}

/**
 * Parse a country's initial diagram state from the URL. After a country switch the
 * URL still describes the previous country, so `readUrl` is false and defaults apply.
 */
function getInitialStateFromUrl(allElections: ElectionYear[], comparisonElections: ElectionYear[], readUrl: boolean) {
  const params = new URLSearchParams(readUrl ? window.location.search : '');
  const electionYears = allElections.map((e) => e.year);
  const comparisonYears = comparisonElections.map((e) => e.year);

  const party = params.get('party');

  const readIndex = (key: string, fallback: number, max: number): number => {
    if (!params.has(key)) return fallback;
    const value = Number(params.get(key));
    return Number.isInteger(value) ? Math.max(0, Math.min(max, value)) : fallback;
  };
  const maxElectionIndex = Math.max(0, electionYears.length - 1);
  const maxComparisonIndex = Math.max(0, comparisonYears.length - 1);
  const yearStart = readIndex('ys', 0, maxElectionIndex);
  const yearEnd = Math.max(yearStart, readIndex('ye', maxElectionIndex, maxElectionIndex));
  const turnoutYearStart = readIndex('tys', 0, maxComparisonIndex);
  const turnoutYearEnd = Math.max(turnoutYearStart, readIndex('tye', maxComparisonIndex, maxComparisonIndex));

  const sort = (params.get('sort') as SortMode) || 'votes';
  const defaultCompareYearA = comparisonYears[Math.max(0, comparisonYears.length - 2)] ?? '';
  const defaultCompareYearB = comparisonYears[comparisonYears.length - 1] ?? '';
  const requestedCompareYearA = params.get('cmpA');
  const requestedCompareYearB = params.get('cmpB');

  return {
    party: party || null,
    yearStart,
    yearEnd,
    turnoutYearStart,
    turnoutYearEnd,
    sortMode: (sort === 'alphabetical' || sort === 'votes') ? sort : 'votes' as SortMode,
    compareYearA: requestedCompareYearA && comparisonYears.includes(requestedCompareYearA)
      ? requestedCompareYearA
      : defaultCompareYearA,
    compareYearB: requestedCompareYearB && comparisonYears.includes(requestedCompareYearB)
      ? requestedCompareYearB
      : defaultCompareYearB,
  };
}

export default function App() {
  const countries = useMemo(loadCountries, []);
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

  const t = useCallback((key: TranslationKey) => translations[lang][key], [lang]);

  return (
    <ThemeContext.Provider value={{theme, toggleTheme}}>
      <LanguageContext.Provider value={{lang, t}}>
        {/* Keyed by country: every country starts with its own fresh diagram state. */}
        <Dashboard
          key={country}
          country={country}
          countries={countries}
          onCountryChange={changeCountry}
          readUrl={readUrl}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onLangChange={setLang}
        />
      </LanguageContext.Provider>
    </ThemeContext.Provider>
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
  const {parties, allElections, allElectionsForTurnout, dataSources, coalitions} = useMemo(
    () => loadAppData(country),
    [country]
  );

  const initialState = useMemo(
    () => getInitialStateFromUrl(allElections, allElectionsForTurnout, readUrl),
    [allElections, allElectionsForTurnout, readUrl]
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

  const deferredYearStart = useDeferredValue(yearStart);
  const deferredYearEnd = useDeferredValue(yearEnd);

  const elections = useMemo(
    () => sliceByIndexRange(allElections, deferredYearStart, deferredYearEnd),
    [allElections, deferredYearStart, deferredYearEnd]
  );

  const electionLabels = elections.map((e) => formatElectionLabel(e.year));
  const hasSelectableYears = electionYears.length > 0;

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

  const getSourceLabel = (source: DataSourceEntry) =>
    source.kind === 'totals'
      ? `${t('totals')} (${formatElectionLabel(source.year)})`
      : `${t('movements')} (${formatElectionLabel(source.fromYear ?? source.year)} → ${formatElectionLabel(source.toYear ?? source.year)})`;

  const urlState = useMemo(() => {
    const state: Record<string, string | number | boolean | null> = {
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
    } else if (activeTab === 'compare') {
      state.cmpA = compareYearA;
      state.cmpB = compareYearB;
    }
    return state;
  }, [country, activeTab, yearStart, yearEnd, activeParty, sortMode, turnoutYearStart, turnoutYearEnd, compareYearA, compareYearB, theme, lang]);

  // Debounced: dragging a slider changes urlState on every step, and Safari/Firefox
  // throw once replaceState is called more than ~100-200 times in 10 seconds.
  useEffect(() => {
    const timeout = setTimeout(() => updateUrl(urlState), 300);
    return () => clearTimeout(timeout);
  }, [urlState]);

  // Share & export state
  const [shareFeedback, setShareFeedback] = useState(false);
  const [exportFeedback, setExportFeedback] = useState(false);
  const [areSourcesOpen, setAreSourcesOpen] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

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
    const comparisonRows = buildComparisonRows(allElectionsForTurnout, compareYearA, compareYearB, coalitions, parties);
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
    {key: 'turnout', label: t('tabTurnout')},
    {key: 'parliament', label: t('tabParliament')},
    {key: 'compare', label: t('tabCompare')},
    {key: 'coalition', label: t('tabCoalition')},
  ];

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      {/* Header */}
      <header className="border-b border-app-border bg-app-header backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Users className="w-5 h-5 text-white"/>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-app-heading">{t('appTitle')}</h1>
            </div>

            {/* Data selector: whose elections are shown. Kept apart from the display
                settings on the right so it does not read as a language choice. */}
            {countries.length > 1 && (
              <div className="ml-4 pl-4 border-l border-app-border">
                <CountrySelect countries={countries} value={country} onChange={onCountryChange}/>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Share button */}
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-app-btn text-app-btn-text hover:bg-app-btn-hover"
              aria-label={t('share')}
            >
              {shareFeedback ? <Check className="w-4 h-4 text-emerald-500"/> : <Share2 className="w-4 h-4"/>}
              {shareFeedback ? t('shareCopied') : t('share')}
            </button>

            {/* Export button */}
            <div className="relative">
              <button
                type="button"
                onClick={activeTab === 'compare' ? handleExportData : handleExportChart}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-app-btn text-app-btn-text hover:bg-app-btn-hover"
                aria-label={t(activeTab === 'compare' ? 'exportData' : 'exportChart')}
              >
                {exportFeedback ? <Check className="w-4 h-4 text-emerald-500"/> : <Download className="w-4 h-4"/>}
                {exportFeedback
                  ? t('exportDone')
                  : t(activeTab === 'compare' ? 'exportData' : 'exportChart')}
              </button>
            </div>

            {/* Language selector */}
            <label
              title={t('languageHint')}
              className="flex items-center gap-1.5 px-2 rounded-lg text-sm font-medium bg-app-btn text-app-btn-text border border-app-border"
            >
              <Languages className="w-4 h-4"/>
              <span className="sr-only">{t('language')}</span>
              <span className="relative">
                <select
                  value={lang}
                  onChange={(event) => setLang(event.target.value as Language)}
                  className="app-select app-select-compact"
                  aria-label={t('language')}
                >
                  <option value="en">English</option>
                  <option value="nl">Nederlands</option>
                </select>
                <ChevronDown className="app-select-chevron w-3.5 h-3.5"/>
              </span>
            </label>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-app-btn text-app-btn-text hover:bg-app-btn-hover"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
              {theme === 'dark' ? t('lightMode') : t('darkMode')}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="mb-8 flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(activeTab === tab.key)}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Alluvial Tab */}
        {activeTab === 'alluvial' && (
          <>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-app-heading">{t('alluvialTitle')}</h2>
              <p className="text-app-muted max-w-2xl">{t('alluvialDescription')}</p>
            </div>

            <div className="mb-6 flex flex-col lg:flex-row gap-4 items-start lg:items-center">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-app-muted whitespace-nowrap">{t('partyFilter')}</span>
                <button
                  type="button"
                  onClick={() => setSelectedParty(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(activeParty === null)}`}
                >
                  {t('allParties')}
                </button>
                {availableParties.map((p) => {
                  const isSelected = activeParty === p.party;
                  return (
                    <button
                      type="button"
                      key={p.party}
                      onClick={() => setSelectedParty(isSelected ? null : p.party)}
                      className={partyButtonClass(isSelected, 'ring-offset-app-bg')}
                      style={isSelected ? {backgroundColor: p.color, color: '#fff', boxShadow: `0 0 0 2px ${p.color}`} : undefined}
                    >
                      <span className="w-3 h-3 rounded-full" style={{backgroundColor: p.color}}/>
                      {p.display_name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-6 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
                <CalendarRange className="w-4 h-4 text-app-muted"/>
                <span className="text-sm font-medium text-app-muted whitespace-nowrap">
                  {hasSelectableYears ? `${t('years')}: ${formatElectionLabel(electionYears[yearStart])}–${formatElectionLabel(electionYears[yearEnd])}` : t('yearsNone')}
                </span>
                {hasSelectableYears && (
                  <DualRangeSlider
                    min={0}
                    max={electionYears.length - 1}
                    start={yearStart}
                    end={yearEnd}
                    onStartChange={setYearStart}
                    onEndChange={setYearEnd}
                    startAriaLabel="Range start"
                    endAriaLabel="Range end"
                  />
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <ArrowDownUp className="w-4 h-4 text-app-muted"/>
                <span className="text-sm font-medium text-app-muted whitespace-nowrap">{t('sort')}</span>
                <button type="button" onClick={() => setSortMode('votes')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(sortMode === 'votes')}`}>{t('sortByVotes')}</button>
                <button type="button" onClick={() => setSortMode('alphabetical')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(sortMode === 'alphabetical')}`}>{t('sortAlphabetical')}</button>
              </div>
            </div>

            <div ref={chartContainerRef} className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
              {nodes.length === 0 ? (
                <div className="flex items-center justify-center h-96 text-app-muted">
                  <div className="text-center">
                    <Info className="w-12 h-12 mx-auto mb-3 opacity-50"/>
                    <p>{t('noFlowData')}</p>
                  </div>
                </div>
              ) : (
                <AlluvialDiagram
                  nodes={nodes}
                  links={links}
                  numColumns={elections.length}
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
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-app-heading">{t('turnoutTitle')}</h2>
              <p className="text-app-muted max-w-2xl">{t('turnoutDescription')}</p>
            </div>

            <div className="mb-6 flex items-center gap-3 flex-wrap">
              <CalendarRange className="w-4 h-4 text-app-muted"/>
              <span className="text-sm font-medium text-app-muted whitespace-nowrap">
                {turnoutYears.length > 0 ? `${t('years')}: ${formatElectionLabel(turnoutYears[turnoutYearStart])}–${formatElectionLabel(turnoutYears[turnoutYearEnd])}` : t('yearsNone')}
              </span>
              {turnoutYears.length > 0 && (
                <DualRangeSlider
                  min={0}
                  max={turnoutYears.length - 1}
                  start={turnoutYearStart}
                  end={turnoutYearEnd}
                  onStartChange={setTurnoutYearStart}
                  onEndChange={setTurnoutYearEnd}
                  startAriaLabel="Turnout range start"
                  endAriaLabel="Turnout range end"
                />
              )}
            </div>

            <div ref={chartContainerRef} className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
              <TurnoutDiagram elections={turnoutElections}/>
            </div>

          </>
        )}

        {/* Parliament Tab */}
        {activeTab === 'parliament' && (
          <>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-app-heading">{t('parliamentTitle')}</h2>
              <p className="text-app-muted max-w-2xl">{t('parliamentDescription')}</p>
            </div>

            <div ref={chartContainerRef} className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
              <ParliamentDiagram coalitions={coalitions} parties={parties}/>
            </div>

          </>
        )}

        {/* Compare Tab */}
        {activeTab === 'compare' && (
          <>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-app-heading">{t('compareTitle')}</h2>
              <p className="text-app-muted max-w-2xl">{t('compareDescription')}</p>
            </div>

            <div className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
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
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-app-heading">{t('coalitionExplTitle')}</h2>
              <p className="text-app-muted max-w-2xl">{t('coalitionExplDescription')}</p>
            </div>

            <div ref={chartContainerRef} className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
              <CoalitionExplorer coalitions={coalitions} parties={parties}/>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-app-border mt-12 py-8">
        <div className="max-w-[1600px] mx-auto px-6">
          <button
            type="button"
            onClick={() => setAreSourcesOpen((open) => !open)}
            aria-expanded={areSourcesOpen}
            aria-controls="all-data-sources"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-app-muted hover:text-app-text"
          >
            {t('sources')}
            <span className="normal-case tracking-normal">
              — {areSourcesOpen ? t('sourcesHide') : t('sourcesShow')}
            </span>
            {areSourcesOpen ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
          </button>
          {areSourcesOpen && (
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
    </div>
  );
}
