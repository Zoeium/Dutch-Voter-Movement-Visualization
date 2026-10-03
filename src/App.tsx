import {useDeferredValue, useMemo, useState, useEffect, useLayoutEffect, useCallback, useRef} from 'react';
import {Users, Info, ArrowDownUp, CalendarRange, Sun, Moon, Languages, Share2, Download, Check, ChevronDown, ChevronUp} from 'lucide-react';
import AlluvialDiagram, {type SortMode} from '@/components/AlluvialDiagram';
import TurnoutDiagram from '@/components/TurnoutDiagram';
import ParliamentDiagram from '@/components/ParliamentDiagram';
import ElectionCompare from '@/components/ElectionCompare';
import CoalitionExplorer from '@/components/CoalitionExplorer';
import type {CoalitionData, ElectionYear, PartyInfo} from '@/types';
import {
  loadParties,
  loadElections,
  loadAllElections,
  loadDataSources,
  loadCoalitions,
  buildMultiElectionFlows,
  getElectionSeats,
  type DataSourceEntry,
} from '@/data/loader';
import {DualRangeSlider} from '@/components/shared';
import {sliceByIndexRange, toggleButtonClass} from '@/components/diagramUtils';
import {
  ThemeContext,
  LanguageContext,
  translations,
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

function loadAppData(): AppData {
  try {
    return {
      parties: loadParties(),
      allElections: loadElections(),
      allElectionsForTurnout: loadAllElections(),
      dataSources: loadDataSources(),
      coalitions: loadCoalitions(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load election data: ${message}`);
  }
}

const partyButtonClass = (selected: boolean): string =>
  `${selected ? 'ring-2 ring-offset-2 ring-offset-app-bg' : 'bg-app-btn text-app-btn-text hover:bg-app-btn-hover'} px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2`;

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

/** Parse initial state from URL search params. */
function getInitialStateFromUrl(allElections: ElectionYear[], comparisonElections: ElectionYear[]) {
  const params = new URLSearchParams(window.location.search);
  const electionYears = allElections.map((e) => e.year);
  const comparisonYears = comparisonElections.map((e) => e.year);

  const tab = (params.get('tab') as TabKey) || 'alluvial';
  const validTabs: TabKey[] = ['alluvial', 'turnout', 'parliament', 'compare', 'coalition'];

  const party = params.get('party');
  const theme = (params.get('theme') as Theme) || 'dark';
  const lang = (params.get('lang') as Language) || 'en';

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
    tab: validTabs.includes(tab) ? tab : 'alluvial' as TabKey,
    party: party || null,
    theme: (theme === 'light' || theme === 'dark') ? theme : 'dark' as Theme,
    lang: (lang === 'en' || lang === 'nl') ? lang : 'en' as Language,
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
  const {parties, allElections, allElectionsForTurnout, dataSources, coalitions} = useMemo(loadAppData, []);

  const initialState = useMemo(
    () => getInitialStateFromUrl(allElections, allElectionsForTurnout),
    [allElections, allElectionsForTurnout]
  );

  const [theme, setTheme] = useState<Theme>(initialState.theme);
  const [lang, setLang] = useState<Language>(initialState.lang);

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

  const t = useCallback((key: TranslationKey) => translations[lang][key], [lang]);

  const electionYears = useMemo(() => allElections.map((e) => e.year), [allElections]);

  const [activeTab, setActiveTab] = useState<TabKey>(initialState.tab);
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

  const electionLabels = elections.map((e) => e.year);
  const hasSelectableYears = electionYears.length > 0;

  const {nodes, links} = useMemo(() => {
    return buildMultiElectionFlows(elections, parties, selectedParty);
  }, [elections, parties, selectedParty]);

  const deferredTurnoutYearStart = useDeferredValue(turnoutYearStart);
  const deferredTurnoutYearEnd = useDeferredValue(turnoutYearEnd);

  const turnoutElections = useMemo(
    () => sliceByIndexRange(allElectionsForTurnout, deferredTurnoutYearStart, deferredTurnoutYearEnd),
    [allElectionsForTurnout, deferredTurnoutYearStart, deferredTurnoutYearEnd]
  );

  const availableParties = useMemo(() => getAvailableParties(elections, parties), [elections, parties]);

  const getSourceLabel = (source: DataSourceEntry) =>
    source.kind === 'totals'
      ? `${t('totals')} (${source.year})`
      : `${t('movements')} (${source.fromYear ?? source.year} → ${source.toYear ?? source.year})`;

  const urlState = useMemo(() => {
    const state: Record<string, string | number | boolean | null> = {
      tab: activeTab,
      theme,
      lang,
    };
    if (activeTab === 'alluvial') {
      state.ys = yearStart;
      state.ye = yearEnd;
      state.party = selectedParty;
      state.sort = sortMode;
    } else if (activeTab === 'turnout') {
      state.tys = turnoutYearStart;
      state.tye = turnoutYearEnd;
    } else if (activeTab === 'compare') {
      state.cmpA = compareYearA;
      state.cmpB = compareYearB;
    }
    return state;
  }, [activeTab, yearStart, yearEnd, selectedParty, sortMode, turnoutYearStart, turnoutYearEnd, compareYearA, compareYearB, theme, lang]);

  useEffect(() => {
    updateUrl(urlState);
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
    const svg = chartContainerRef.current?.querySelector('svg');
    if (!svg) return;
    const filename = `voterflow-${activeTab}-${Date.now()}.svg`;
    exportSvg(svg as SVGSVGElement, filename);
    setExportFeedback(true);
    setTimeout(() => setExportFeedback(false), 2000);
  }, [activeTab]);

  const handleExportData = useCallback(() => {
    const headers = ['Party', `Votes ${compareYearA}`, `Votes ${compareYearB}`, 'Vote change', `Share ${compareYearA}`, `Share ${compareYearB}`, 'Share change pp', `Seats ${compareYearA}`, `Seats ${compareYearB}`, 'Seat change'];
    const rows: (string | number)[][] = [];
    const elA = allElectionsForTurnout.find((e) => e.year === compareYearA);
    const elB = allElectionsForTurnout.find((e) => e.year === compareYearB);
    if (elA && elB && compareYearA !== compareYearB) {
      const votesA = elA.voteTotals.parties_votes ?? {};
      const votesB = elB.voteTotals.parties_votes ?? {};
      const totalA = elA.voteTotals.valid_votes || 1;
      const totalB = elB.voteTotals.valid_votes || 1;
      const seatsA = getElectionSeats(compareYearA, coalitions) ?? {};
      const seatsB = getElectionSeats(compareYearB, coalitions) ?? {};
      const allIds = new Set([...Object.keys(votesA), ...Object.keys(votesB)]);
      for (const pid of allIds) {
        const vA = votesA[pid] ?? 0;
        const vB = votesB[pid] ?? 0;
        if (vA === 0 && vB === 0) continue;
        rows.push([
          pid, vA, vB, vB - vA,
          ((vA / totalA) * 100).toFixed(1),
          ((vB / totalB) * 100).toFixed(1),
          (((vB / totalB) * 100) - ((vA / totalA) * 100)).toFixed(1),
          seatsA[pid] ?? 0,
          seatsB[pid] ?? 0,
          (seatsB[pid] ?? 0) - (seatsA[pid] ?? 0),
        ]);
      }
    }
    exportCsv(headers, rows, `voterflow-compare-${Date.now()}.csv`);
    setExportFeedback(true);
    setTimeout(() => setExportFeedback(false), 2000);
  }, [allElectionsForTurnout, coalitions, compareYearA, compareYearB]);

  const tabs: {key: TabKey; label: string}[] = [
    {key: 'alluvial', label: t('tabAlluvial')},
    {key: 'turnout', label: t('tabTurnout')},
    {key: 'parliament', label: t('tabParliament')},
    {key: 'compare', label: t('tabCompare')},
    {key: 'coalition', label: t('tabCoalition')},
  ];

  return (
    <ThemeContext.Provider value={{theme, toggleTheme}}>
      <LanguageContext.Provider value={{lang, t}}>
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
            <label className="flex items-center gap-1.5 px-2 rounded-lg text-sm font-medium bg-app-btn text-app-btn-text border border-app-border">
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(selectedParty === null)}`}
                >
                  {t('allParties')}
                </button>
                {availableParties.map((p) => {
                  const isSelected = selectedParty === p.party;
                  return (
                    <button
                      type="button"
                      key={p.party}
                      onClick={() => setSelectedParty(isSelected ? null : p.party)}
                      className={partyButtonClass(isSelected)}
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
                  {hasSelectableYears ? `${t('years')}: ${electionYears[yearStart]}–${electionYears[yearEnd]}` : t('yearsNone')}
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
                  selectedParty={selectedParty}
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
                {turnoutYears.length > 0 ? `${t('years')}: ${turnoutYears[turnoutYearStart]}–${turnoutYears[turnoutYearEnd]}` : t('yearsNone')}
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
      </LanguageContext.Provider>
    </ThemeContext.Provider>
  );
}
