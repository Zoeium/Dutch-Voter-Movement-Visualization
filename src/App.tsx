import {useDeferredValue, useMemo, useState, useEffect, useCallback, useRef} from 'react';
import {Users, Info, ArrowDownUp, CalendarRange, Sun, Moon, Languages, Share2, Download, Check} from 'lucide-react';
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

function getFilteredDataSources(
  activeTab: TabKey,
  elections: ElectionYear[],
  turnoutElections: ElectionYear[],
  dataSources: DataSourceEntry[]
): DataSourceEntry[] {
  if (activeTab === 'alluvial') {
    const yearSet = new Set(elections.map((election) => election.year));
    return dataSources.filter((source) => yearSet.has(source.year));
  }

  if (activeTab === 'parliament' || activeTab === 'coalition') {
    return [];
  }

  const yearSet = new Set(turnoutElections.map((election) => election.year));
  return dataSources.filter((source) => source.kind === 'totals' && yearSet.has(source.year));
}

/** Parse initial state from URL search params. */
function getInitialStateFromUrl(allElections: ElectionYear[]) {
  const params = new URLSearchParams(window.location.search);
  const electionYears = allElections.map((e) => e.year);

  const tab = (params.get('tab') as TabKey) || 'alluvial';
  const validTabs: TabKey[] = ['alluvial', 'turnout', 'parliament', 'compare', 'coalition'];

  const party = params.get('party');
  const theme = (params.get('theme') as Theme) || 'dark';
  const lang = (params.get('lang') as Language) || 'en';

  const yearStart = params.get('ys') !== null ? Math.max(0, Math.min(electionYears.length - 1, Number(params.get('ys')))) : 0;
  const yearEnd = params.get('ye') !== null ? Math.max(yearStart, Math.min(electionYears.length - 1, Number(params.get('ye')))) : Math.max(0, electionYears.length - 1);

  const sort = (params.get('sort') as SortMode) || 'votes';

  return {
    tab: validTabs.includes(tab) ? tab : 'alluvial' as TabKey,
    party: party || null,
    theme: (theme === 'light' || theme === 'dark') ? theme : 'dark' as Theme,
    lang: (lang === 'en' || lang === 'nl') ? lang : 'en' as Language,
    yearStart,
    yearEnd,
    sortMode: (sort === 'alphabetical' || sort === 'votes') ? sort : 'votes' as SortMode,
  };
}

