import { useMemo, useState } from 'react';
import { Users, Info, ArrowDownUp, CalendarRange } from 'lucide-react';
import AlluvialDiagram, { type SortMode } from '@/components/AlluvialDiagram';
import {
  loadParties,
  loadElections,
  loadDataSources,
  buildMultiElectionFlows,
} from '@/data/loader';

const parties = loadParties();
const allElections = loadElections();
const dataSources = loadDataSources();

const electionYears = allElections.map((e) => e.year);

export default function App() {
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(1);
  const [sortMode, setSortMode] = useState<SortMode>('votes');
  const [yearStart, setYearStart] = useState<number>(0);
  const [yearEnd, setYearEnd] = useState<number>(electionYears.length - 1);

  const elections = useMemo(
    () => allElections.filter((_, i) => i >= yearStart && i <= yearEnd),
    [yearStart, yearEnd]
  );

  const electionLabels = elections.map((e) => e.year);

  const { nodes, links } = useMemo(() => {
    return buildMultiElectionFlows(elections, parties, selectedParty, threshold);
  }, [elections, selectedParty, threshold]);

  // Build party list for selector (only parties that appear in movement data)
  const availableParties = useMemo(() => {
    const partySet = new Set<string>();
    for (const election of elections) {
      for (const movement of election.movements) {
        partySet.add(movement.party);
      }
    }
    return parties
      .filter((p) => partySet.has(p.party))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [elections]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Voter Flow</h1>
              <p className="text-xs text-gray-400">Dutch election voter movement analysis</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8">
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
            <button type={"button"}
              onClick={() => setSelectedParty(null)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedParty === null
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              All parties
            </button>
            {availableParties.map((p) => (
              <button type={"button"}
                key={p.party}
                onClick={() =>
                  setSelectedParty(selectedParty === p.party ? null : p.party)
                }
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  selectedParty === p.party
                    ? 'ring-2 ring-offset-2 ring-offset-gray-950'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                style={
                  selectedParty === p.party
                    ? {
                        backgroundColor: p.color,
                        color: '#fff',
                        boxShadow: `0 0 0 2px ${p.color}`,
                      }
                    : undefined
                }
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                {p.display_name}
              </button>
            ))}
          </div>
        </div>

        {/* Threshold slider */}
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-400 whitespace-nowrap">
            Min flow: {threshold}%
          </span>
          <input
            type="range"
            min={0}
            max={10}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-48 accent-emerald-500"
          />
          <span className="text-xs text-gray-500">
            Hide flows below this percentage of a party's voters
          </span>

          {/* Year range slider */}
          <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
            <CalendarRange className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-400 whitespace-nowrap">
              Years: {electionYears[yearStart]}–{electionYears[yearEnd]}
            </span>
            <div className="flex items-center gap-2">
              <select
                value={yearStart}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setYearStart(Math.min(v, yearEnd));
                }}
                className="bg-gray-800 text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {electionYears.map((y, i) => (
                  <option key={y} value={i}>{y}</option>
                ))}
              </select>
              <span className="text-gray-500 text-sm">to</span>
              <select
                value={yearEnd}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setYearEnd(Math.max(v, yearStart));
                }}
                className="bg-gray-800 text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {electionYears.map((y, i) => (
                  <option key={y} value={i}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <ArrowDownUp className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-400 whitespace-nowrap">Sort:</span>
            <button type={"button"}
              onClick={() => setSortMode('votes')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortMode === 'votes'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              By votes
            </button>
            <button type={"button"}
              onClick={() => setSortMode('alphabetical')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sortMode === 'alphabetical'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
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
                <Info className="w-12 h-12 mx-auto mb-3 opacity-50" />
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
      </main>

      <footer className="border-t border-gray-800 mt-12 py-8">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-gray-400">
            Sources
          </div>
          <ul className="space-y-3 text-sm text-gray-500">
            {dataSources.map((source) => {
              const label = source.kind === 'totals'
                ? `Totals (${source.year})`
                : `Movements (${source.fromYear ?? source.year} → ${source.toYear ?? source.year})`;

              return (
                <li key={`${source.year}-${source.kind}-${source.name}`} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-gray-300 font-medium min-w-[170px]">{label}</span>
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
              );
            })}
          </ul>
        </div>
      </footer>
    </div>
  );
}
