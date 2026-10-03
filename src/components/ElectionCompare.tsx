import {useMemo, useState} from 'react';
import {ArrowUp, ArrowDown, ArrowDownUp, ChevronDown, Minus} from 'lucide-react';
import type {CoalitionData, ElectionYear, PartyInfo} from '@/types';
import {getElectionSeats, getPartyColor, getPartyDisplayName} from '@/data/loader';
import {useI18n} from '@/theme';

interface ElectionCompareProps {
  elections: ElectionYear[];
  coalitions: CoalitionData[];
  parties: PartyInfo[];
  yearA: string;
  yearB: string;
  onYearAChange: (year: string) => void;
  onYearBChange: (year: string) => void;
}

interface PartyRow {
  partyId: string;
  label: string;
  color: string;
  votesA: number;
  votesB: number;
  voteChange: number;
  shareA: number;
  shareB: number;
  shareChange: number;
  seatsA: number | null;
  seatsB: number | null;
  seatChange: number | null;
}

type SortKey = 'label' | 'votesA' | 'votesB' | 'voteChange' | 'shareA' | 'shareB' | 'shareChange' | 'seatsA' | 'seatsB' | 'seatChange';

function formatSigned(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('en-US')}`;
}

function formatSignedPP(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}pp`;
}

function ChangeIcon({value}: Readonly<{ value: number }>) {
  if (value > 0) return <ArrowUp className="w-3.5 h-3.5 text-emerald-500"/>;
  if (value < 0) return <ArrowDown className="w-3.5 h-3.5 text-red-500"/>;
  return <Minus className="w-3.5 h-3.5 text-app-subtle"/>;
}

