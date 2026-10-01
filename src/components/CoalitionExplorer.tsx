import {useMemo, useState} from 'react';
import {Check, X, Users} from 'lucide-react';
import type {CoalitionData, PartyInfo} from '@/types';
import {getPartyColor, getPartyDisplayName, resolvePartyName} from '@/data/loader';
import {useI18n} from '@/theme';

interface CoalitionExplorerProps {
  coalitions: CoalitionData[];
  parties: PartyInfo[];
}

const MAJORITY = 76;

interface PartySeat {
  partyId: string;
  label: string;
  color: string;
  seats: number;
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

  const selectedTotal = useMemo(() => {
    let total = 0;
    for (const p of allPartiesWithSeats) {
      const canonical = resolvePartyName(p.partyId, parties);
      if (selectedParties.has(canonical)) {
        total += p.seats;
      }
    }
    return total;
  }, [allPartiesWithSeats, selectedParties, parties]);

  const remainingParties = useMemo(
    () => allPartiesWithSeats.filter((p) => !selectedParties.has(resolvePartyName(p.partyId, parties))),
    [allPartiesWithSeats, selectedParties, parties]
  );

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

  const hasReachedMajority = selectedTotal >= MAJORITY;
  const surplus = Math.max(0, selectedTotal - MAJORITY);
  const shortfall = Math.max(0, MAJORITY - selectedTotal);

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
      set.add(resolvePartyName(partyId, parties));
    }
    setSelectedParties(set);
  };

  const partyButtonClass = (selected: boolean): string =>
    `${selected ? 'ring-2 ring-offset-2 ring-offset-app-card' : 'bg-app-btn text-app-btn-text hover:bg-app-btn-hover'} px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2`;

  const selectClass = 'px-3 py-2 rounded-lg text-sm font-medium bg-app-btn text-app-btn-text hover:bg-app-btn-hover border border-app-border transition-all cursor-pointer';

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
        <select value={selectedYear} onChange={(e) => handleYearChange(e.target.value)} className={selectClass}>
          {yearsWithSeats.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
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
            <span className="text-sm text-app-muted">/ {MAJORITY} {t('coalitionSeatsLabel')}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="relative h-8 rounded-full bg-app-btn overflow-hidden">
          {/* Majority line marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-app-border-strong z-10"
            style={{left: `${(MAJORITY / totalSeats) * 100}%`}}
          />
          {/* Filled portion */}
          <div
            className={`h-full rounded-full transition-all duration-300 ${hasReachedMajority ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{width: `${Math.min(100, (selectedTotal / totalSeats) * 100)}%`}}
          />
          {/* Seat count text inside bar */}
          {selectedTotal > 0 && (
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
              {selectedTotal} / {MAJORITY}
            </span>
          )}
        </div>

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
            const canonical = resolvePartyName(p.partyId, parties);
            const isSelected = selectedParties.has(canonical);
            return (
              <button
                type="button"
                key={p.partyId}
                onClick={() => toggleParty(canonical)}
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
              .filter((p) => selectedParties.has(resolvePartyName(p.partyId, parties)))
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

      {/* Remaining parties */}
      {remainingParties.length > 0 && selectedParties.size > 0 && !hasReachedMajority && (
        <div>
          <h4 className="text-sm font-semibold text-app-heading mb-3">{t('coalitionRemaining')}</h4>
          <div className="flex flex-wrap gap-2">
            {remainingParties
              .sort((a, b) => b.seats - a.seats)
              .slice(0, 10)
              .map((p) => (
                <button
                  type="button"
                  key={p.partyId}
                  onClick={() => toggleParty(resolvePartyName(p.partyId, parties))}
                  className="px-3 py-1.5 rounded-lg text-sm bg-app-btn text-app-btn-text hover:bg-app-btn-hover transition-all flex items-center gap-2"
                >
                  <span className="w-3 h-3 rounded-full" style={{backgroundColor: p.color}}/>
                  {p.label}
                  <span className="opacity-75">({p.seats})</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