export default function App() {
  const {parties, allElections, allElectionsForTurnout, dataSources, coalitions} = useMemo(loadAppData, []);

  const initialState = useMemo(() => getInitialStateFromUrl(allElections), [allElections]);

  const [theme, setTheme] = useState<Theme>(initialState.theme);
  const [lang, setLang] = useState<Language>(initialState.lang);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleLanguage = useCallback(() => {
    setLang((prev) => (prev === 'en' ? 'nl' : 'en'));
  }, []);

  const t = useCallback((key: TranslationKey) => translations[lang][key], [lang]);

  const electionYears = useMemo(() => allElections.map((e) => e.year), [allElections]);
  const defaultYearEnd = Math.max(0, electionYears.length - 1);

  const [activeTab, setActiveTab] = useState<TabKey>(initialState.tab);
  const [selectedParty, setSelectedParty] = useState<string | null>(initialState.party);
  const [sortMode, setSortMode] = useState<SortMode>(initialState.sortMode);
  const [yearStart, setYearStart] = useState<number>(initialState.yearStart);
  const [yearEnd, setYearEnd] = useState<number>(initialState.yearEnd);

  // Compare tab state
  const [compareYearA, setCompareYearA] = useState<string>(
    electionYears[Math.max(0, electionYears.length - 2)] ?? ''
  );
  const [compareYearB, setCompareYearB] = useState<string>(
    electionYears[electionYears.length - 1] ?? ''
  );

  const turnoutYears = useMemo(() => allElectionsForTurnout.map((e) => e.year), [allElectionsForTurnout]);
  const defaultTurnoutYearEnd = Math.max(0, turnoutYears.length - 1);
  const [turnoutYearStart, setTurnoutYearStart] = useState<number>(0);
  const [turnoutYearEnd, setTurnoutYearEnd] = useState<number>(defaultTurnoutYearEnd);

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

  const filteredDataSources = useMemo(
    () => getFilteredDataSources(activeTab, elections, turnoutElections, dataSources),
    [activeTab, elections, turnoutElections, dataSources]
  );

  const getSourceLabel = (source: DataSourceEntry) =>
    source.kind === 'totals'
      ? `${t('totals')} (${source.year})`
      : `${t('movements')} (${source.fromYear ?? source.year} → ${source.toYear ?? source.year})`;

  // URL sync
  useEffect(() => {
    updateUrl({
      tab: activeTab,
      ys: yearStart,
      ye: yearEnd,
      party: selectedParty,
      sort: sortMode,
      theme,
      lang,
    });
  }, [activeTab, yearStart, yearEnd, selectedParty, sortMode, theme, lang]);

  // Share & export state
  const [shareFeedback, setShareFeedback] = useState(false);
  const [exportFeedback, setExportFeedback] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const handleShare = useCallback(async () => {
    const state: Record<string, string | number | boolean | null> = {
      tab: activeTab,
      ys: yearStart,
      ye: yearEnd,
      party: selectedParty,
      sort: sortMode,
      theme,
      lang,
    };
    if (activeTab === 'compare') {
      state.cmpA = compareYearA;
      state.cmpB = compareYearB;
    }
    const success = await copyShareUrl(state);
    if (success) {
      setShareFeedback(true);
      setTimeout(() => setShareFeedback(false), 2000);
    }
  }, [activeTab, yearStart, yearEnd, selectedParty, sortMode, theme, lang, compareYearA, compareYearB]);

  const handleExportChart = useCallback(() => {
    const svg = chartContainerRef.current?.querySelector('svg');
    if (!svg) return;
    const filename = `voterflow-${activeTab}-${Date.now()}.svg`;
    exportSvg(svg as SVGSVGElement, filename);
    setExportFeedback(true);
    setTimeout(() => setExportFeedback(false), 2000);
  }, [activeTab]);

  const handleExportData = useCallback(() => {
    if (activeTab === 'alluvial') {
      const headers = ['Party', ...electionLabels.flatMap((y) => [`${y} value`, `${y} flows in`, `${y} flows out`])];
      const rows: (string | number)[][] = [];
      const partyIds = new Set<string>();
      for (const node of nodes) {
        const baseId = node.id.includes(':') ? node.id.split(':').slice(1).join(':') : node.id;
        partyIds.add(baseId);
      }
      for (const partyId of partyIds) {
        const row: (string | number)[] = [partyId];
        for (let col = 0; col < elections.length; col++) {
          const node = nodes.find((n) => n.id === `${col}:${partyId}`);
          const incoming = links.filter((l) => l.target === `${col}:${partyId}`).reduce((s, l) => s + l.value, 0);
          const outgoing = links.filter((l) => l.source === `${col}:${partyId}`).reduce((s, l) => s + l.value, 0);
          row.push(node?.value ?? 0, incoming, outgoing);
        }
        rows.push(row);
      }
      exportCsv(headers, rows, `voterflow-alluvial-${Date.now()}.csv`);
    } else if (activeTab === 'compare') {
      const headers = ['Party', `Votes ${compareYearA}`, `Votes ${compareYearB}`, 'Vote change', `Share ${compareYearA}`, `Share ${compareYearB}`, 'Share change pp', `Seats ${compareYearA}`, `Seats ${compareYearB}`, 'Seat change'];
      const rows: (string | number)[][] = [];
      const elA = elections.find((e) => e.year === compareYearA);
      const elB = elections.find((e) => e.year === compareYearB);
      if (elA && elB && compareYearA !== compareYearB) {
        const votesA = elA.voteTotals.parties_votes ?? {};
        const votesB = elB.voteTotals.parties_votes ?? {};
        const totalA = elA.voteTotals.valid_votes || 1;
        const totalB = elB.voteTotals.valid_votes || 1;
        const seatsA = coalitions.find((c) => c.year === compareYearA)?.seats ?? {};
        const seatsB = coalitions.find((c) => c.year === compareYearB)?.seats ?? {};
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
    } else if (activeTab === 'turnout') {
      const headers = ['Year', 'Electorate', 'Valid votes', 'Blanco', 'Invalid', 'Not voted', 'Turnout %'];
      const rows = turnoutElections.map((e) => {
        const vt = e.voteTotals;
        return [
          e.year, vt.electorate, vt.valid_votes, vt.blanco_votes,
          vt.non_valid_votes, vt.not_voted,
          vt.electorate > 0 ? ((vt.total_votes / vt.electorate) * 100).toFixed(1) : '0',
        ];
      });
      exportCsv(headers, rows, `voterflow-turnout-${Date.now()}.csv`);
    } else if (activeTab === 'coalition') {
      const headers = ['Party', 'Seats', 'In selected coalition'];
      const latestYear = coalitions.length > 0 ? coalitions[coalitions.length - 1].year : '';
      const coalition = coalitions.find((c) => c.year === latestYear);
      if (coalition) {
        const rows = Object.entries(coalition.seats)
          .filter(([, s]) => s > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([pid, seats]) => [pid, seats, coalition.coalition.includes(pid) ? 'yes' : 'no']);
        exportCsv(headers, rows, `voterflow-coalition-${Date.now()}.csv`);
      }
    }
    setExportFeedback(true);
    setTimeout(() => setExportFeedback(false), 2000);
  }, [activeTab, elections, electionLabels, nodes, links, turnoutElections, coalitions, compareYearA, compareYearB]);

  const tabs: {key: TabKey; label: string}[] = [
    {key: 'alluvial', label: t('tabAlluvial')},
    {key: 'turnout', label: t('tabTurnout')},
    {key: 'parliament', label: t('tabParliament')},
    {key: 'compare', label: t('tabCompare')},
    {key: 'coalition', label: t('tabCoalition')},
  ];

  const canExportChart = activeTab === 'alluvial' || activeTab === 'turnout' || activeTab === 'parliament';

  return (
    <ThemeContext.Provider value={{theme, toggleTheme}}>
      <LanguageContext.Provider value={{lang, toggleLanguage, t}}>
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
              <p className="text-xs text-app-muted">{t('appSubtitle')}</p>
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
                onClick={handleExportData}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-app-btn text-app-btn-text hover:bg-app-btn-hover"
                aria-label={t('export')}
              >
                {exportFeedback ? <Check className="w-4 h-4 text-emerald-500"/> : <Download className="w-4 h-4"/>}
                {exportFeedback ? t('exportDone') : t('export')}
              </button>
            </div>

            {/* Language toggle */}
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-app-btn text-app-btn-text hover:bg-app-btn-hover"
              aria-label="Toggle language"
            >
              <Languages className="w-4 h-4"/>
              {lang === 'en' ? 'NL' : 'EN'}
            </button>

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

            {canExportChart && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleExportChart}
                  className="text-xs font-medium text-app-link hover:text-app-link-hover underline decoration-dotted underline-offset-4"
                >
                  {t('exportChart')}
                </button>
              </div>
            )}
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

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={handleExportChart} className="text-xs font-medium text-app-link hover:text-app-link-hover underline decoration-dotted underline-offset-4">
                {t('exportChart')}
              </button>
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

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={handleExportChart} className="text-xs font-medium text-app-link hover:text-app-link-hover underline decoration-dotted underline-offset-4">
                {t('exportChart')}
              </button>
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
                elections={allElections}
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

            <div className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
              <CoalitionExplorer coalitions={coalitions} parties={parties}/>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-app-border mt-12 py-8">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-app-muted">
            {t('sources')}
          </div>
          <ul className="space-y-3 text-sm text-app-subtle">
            {filteredDataSources.map((source) => (
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
        </div>
      </footer>
    </div>
      </LanguageContext.Provider>
    </ThemeContext.Provider>
  );
}
