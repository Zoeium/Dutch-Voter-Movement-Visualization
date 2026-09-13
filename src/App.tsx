import {useMemo, useState} from 'react';
import {Users, Info, ArrowDownUp, CalendarRange} from 'lucide-react';
import AlluvialDiagram, {type SortMode} from '@/components/AlluvialDiagram';
import TurnoutDiagram from '@/components/TurnoutDiagram';
import {
  loadParties,
  loadElections,
  loadAllElections,
  loadDataSources,
  buildMultiElectionFlows,
} from '@/data/loader';

const parties = loadParties();
const allElections = loadElections();
const allElectionsForTurnout = loadAllElections();
const dataSources = loadDataSources();

const electionYears = allElections.map((e) => e.year);
const defaultYearEnd = Math.max(0, electionYears.length - 1);

const toggleButtonClass = (active: boolean): string =>
  active
    ? 'bg-emerald-500 text-white'
    : 'bg-gray-800 text-gray-300 hover:bg-gray-700';

const partyButtonClass = (selected: boolean): string =>
  `${selected ? 'ring-2 ring-offset-2 ring-offset-gray-950' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'} px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2`;

const getSourceLabel = (source: { kind: 'totals' | 'movement'; year: string; fromYear?: string; toYear?: string }) =>
  source.kind === 'totals'
    ? `Totals (${source.year})`
    : `Movements (${source.fromYear ?? source.year} → ${source.toYear ?? source.year})`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'alluvial' | 'turnout'>('alluvial');
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('votes');
  const [yearStart, setYearStart] = useState<number>(0);
  const [yearEnd, setYearEnd] = useState<number>(defaultYearEnd);

  // Separate year range for turnout diagram
  const turnoutYears = allElectionsForTurnout.map((e) => e.year);
  const defaultTurnoutYearEnd = Math.max(0, turnoutYears.length - 1);
  const [turnoutYearStart, setTurnoutYearStart] = useState<number>(0);
  const [turnoutYearEnd, setTurnoutYearEnd] = useState<number>(defaultTurnoutYearEnd);

  const elections = useMemo(
    () => allElections.filter((_, i) => i >= yearStart && i <= yearEnd),
    [yearStart, yearEnd]
  );

  const electionLabels = elections.map((e) => e.year);
  const hasSelectableYears = electionYears.length > 0;

  const {nodes, links} = useMemo(() => {
    return buildMultiElectionFlows(elections, parties, selectedParty);
  }, [elections, selectedParty]);

  // For turnout, filter by turnout year range
  const turnoutElections = useMemo(
    () => allElectionsForTurnout.filter((_, i) => i >= turnoutYearStart && i <= turnoutYearEnd),
    [turnoutYearStart, turnoutYearEnd]
  );

  // Build party list for selector (only parties that appear in movement data).
  // If some parties are not present in movement data, collapse them into a single "other" block.
  const availableParties = useMemo(() => {
    const partySet = new Set<string>();
    for (const election of elections) {
      for (const movement of election.movements) {
        partySet.add(movement.party);
      }
    }

    const shown = parties
      .filter((p) => partySet.has(p.party))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));

    // Always include a single 'other' entry (if defined) so users can select it.
    const otherParty = parties.find((p) => p.party === 'other');
    if (otherParty && !shown.some((p) => p.party === 'other')) {
      return [...shown, otherParty];
    }

    return shown;
  }, [elections]);

  // Filter data sources based on active tab
  const filteredDataSources = useMemo(() => {
    if (activeTab === 'alluvial') {
      // For alluvial: show sources for years in the selected range (both totals and movements)
      const yearSet = new Set(elections.map(e => e.year));
      return dataSources.filter(source => yearSet.has(source.year));
    } else {
      // For turnout: show totals for all years in the turnout range, exclude movements
      const yearSet = new Set(turnoutElections.map(e => e.year));
      return dataSources.filter(source => source.kind === 'totals' && yearSet.has(source.year));
    }
  }, [activeTab, elections, turnoutElections]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Users className="w-5 h-5 text-white"/>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Voter Flow</h1>
              <p className="text-xs text-gray-400">Dutch election voter movement analysis</p>
            </div>
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
            Alluvial Diagram
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('turnout')}
            className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(activeTab === 'turnout')}`}
          >
            Turnout Overview
          </button>
        </div>

        {/* Alluvial Tab */}
        {activeTab === 'alluvial' && (
          <>
            {/* Intro */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2">How voters moved between parties</h2>
              <p className="text-gray-400 max-w-2xl">
                This alluvial diagram visualizes voter migration across Dutch parliamentary
                elections. Each flow shows where a party's voters came from — or where they went.
                Hover over a party block to highlight its flows, or filter to a single party.
              </p>
            </div>

            {/* Controls */}
        <div className="mb-6 flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          {/* Party filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-gray-400 whitespace-nowrap">Party filter:</span>
            <button
              type="button"
              onClick={() => setSelectedParty(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(selectedParty === null)}`}
            >
              All parties
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
          {/* Year range slider */}
          <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
            <CalendarRange className="w-4 h-4 text-gray-400"/>
            <span className="text-sm font-medium text-gray-400 whitespace-nowrap">
              {hasSelectableYears
                ? `Years: ${electionYears[yearStart]}–${electionYears[yearEnd]}`
                : 'Years: none available'}
            </span>
            {hasSelectableYears && (
              <div className="relative w-56 h-6 flex items-center">
                <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-700"/>
                <div
                  className="absolute h-1.5 rounded-full bg-emerald-500"
                  style={{
                    left: `${(yearStart / Math.max(1, electionYears.length - 1)) * 100}%`,
                    right: `${100 - (yearEnd / Math.max(1, electionYears.length - 1)) * 100}%`,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={electionYears.length - 1}
                  value={yearStart}
                  onChange={(e) => setYearStart(Math.min(Number(e.target.value), yearEnd))}
                  className="year-range-thumb absolute w-full appearance-none bg-transparent pointer-events-auto"
                  style={{zIndex: yearStart === yearEnd ? 4 : 3}}
                />
                <input
                  type="range"
                  min={0}
                  max={electionYears.length - 1}
                  value={yearEnd}
                  onChange={(e) => setYearEnd(Math.max(Number(e.target.value), yearStart))}
                  className="year-range-thumb absolute w-full appearance-none bg-transparent pointer-events-auto"
                  style={{zIndex: 4}}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <ArrowDownUp className="w-4 h-4 text-gray-400"/>
            <span className="text-sm font-medium text-gray-400 whitespace-nowrap">Sort:</span>
            <button
              type="button"
              onClick={() => setSortMode('votes')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(sortMode === 'votes')}`}
            >
              By votes
            </button>
            <button
              type="button"
              onClick={() => setSortMode('alphabetical')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(sortMode === 'alphabetical')}`}
            >
              Alphabetical
            </button>

          </div>
        </div>

            {/* Diagram */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-2xl">
              {nodes.length === 0 ? (
                <div className="flex items-center justify-center h-96 text-gray-500">
                  <div className="text-center">
                    <Info className="w-12 h-12 mx-auto mb-3 opacity-50"/>
                    <p>No flow data available for the selected filters.</p>
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
            {/* Intro */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2">Turnout & vote breakdown</h2>
              <p className="text-gray-400 max-w-2xl">
                Total electorate split into valid votes, blanco, invalid, and those who did not vote.
                Hover a bar for details.
              </p>
            </div>

            {/* Year range selector for turnout */}
            <div className="mb-6 flex items-center gap-3 flex-wrap">
              <CalendarRange className="w-4 h-4 text-gray-400"/>
              <span className="text-sm font-medium text-gray-400 whitespace-nowrap">
                {turnoutYears.length > 0
                  ? `Years: ${turnoutYears[turnoutYearStart]}–${turnoutYears[turnoutYearEnd]}`
                  : 'Years: none available'}
              </span>
              {turnoutYears.length > 0 && (
                <div className="relative w-56 h-6 flex items-center">
                  <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-700"/>
                  <div
                    className="absolute h-1.5 rounded-full bg-emerald-500"
                    style={{
                      left: `${(turnoutYearStart / Math.max(1, turnoutYears.length - 1)) * 100}%`,
                      right: `${100 - (turnoutYearEnd / Math.max(1, turnoutYears.length - 1)) * 100}%`,
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={turnoutYears.length - 1}
                    value={turnoutYearStart}
                    onChange={(e) => setTurnoutYearStart(Math.min(Number(e.target.value), turnoutYearEnd))}
                    className="year-range-thumb absolute w-full appearance-none bg-transparent pointer-events-auto"
                    style={{zIndex: turnoutYearStart === turnoutYearEnd ? 4 : 3}}
                  />
                  <input
                    type="range"
                    min={0}
                    max={turnoutYears.length - 1}
                    value={turnoutYearEnd}
                    onChange={(e) => setTurnoutYearEnd(Math.max(Number(e.target.value), turnoutYearStart))}
                    className="year-range-thumb absolute w-full appearance-none bg-transparent pointer-events-auto"
                    style={{zIndex: 4}}
                  />
                </div>
              )}
            </div>

            {/* Turnout Diagram */}
            <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 shadow-2xl">
              <TurnoutDiagram elections={turnoutElections}/>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-gray-800 mt-12 py-8">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-gray-400">
            Sources
          </div>
          <ul className="space-y-3 text-sm text-gray-500">
            {filteredDataSources.map((source) => (
              <li key={`${source.year}-${source.kind}-${source.name}`}
                  className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-gray-300 font-medium min-w-[170px]">{getSourceLabel(source)}</span>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 underline decoration-dotted underline-offset-4 hover:text-emerald-300"
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
  );
}
