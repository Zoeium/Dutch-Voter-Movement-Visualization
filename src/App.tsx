import {useDeferredValue, useMemo, useState, useEffect, useCallback} from 'react';
import {Users, Info, ArrowDownUp, CalendarRange, Sun, Moon, Languages} from 'lucide-react';
import AlluvialDiagram, {type SortMode} from '@/components/AlluvialDiagram';
import TurnoutDiagram from '@/components/TurnoutDiagram';
import ParliamentDiagram from '@/components/ParliamentDiagram';
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
  activeTab: 'alluvial' | 'turnout' | 'parliament',
  elections: ElectionYear[],
  turnoutElections: ElectionYear[],
  dataSources: DataSourceEntry[]
): DataSourceEntry[] {
  if (activeTab === 'alluvial') {
    const yearSet = new Set(elections.map((election) => election.year));
    return dataSources.filter((source) => yearSet.has(source.year));
  }

  if (activeTab === 'parliament') {
    return [];
  }

  const yearSet = new Set(turnoutElections.map((election) => election.year));
  return dataSources.filter((source) => source.kind === 'totals' && yearSet.has(source.year));
}

export default function App() {
  const {parties, allElections, allElectionsForTurnout, dataSources, coalitions} = useMemo(loadAppData, []);

  const [theme, setTheme] = useState<Theme>('dark');
  const [lang, setLang] = useState<Language>('en');

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

  const [activeTab, setActiveTab] = useState<'alluvial' | 'turnout' | 'parliament'>('alluvial');
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('votes');
  const [yearStart, setYearStart] = useState<number>(0);
  const [yearEnd, setYearEnd] = useState<number>(defaultYearEnd);

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

          {/* Theme & Language toggles */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-app-btn text-app-btn-text hover:bg-app-btn-hover"
              aria-label="Toggle language"
            >
              <Languages className="w-4 h-4"/>
              {lang === 'en' ? 'NL' : 'EN'}
            </button>
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
        <div className="mb-8 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('alluvial')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(activeTab === 'alluvial')}`}
          >
            {t('tabAlluvial')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('turnout')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(activeTab === 'turnout')}`}
          >
            {t('tabTurnout')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('parliament')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(activeTab === 'parliament')}`}
          >
            {t('tabParliament')}
          </button>
        </div>

        {/* Alluvial Tab */}
        {activeTab === 'alluvial' && (
          <>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-app-heading">{t('alluvialTitle')}</h2>
              <p className="text-app-muted max-w-2xl">
                {t('alluvialDescription')}
              </p>
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
                      style={
                        isSelected
                          ? {
                            backgroundColor: p.color,
                            color: '#fff',
                            boxShadow: `0 0 0 2px ${p.color}`,
                          }
                          : undefined
                      }
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
                  {hasSelectableYears
                    ? `${t('years')}: ${electionYears[yearStart]}–${electionYears[yearEnd]}`
                    : t('yearsNone')}
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
                <button
                  type="button"
                  onClick={() => setSortMode('votes')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(sortMode === 'votes')}`}
                >
                  {t('sortByVotes')}
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode('alphabetical')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(sortMode === 'alphabetical')}`}
                >
                  {t('sortAlphabetical')}
                </button>
              </div>
            </div>

            <div className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
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
              <p className="text-app-muted max-w-2xl">
                {t('turnoutDescription')}
              </p>
            </div>

            <div className="mb-6 flex items-center gap-3 flex-wrap">
              <CalendarRange className="w-4 h-4 text-app-muted"/>
              <span className="text-sm font-medium text-app-muted whitespace-nowrap">
                {turnoutYears.length > 0
                  ? `${t('years')}: ${turnoutYears[turnoutYearStart]}–${turnoutYears[turnoutYearEnd]}`
                  : t('yearsNone')}
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

            <div className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
              <TurnoutDiagram elections={turnoutElections}/>
            </div>
          </>
        )}

        {/* Parliament Tab */}
        {activeTab === 'parliament' && (
          <>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2 text-app-heading">{t('parliamentTitle')}</h2>
              <p className="text-app-muted max-w-2xl">
                {t('parliamentDescription')}
              </p>
            </div>

            <div className="bg-app-card rounded-2xl p-6 border border-app-border shadow-2xl">
              <ParliamentDiagram coalitions={coalitions} parties={parties}/>
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
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-app-link underline decoration-dotted underline-offset-4 hover:text-app-link-hover"
                  >
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
