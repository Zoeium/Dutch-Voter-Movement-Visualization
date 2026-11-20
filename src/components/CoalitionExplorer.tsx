import {useMemo, useState} from 'react';
import {Check, ChevronDown, X, Users} from 'lucide-react';
import type {CoalitionData, PartyInfo} from '@/types';
import {getCoalitionForElection, getPartyColor, getPartyDisplayName} from '@/data/loader';
import {useI18n} from '@/theme';
import {formatElectionLabel, partyButtonClass} from '@/components/diagramUtils';
import {createChamberLayout, type PartySeat} from '@/components/chamberLayout';
import {EmptyState} from '@/components/shared';

/** The election explored and the parties chosen for a coalition. */
export interface CoalitionSelection {
  year: string;
  parties: string[];
}

interface CoalitionExplorerProps {
  coalitions: CoalitionData[];
  parties: PartyInfo[];
  /** The election and parties to start with; the latest election and no parties when left out. */
  selection?: CoalitionSelection;
  /** Called when the visitor picks another election or party, so it is kept and shared. */
  onSelectionChange?: (selection: CoalitionSelection) => void;
}

export default function CoalitionExplorer({coalitions, parties, selection, onSelectionChange}: Readonly<CoalitionExplorerProps>) {
  const {lang, t} = useI18n();

  const yearsWithSeats = useMemo(
    () => Array.from(new Set(coalitions.flatMap((c) => c.electionYear ?? []))).sort((a, b) => b.localeCompare(a)),
    [coalitions]
  );

  // An election from a shared link only counts when it has seat data.
  const initialYear = selection && yearsWithSeats.includes(selection.year) ? selection.year : yearsWithSeats[0] ?? '';
  const [selectedYear, setSelectedYear] = useState<string>(initialYear);
  const [selectedParties, setSelectedParties] = useState<Set<string>>(
    new Set(initialYear === selection?.year ? selection.parties : [])
  );
  const select = (year: string, chosen: Set<string>) => {
    setSelectedYear(year);
    setSelectedParties(chosen);
    onSelectionChange?.({year, parties: [...chosen]});
  };

  const coalitionForYear = useMemo(
    () => getCoalitionForElection(selectedYear, coalitions),
    [coalitions, selectedYear]
  );

  const allPartiesWithSeats: PartySeat[] = useMemo(() => {
    if (!coalitionForYear) return [];

    const seatEntries = Object.entries(coalitionForYear.seats)
      .filter(([, seats]) => seats > 0)
      .sort((a, b) => b[1] - a[1]);

    return seatEntries.map(([partyId, seats]) => ({
      partyId,
      label: getPartyDisplayName(partyId, parties),
      color: getPartyColor(partyId, parties),
      seats,
    }));
  }, [coalitionForYear, parties]);

  // Seats of a group of parties in the selected election.
  const seatsOf = (partyIds: Iterable<string>): number => {
    let total = 0;
    for (const partyId of partyIds) total += coalitionForYear?.seats[partyId] ?? 0;
    return total;
  };

  const totalSeats = seatsOf(allPartiesWithSeats.map((p) => p.partyId));
  const majority = Math.floor(totalSeats / 2) + 1;
  const selectedTotal = seatsOf(selectedParties);

  const actualCoalitionParties = coalitionForYear?.coalition ?? [];
  const actualSupportParties = coalitionForYear?.support ?? [];
  const actualTotal = seatsOf(actualCoalitionParties);
  const supportSeats = seatsOf(actualSupportParties);

  const hasReachedMajority = selectedTotal >= majority;
  const surplus = Math.max(0, selectedTotal - majority);
  const shortfall = Math.max(0, majority - selectedTotal);
  const chamberLayout = useMemo(
    () => createChamberLayout(allPartiesWithSeats, selectedParties),
    [allPartiesWithSeats, selectedParties]
  );

  const handleYearChange = (year: string) => select(year, new Set());

  const toggleParty = (partyId: string) => {
    const next = new Set(selectedParties);
    if (next.has(partyId)) next.delete(partyId);
    else next.add(partyId);
    select(selectedYear, next);
  };

  const selectActualCoalition = () => {
    if (!coalitionForYear) return;
    select(selectedYear, new Set(coalitionForYear.coalition));
  };

  const selectClass = 'app-select';

  if (yearsWithSeats.length === 0) return <EmptyState message={t('coalitionNoSeatData')}/>;

  return (
    <div className="space-y-6">
      {/* Election selector */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-app-muted whitespace-nowrap">{t('coalitionSelectElection')}</label>
        <span className="relative">
          <select value={selectedYear} onChange={(e) => handleYearChange(e.target.value)} className={selectClass}>
            {yearsWithSeats.map((y) => <option key={y} value={y}>{formatElectionLabel(y, lang)}</option>)}
          </select>
          <ChevronDown className="app-select-chevron w-4 h-4"/>
        </span>
      </div>

      {/* Majority meter */}
      <div className="bg-app-card rounded-xl p-5 border border-app-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-500"/>
            <span className="text-lg font-bold text-app-heading">{t('coalitionTotalSeats')}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-app-heading">{selectedTotal}</span>
            <span className="text-sm text-app-muted">/ {majority} {t('coalitionSeatsLabel')}</span>
          </div>
        </div>

        <svg
          data-export-chart
          viewBox="0 0 600 330"
          role="img"
          aria-label={t('chamberSummary').replace('{selected}', String(selectedTotal)).replace('{total}', String(totalSeats)).replace('{majority}', String(majority))}
          className="mx-auto block w-full max-w-3xl"
        >
          <path
            d={`M ${300 - chamberLayout.borderRadius} 294 A ${chamberLayout.borderRadius} ${chamberLayout.borderRadius} 0 0 1 ${300 + chamberLayout.borderRadius} 294`}
            fill="none"
            stroke="var(--c-border)"
            strokeWidth="2"
          />
          {chamberLayout.seats.map((seat, index) => (
            <circle
                key={`${seat.partyId}-${index}`}
                cx={seat.x}
                cy={seat.y}
                r={chamberLayout.seatRadius}
                fill={seat.selected ? seat.color : 'var(--c-bg-card)'}
                stroke={seat.selected ? seat.color : 'var(--c-border-strong)'}
                strokeWidth="1"
              >
              <title>{seat.selected ? `${seat.label} (${t('coalitionSeatSelected')})` : seat.label}</title>
            </circle>
          ))}
          <text x="300" y="250" textAnchor="middle" fill="var(--c-text-heading)" fontSize="30" fontWeight="700">
            {selectedTotal} / {majority}
          </text>
          <text x="300" y="273" textAnchor="middle" fill="var(--c-text-muted)" fontSize="13">
            {t('coalitionSeatsLabel')}
          </text>
        </svg>

        {/* Status */}
        <div className="mt-3 flex items-center gap-2">
          {hasReachedMajority ? (
            <>
              <Check className="w-5 h-5 text-emerald-500"/>
              <span className="font-semibold text-emerald-500">{t('coalitionReached')}</span>
              <span className="text-app-muted">({t('coalitionSurplus')}: {surplus})</span>
            </>
          ) : (
            <>
              <X className="w-5 h-5 text-amber-500"/>
              <span className="font-semibold text-amber-500">{t('coalitionNotReached')}</span>
              <span className="text-app-muted">({t('coalitionShortfall')}: {shortfall})</span>
            </>
          )}
        </div>
      </div>

      {/* Actual coalition comparison */}
      {actualCoalitionParties.length > 0 && (
        <div className="bg-app-card rounded-xl p-4 border border-app-border">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-app-heading">{t('coalitionActual')}: {coalitionForYear?.name}</h4>
            <button
              type="button"
              onClick={selectActualCoalition}
              className="text-xs font-medium text-app-link hover:text-app-link-hover underline decoration-dotted underline-offset-4"
            >
              {t('coalitionSelectParties')}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {actualCoalitionParties.map((partyId) => {
              const seats = coalitionForYear?.seats[partyId] ?? 0;
              const color = getPartyColor(partyId, parties);
              return (
                <span
                  key={partyId}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{backgroundColor: color + '33', color}}
                >
                  {getPartyDisplayName(partyId, parties)} ({seats})
                </span>
              );
            })}
            {actualSupportParties.length > 0 && (
              <span className="text-app-muted text-xs">
                + {actualSupportParties.map((p) => getPartyDisplayName(p, parties)).join(', ')}
              </span>
            )}
            <span className="text-app-muted ml-2">
              {actualTotal}{actualSupportParties.length > 0 ? ` (+${supportSeats})` : ''} {t('coalitionSeatsLabel')}
            </span>
          </div>
        </div>
      )}

      {/* Party selector */}
      <div>
        <h4 className="text-sm font-semibold text-app-heading mb-3">{t('coalitionSelectParties')}</h4>
        <div className="flex flex-wrap gap-2">
          {allPartiesWithSeats.map((p) => {
            const isSelected = selectedParties.has(p.partyId);
            return (
              <button
                type="button"
                key={p.partyId}
                onClick={() => toggleParty(p.partyId)}
                className={partyButtonClass(isSelected, 'ring-offset-app-card')}
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
                {p.label}
                <span className="opacity-75">({p.seats})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected parties breakdown */}
      {selectedParties.size > 0 && (
        <div className="bg-app-card rounded-xl p-4 border border-app-border">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-app-heading">
              {selectedParties.size} {t('coalitionSelectParties').toLowerCase()}
            </h4>
            <button
              type="button"
              onClick={() => select(selectedYear, new Set())}
              className="text-xs font-medium text-app-muted hover:text-app-text transition-colors"
            >
              {t('coalitionClear')}
            </button>
          </div>
          <div className="space-y-2">
            {allPartiesWithSeats
              .filter((p) => selectedParties.has(p.partyId))
              .map((p) => (
                <div key={p.partyId} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{backgroundColor: p.color}}/>
                    <span className="text-app-text">{p.label}</span>
                  </div>
                  <span className="text-app-muted font-medium">{p.seats} {t('coalitionSeatsLabel')}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