export default function ElectionCompare({elections, coalitions, parties, yearA, yearB, onYearAChange, onYearBChange}: Readonly<ElectionCompareProps>) {
  const {t} = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>('voteChange');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const years = elections.map((e) => e.year);

  const rows: PartyRow[] = useMemo(() => {
    const elA = elections.find((e) => e.year === yearA);
    const elB = elections.find((e) => e.year === yearB);
    if (!elA || !elB) return [];

    const votesA = elA.voteTotals.parties_votes ?? {};
    const votesB = elB.voteTotals.parties_votes ?? {};
    const totalValidA = elA.voteTotals.valid_votes || 1;
    const totalValidB = elB.voteTotals.valid_votes || 1;

    const seatsA = getElectionSeats(yearA, coalitions);
    const seatsB = getElectionSeats(yearB, coalitions);

    const allPartyIds = new Set<string>([...Object.keys(votesA), ...Object.keys(votesB)]);

    const rowsArr: PartyRow[] = [];

    for (const partyId of allPartyIds) {
      const vA = votesA[partyId] ?? 0;
      const vB = votesB[partyId] ?? 0;
      if (vA === 0 && vB === 0) continue;

      const sA = seatsA?.[partyId] ?? null;
      const sB = seatsB?.[partyId] ?? null;

      const shareA = (vA / totalValidA) * 100;
      const shareB = (vB / totalValidB) * 100;

      rowsArr.push({
        partyId,
        label: getPartyDisplayName(partyId, parties),
        color: getPartyColor(partyId, parties),
        votesA: vA,
        votesB: vB,
        voteChange: vB - vA,
        shareA,
        shareB,
        shareChange: shareB - shareA,
        seatsA: sA,
        seatsB: sB,
        seatChange: sA !== null && sB !== null ? sB - sA : null,
      });
    }

    return rowsArr;
  }, [elections, coalitions, parties, yearA, yearB]);

  const isSameYear = yearA === yearB;

  const totalValidA = elections.find((e) => e.year === yearA)?.voteTotals.valid_votes ?? 0;
  const totalValidB = elections.find((e) => e.year === yearB)?.voteTotals.valid_votes ?? 0;

  const biggestGainers = useMemo(() => [...rows].sort((a, b) => b.shareChange - a.shareChange).slice(0, 3), [rows]);
  const biggestLosers = useMemo(() => [...rows].sort((a, b) => a.shareChange - b.shareChange).slice(0, 3), [rows]);
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const left = a[sortKey];
    const right = b[sortKey];
    if (left === null || right === null) {
      if (left !== right) return left === null ? 1 : -1;
    }
    const comparison = typeof left === 'string' && typeof right === 'string'
      ? left.localeCompare(right)
      : Number(left) - Number(right);
    const direction = sortDirection === 'asc' ? 1 : -1;
    return comparison === 0
      ? a.partyId.localeCompare(b.partyId) * direction
      : comparison * direction;
  }), [rows, sortKey, sortDirection]);

  const requestSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection('desc');
  };

  const selectClass = 'app-select';
  const headers: {key: SortKey; label: string; align: 'left' | 'right'}[] = [
    {key: 'label', label: t('compareParty'), align: 'left'},
    {key: 'votesA', label: `${t('compareVotes')} (${yearA})`, align: 'right'},
    {key: 'votesB', label: `${t('compareVotes')} (${yearB})`, align: 'right'},
    {key: 'voteChange', label: t('compareVoteChange'), align: 'right'},
    {key: 'shareA', label: `${t('compareVoteShare')} (${yearA})`, align: 'right'},
    {key: 'shareB', label: `${t('compareVoteShare')} (${yearB})`, align: 'right'},
    {key: 'shareChange', label: t('compareShareChange'), align: 'right'},
    {key: 'seatsA', label: `${t('compareSeats')} (${yearA})`, align: 'right'},
    {key: 'seatsB', label: `${t('compareSeats')} (${yearB})`, align: 'right'},
    {key: 'seatChange', label: t('compareSeatChange'), align: 'right'},
  ];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-app-muted whitespace-nowrap">{t('compareElectionYear')}</label>
          <span className="relative">
            <select value={yearA} onChange={(e) => onYearAChange(e.target.value)} className={selectClass}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown className="app-select-chevron w-4 h-4"/>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-app-muted whitespace-nowrap">{t('compareElectionYear')}</label>
          <span className="relative">
            <select value={yearB} onChange={(e) => onYearBChange(e.target.value)} className={selectClass}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown className="app-select-chevron w-4 h-4"/>
          </span>
        </div>
      </div>

      {isSameYear ? (
        <div className="flex items-center justify-center h-48 text-app-muted">
          <p>{t('compareSameElection')}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-app-muted">
          <p>{t('compareSelectTwo')}</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            {biggestGainers.length > 0 && (
              <div className="bg-app-card rounded-xl p-4 border border-app-border">
                <h4 className="text-sm font-semibold text-app-heading mb-3">{t('compareGainers')}</h4>
                <div className="space-y-2">
                  {biggestGainers.map((r) => (
                    <div key={`g-${r.partyId}`} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{backgroundColor: r.color}}/>
                        <span className="text-app-text">{r.label}</span>
                      </div>
                      <span className="font-semibold text-emerald-500">{formatSignedPP(r.shareChange)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {biggestLosers.length > 0 && (
              <div className="bg-app-card rounded-xl p-4 border border-app-border">
                <h4 className="text-sm font-semibold text-app-heading mb-3">{t('compareLosers')}</h4>
                <div className="space-y-2">
                  {biggestLosers.map((r) => (
                    <div key={`l-${r.partyId}`} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{backgroundColor: r.color}}/>
                        <span className="text-app-text">{r.label}</span>
                      </div>
                      <span className="font-semibold text-red-500">{formatSignedPP(r.shareChange)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app-border">
                  {headers.map(({key, label, align}) => (
                    <th
                      key={key}
                      className={`py-3 px-3 font-semibold text-app-heading ${align === 'left' ? 'text-left' : 'text-right'}`}
                      aria-sort={sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <button
                        type="button"
                        onClick={() => requestSort(key)}
                        className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}
                      >
                        {label}
                        {sortKey === key
                          ? sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5"/> : <ArrowDown className="w-3.5 h-3.5"/>
                          : <ArrowDownUp className="w-3.5 h-3.5 opacity-40"/>}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-app-border text-app-muted">
                  <td className="py-2 px-3 italic">{t('compareTotalVotes')}</td>
                  <td className="text-right py-2 px-3">{totalValidA.toLocaleString('en-US')}</td>
                  <td className="text-right py-2 px-3">{totalValidB.toLocaleString('en-US')}</td>
                  <td className="text-right py-2 px-3">{formatSigned(totalValidB - totalValidA)}</td>
                  <td className="text-right py-2 px-3">100.0%</td>
                  <td className="text-right py-2 px-3">100.0%</td>
                  <td className="text-right py-2 px-3">—</td>
                  <td className="text-right py-2 px-3">{rows.reduce((s, r) => s + (r.seatsA ?? 0), 0) || '—'}</td>
                  <td className="text-right py-2 px-3">{rows.reduce((s, r) => s + (r.seatsB ?? 0), 0) || '—'}</td>
                  <td className="text-right py-2 px-3">—</td>
                </tr>
                {sortedRows.map((row) => (
                  <tr key={row.partyId} className="border-b border-app-border hover:bg-app-btn transition-colors">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{backgroundColor: row.color}}/>
                        <span className="text-app-text font-medium">{row.label}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-3 text-app-muted">{row.votesA.toLocaleString('en-US')}</td>
                    <td className="text-right py-2 px-3 text-app-muted">{row.votesB.toLocaleString('en-US')}</td>
                    <td className="text-right py-2 px-3">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <ChangeIcon value={row.voteChange}/>
                        <span className={row.voteChange > 0 ? 'text-emerald-500' : row.voteChange < 0 ? 'text-red-500' : 'text-app-subtle'}>
                          {formatSigned(row.voteChange)}
                        </span>
                      </span>
                    </td>
                    <td className="text-right py-2 px-3 text-app-muted">{row.shareA.toFixed(1)}%</td>
                    <td className="text-right py-2 px-3 text-app-muted">{row.shareB.toFixed(1)}%</td>
                    <td className="text-right py-2 px-3">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <ChangeIcon value={row.shareChange}/>
                        <span className={row.shareChange > 0 ? 'text-emerald-500' : row.shareChange < 0 ? 'text-red-500' : 'text-app-subtle'}>
                          {formatSignedPP(row.shareChange)}
                        </span>
                      </span>
                    </td>
                    <td className="text-right py-2 px-3 text-app-muted">{row.seatsA ?? '—'}</td>
                    <td className="text-right py-2 px-3 text-app-muted">{row.seatsB ?? '—'}</td>
                    <td className="text-right py-2 px-3">
                      {row.seatChange !== null ? (
                        <span className="inline-flex items-center gap-1 font-medium">
                          <ChangeIcon value={row.seatChange}/>
                          <span className={row.seatChange > 0 ? 'text-emerald-500' : row.seatChange < 0 ? 'text-red-500' : 'text-app-subtle'}>
                            {formatSigned(row.seatChange)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-app-subtle">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
