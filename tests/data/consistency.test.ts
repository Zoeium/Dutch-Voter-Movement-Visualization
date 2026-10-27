import {describe, expect, it} from 'vitest';
import {
  getCoalitionForElection,
  loadAllElections,
  loadCoalitions,
  loadCountries,
  loadDataSources,
  loadElections,
  loadParties,
} from '@/data/loader';

// Consistency of every country's resource files, read through the same loader the app
// uses. A failure names the country and election, so a broken file is easy to find.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Election ids are years, or YYYY-MM when a country held two elections in one year.
const ELECTION_ID = /^\d{4}(-\d{2})?$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
// Voter movement percentages are rounded per origin party, so a complete breakdown can
// add up to slightly more than 100. Sources only list the larger origin parties, so a
// breakdown may add up to less - but a file below this share is most likely broken.
const MOVEMENT_SUM_TOLERANCE = 3;
const MOVEMENT_MIN_COVERED = 70;

const invalidVotes = (t: {non_valid_votes?: number; blanco_votes?: number; non_valid_votes_and_blanco_votes?: number}) =>
  (t.non_valid_votes ?? 0) + (t.blanco_votes ?? 0) + (t.non_valid_votes_and_blanco_votes ?? 0);

const countries = loadCountries();

it('has at least one country', () => {
  expect(countries.length).toBeGreaterThan(0);
});

describe.each(countries.map((country) => [country.id, country] as const))('%s', (id, country) => {
  const parties = loadParties(id);
  const partyIds = new Set(parties.map((party) => party.party));
  const elections = loadAllElections(id);
  const coalitions = loadCoalitions(id);

  it('has a name in both interface languages and a flag', () => {
    expect(country.name.en.trim()).not.toBe('');
    expect(country.name.nl.trim()).not.toBe('');
    expect(country.flagUrl).toBeTruthy();
  });

  describe('parties', () => {
    it('has the "other" and "not_voted" parties', () => {
      expect(partyIds).toContain('other');
      expect(partyIds).toContain('not_voted');
    });

    it.each(parties.map((party) => [party.party, party] as const))('%s has a name and a colour', (_, party) => {
      expect(party.display_name.trim()).not.toBe('');
      expect(party.color).toMatch(HEX_COLOR);
    });

    it('has unique party ids', () => {
      expect(partyIds.size).toBe(parties.length);
    });

    it('only relates parties to existing parties, and never to themselves', () => {
      const relations = parties.flatMap((party) =>
        (['previous_names', 'split_off', 'alliance_of', 'rejoined'] as const).flatMap((field) =>
          (party[field] ?? []).map((other) => ({party: party.party, field, other}))
        )
      );
      const broken = relations.filter(({party, other}) => !partyIds.has(other) || other === party);
      expect(broken.map(({party, field, other}) => `${party}.${field}: ${other}`)).toEqual([]);
    });
  });

  describe('elections', () => {
    it('lists elections in date order', () => {
      const dates = elections.map((election) => election.voteTotals.date);
      expect(dates).toEqual([...dates].sort());
    });

    it.each(elections.map((election) => [election.year, election] as const))('%s', (year, election) => {
      const t = election.voteTotals;
      expect(year).toMatch(ELECTION_ID);
      expect(String(t.date)).toMatch(ISO_DATE);
      expect(String(t.date).slice(0, 4)).toBe(year.slice(0, 4));
      expect(t.source.name.trim()).not.toBe('');

      const partyVotes = Object.values(t.parties_votes);
      expect(partyVotes.every((votes) => Number.isInteger(votes) && votes > 0)).toBe(true);
      expect(partyVotes.reduce((sum, votes) => sum + votes, 0)).toBe(t.valid_votes);
      expect(t.valid_votes + invalidVotes(t)).toBe(t.total_votes);
      expect(t.electorate - t.total_votes).toBe(t.not_voted);
      expect(t.not_voted).toBeGreaterThan(0);

      const withoutPartyFile = Object.keys(t.parties_votes).filter((party) => !partyIds.has(party));
      expect(withoutPartyFile).toEqual([]);
    });
  });

  describe('cabinets', () => {
    it.each(elections.map((election) => [election.year] as const))('a cabinet with seats follows the %s election', (year) => {
      const cabinet = getCoalitionForElection(year, coalitions);
      expect(cabinet, `no cabinet after the ${year} election`).toBeDefined();
      expect(Object.keys(cabinet?.seats ?? {}).length).toBeGreaterThan(0);
    });

    it.each(coalitions.map((coalition) => [`${coalition.name} (${coalition.year})`, coalition] as const))('%s', (_, coalition) => {
      expect(coalition.name.trim()).not.toBe('');
      expect(coalition.electionYear, 'not linked to an election').toBeDefined();

      const seatParties = Object.keys(coalition.seats);
      expect(seatParties.filter((party) => !partyIds.has(party))).toEqual([]);
      expect(Object.values(coalition.seats).every((seats) => Number.isInteger(seats) && seats > 0)).toBe(true);

      // Every governing and supporting party holds seats.
      expect(coalition.coalition.length).toBeGreaterThan(0);
      const seatless = [...coalition.coalition, ...(coalition.support ?? [])].filter((party) => !coalition.seats[party]);
      expect(seatless).toEqual([]);

      // Seats can only go to parties that took part in that election.
      const election = elections.find((e) => e.year === coalition.electionYear);
      const notOnBallot = seatParties.filter((party) => party !== 'other' && !(party in (election?.voteTotals.parties_votes ?? {})));
      expect(notOnBallot).toEqual([]);
    });

    it('gives every cabinet of one election the same parliament size', () => {
      const sizes = new Map<string, Set<number>>();
      for (const coalition of coalitions) {
        const size = Object.values(coalition.seats).reduce((sum, seats) => sum + seats, 0);
        const key = coalition.electionYear ?? '';
        sizes.set(key, (sizes.get(key) ?? new Set()).add(size));
      }
      const differing = [...sizes].filter(([, set]) => set.size > 1).map(([year, set]) => `${year}: ${[...set].join(', ')}`);
      expect(differing).toEqual([]);
    });
  });

  describe('voter movements', () => {
    const flowElections = loadElections(id);
    const movements = flowElections.flatMap((election) =>
      election.movements.map((m) => [`${election.year} ${m.party}`, election, m] as const)
    );

    it.runIf(movements.length > 0).each(movements)('%s', (_, election, m) => {
      const origins = m.vote_last_election_in_percentile;
      const total = Object.values(origins).reduce((sum, pct) => sum + pct, 0);
      expect(Object.values(origins).every((pct) => pct >= 0 && pct <= 100)).toBe(true);
      expect(total).toBeLessThanOrEqual(100 + MOVEMENT_SUM_TOLERANCE);
      expect(total).toBeGreaterThanOrEqual(MOVEMENT_MIN_COVERED);
      expect(Object.keys(origins).filter((party) => !partyIds.has(party))).toEqual([]);
      // The 'not_voted' breakdown describes the non-voters, counted outside the party votes.
      const target = m.party === 'not_voted' ? election.voteTotals.not_voted : election.voteTotals.parties_votes[m.party];
      expect(target, `${m.party} has no votes in ${election.year}`).toBeGreaterThan(0);
    });

    it.runIf(movements.length > 0)('cites a source for the movement data', () => {
      expect(loadDataSources(id).some((source) => source.kind === 'movement')).toBe(true);
    });
  });
});
