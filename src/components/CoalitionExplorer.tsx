import {useMemo, useState} from 'react';
import {Check, ChevronDown, X, Users} from 'lucide-react';
import type {CoalitionData, PartyInfo} from '@/types';
import {getPartyColor, getPartyDisplayName} from '@/data/loader';
import {useI18n} from '@/theme';

interface CoalitionExplorerProps {
  coalitions: CoalitionData[];
  parties: PartyInfo[];
}

interface PartySeat {
  partyId: string;
  label: string;
  color: string;
  seats: number;
}

interface ChamberSeat {
  partyId: string;
  label: string;
  color: string;
  selected: boolean;
  x: number;
  y: number;
  row: number;
}

interface ChamberLayout {
  seats: ChamberSeat[];
  borderRadius: number;
}

function createChamberLayout(parties: PartySeat[], selectedParties: Set<string>): ChamberLayout {
  const rowCapacities: number[] = [];
  for (let capacity = 10; capacity <= 26; capacity += 2) {
    rowCapacities.push(capacity);
  }

  const positions: {x: number; y: number; row: number}[] = [];
  const selectedSeats = parties.filter((party) => selectedParties.has(party.partyId)).flatMap((party) =>
    Array.from({length: party.seats}, () => ({
      partyId: party.partyId,
      label: party.label,
      color: party.color,
      selected: true,
    }))
  );
  const emptySeats = parties.filter((party) => !selectedParties.has(party.partyId)).flatMap((party) =>
    Array.from({length: party.seats}, () => ({
      partyId: party.partyId,
      label: party.label,
      color: party.color,
      selected: false,
    }))
  );
  const partySeats = [...selectedSeats, ...emptySeats];
  let positionIndex = 0;
  let outerRadius = 0;

  for (let row = 0; row < rowCapacities.length && positionIndex < partySeats.length; row++) {
    const rowCount = Math.min(rowCapacities[row], partySeats.length - positionIndex);
    const radius = 76 + row * 21;
    outerRadius = radius;
    for (let position = 0; position < rowCount; position++) {
      const angle = Math.PI - (Math.PI * position) / Math.max(rowCount - 1, 1);
      positions.push({
        x: 300 + radius * Math.cos(angle),
        y: 294 - radius * Math.sin(angle),
        row,
      });
      positionIndex++;
    }
  }

  // Assign selected seats by horizontal position, so the chamber fills left to right.
  positions.sort((a, b) => a.x - b.x || b.y - a.y || a.row - b.row);
  const seats = positions.map((position, index) => ({
    ...partySeats[index],
    ...position,
  }));

  return {seats, borderRadius: Math.min(255, outerRadius + 32)};
}

export default function CoalitionExplorer({coalitions, parties}: Readonly<CoalitionExplorerProps>) {
  const {t} = useI18n();

  const yearsWithSeats = useMemo(() => {
    const seen = new Set<string>();
    return coalitions
      .map((c) => c.year)
      .filter((y) => {
        if (seen.has(y)) return false;
        seen.add(y);
        return true;
      })
      .sort((a, b) => b.localeCompare(a));
  }, [coalitions]);

  const [selectedYear, setSelectedYear] = useState<string>(yearsWithSeats[0] ?? '');
  const [selectedParties, setSelectedParties] = useState<Set<string>>(new Set());

  const coalitionForYear = useMemo(
    () => coalitions.find((c) => c.year === selectedYear),
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

  const totalSeats = useMemo(
    () => allPartiesWithSeats.reduce((sum, p) => sum + p.seats, 0),
    [allPartiesWithSeats]
  );
  const majority = Math.floor(totalSeats / 2) + 1;

  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const p of allPartiesWithSeats) {
      if (selectedParties.has(p.partyId)) {
        total += p.seats;
      }
    }
    return total;
  }, [allPartiesWithSeats, selectedParties]);

  const actualCoalitionParties = coalitionForYear?.coalition ?? [];
  const actualSupportParties = coalitionForYear?.support ?? [];
  const actualTotal = actualCoalitionParties.reduce((sum, partyId) => {
    const seats = coalitionForYear?.seats[partyId] ?? 0;
    return sum + seats;
  }, 0);
  const actualWithSupport = actualTotal + actualSupportParties.reduce((sum, partyId) => {
    const seats = coalitionForYear?.seats[partyId] ?? 0;
    return sum + seats;
  }, 0);

  const hasReachedMajority = selectedTotal >= majority;
  const surplus = Math.max(0, selectedTotal - majority);
  const shortfall = Math.max(0, majority - selectedTotal);
  const chamberLayout = useMemo(
    () => createChamberLayout(allPartiesWithSeats, selectedParties),
    [allPartiesWithSeats, selectedParties]
  );

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    setSelectedParties(new Set());
  };

  const toggleParty = (partyId: string) => {
    setSelectedParties((prev) => {
      const next = new Set(prev);
      if (next.has(partyId)) {
        next.delete(partyId);
      } else {
        next.add(partyId);
      }
      return next;
    });
  };

  const selectActualCoalition = () => {
    if (!coalitionForYear) return;
    const set = new Set<string>();
    for (const partyId of coalitionForYear.coalition) {
      set.add(partyId);
    }
    setSelectedParties(set);
  };

  const partyButtonClass = (selected: boolean): string =>
    `${selected ? 'ring-2 ring-offset-2 ring-offset-app-card' : 'bg-app-btn text-app-btn-text hover:bg-app-btn-hover'} px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2`;

  const selectClass = 'app-select';

  if (yearsWithSeats.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-app-muted">
        <p>{t('coalitionNoSeatData')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Election selector */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-app-muted whitespace-nowrap">{t('coalitionSelectElection')}</label>
        <span className="relative">
          <select value={selectedYear} onChange={(e) => handleYearChange(e.target.value)} className={selectClass}>
            {yearsWithSeats.map((y) => <option key={y} value={y}>{y}</option>)}
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
          viewBox="0 0 600 330"
          role="img"
          aria-label={`${selectedTotal} of ${totalSeats} seats selected; ${majority} seats needed for a majority`}
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
                r="5"
                fill={seat.selected ? seat.color : 'var(--c-bg-card)'}
                stroke={seat.selected ? seat.color : 'var(--c-border-strong)'}
                strokeWidth="1"
              >
              <title>{`${seat.label}${seat.selected ? ' (selected)' : ''}`}</title>
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
              return (
                <span
                  key={partyId}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{backgroundColor: getPartyColor(partyId, parties) + '33', color: getPartyColor(partyId, parties)}}
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
              {actualTotal}{actualSupportParties.length > 0 ? ` (+${actualWithSupport - actualTotal})` : ''} {t('coalitionSeatsLabel')}
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
              onClick={() => setSelectedParties(new Set())}
              className="text-xs font-medium text-app-muted hover:text-app-text transition-colors"
            >
              Clear
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
