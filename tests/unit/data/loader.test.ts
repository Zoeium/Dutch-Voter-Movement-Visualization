import {describe, expect, it} from 'vitest';
import type {CoalitionData, ElectionYear, PartyInfo, VoteTotals, VoterMovement} from '@/types';
import {
  buildComparisonRows,
  buildMultiElectionFlows,
  getCoalitionForElection,
  getElectionSeats,
  getPartyColor,
  getPartyDisplayName,
  loadCoalitions,
  loadCountries,
  resolvePartyName,
} from '@/data/loader';

const parties: PartyInfo[] = [
  {party: 'a', display_name: 'Party A', color: '#111111'},
  {party: 'b', display_name: 'Party B', color: '#222222'},
  {party: 'not_voted', display_name: 'Did not vote', color: '#333333'},
  {party: 'other', display_name: 'Other', color: '#444444'},
];

function totals(partiesVotes: Record<string, number>, notVoted = 100): VoteTotals {
  const valid = Object.values(partiesVotes).reduce((sum, votes) => sum + votes, 0);
  return {
    date: '2020-01-01',
    source: {name: 'test', url: ''},
    electorate: valid + notVoted,
    not_voted: notVoted,
    total_votes: valid,
    non_valid_votes: 0,
    blanco_votes: 0,
    valid_votes: valid,
    parties_votes: partiesVotes,
  };
}

function election(year: string, partiesVotes: Record<string, number>, movements: VoterMovement[] = []): ElectionYear {
  return {year, voteTotals: totals(partiesVotes), movements};
}

const movement = (party: string, origins: Record<string, number>): VoterMovement => ({
  party,
  vote_last_election_in_percentile: origins,
});

const cabinet = (name: string, electionYear: string, seats: Record<string, number>): CoalitionData => ({
  name,
  year: electionYear,
  electionYear,
  coalition: ['a'],
  seats,
});

describe('buildMultiElectionFlows', () => {
  const first = election('2020', {a: 600, b: 400});
  const second = election('2024', {a: 500, b: 500}, [
    movement('a', {a: 80, b: 20}),
    movement('b', {b: 70, a: 20, not_voted: 10}),
  ]);

  it('turns movement percentages into vote flows between adjacent elections', () => {
    const {links} = buildMultiElectionFlows([first, second], parties, null);
    const value = (source: string, target: string) =>
      links.find((link) => link.source === source && link.target === target)?.value;

    expect(links).toHaveLength(5);
    expect(value('0:a', '1:a')).toBe(400);
    expect(value('0:b', '1:a')).toBe(100);
    expect(value('0:b', '1:b')).toBe(350);
    expect(value('0:a', '1:b')).toBe(100);
    expect(value('0:not_voted', '1:b')).toBe(50);
  });

  it('keeps only flows touching the selected party', () => {
    const {links} = buildMultiElectionFlows([first, second], parties, 'b');
    expect(links).toHaveLength(4);
    expect(links.every((link) => link.source === '0:b' || link.target === '1:b')).toBe(true);
  });

  it('groups parties without a party file as "other"', () => {
    const withUnknown = election('2024', {a: 1000}, [movement('a', {a: 50, unknown: 50})]);
    const {links} = buildMultiElectionFlows([first, withUnknown], parties, null);
    expect(links.map((link) => link.source).sort()).toEqual(['0:a', '0:other']);
  });

  it('returns nothing when no election has movement data', () => {
    expect(buildMultiElectionFlows([first, election('2024', {a: 1})], parties, null)).toEqual({nodes: [], links: []});
  });
});

describe('buildComparisonRows', () => {
  const elections = [election('2020', {a: 600, b: 400}), election('2024', {a: 500, b: 500}), election('2028', {a: 1})];
  const coalitions = [cabinet('One', '2020', {a: 6}), cabinet('Two', '2024', {a: 5, b: 5})];

  it('compares votes, shares and seats per party', () => {
    const rows = buildComparisonRows(elections, '2020', '2024', coalitions, parties);
    const b = rows.find((row) => row.partyId === 'b');
    expect(b).toMatchObject({label: 'Party B', votesA: 400, votesB: 500, voteChange: 100, seatsB: 5});
    expect(b?.shareA).toBeCloseTo(40);
    expect(b?.shareChange).toBeCloseTo(10);
  });

  it('counts a party missing from a seat map as 0 seats, not unknown', () => {
    const b = buildComparisonRows(elections, '2020', '2024', coalitions, parties).find((row) => row.partyId === 'b');
    expect(b).toMatchObject({seatsA: 0, seatChange: 5});
  });

  it('marks seats unknown when the election has no cabinet', () => {
    const a = buildComparisonRows(elections, '2024', '2028', coalitions, parties).find((row) => row.partyId === 'a');
    expect(a).toMatchObject({seatsA: 5, seatsB: null, seatChange: null});
  });

  it('returns no rows for the same election twice or an unknown election', () => {
    expect(buildComparisonRows(elections, '2020', '2020', coalitions, parties)).toEqual([]);
    expect(buildComparisonRows(elections, '2020', '1999', coalitions, parties)).toEqual([]);
  });
});

describe('cabinet lookup', () => {
  it('uses the first cabinet formed after an election', () => {
    const coalitions = [cabinet('First', '2020', {a: 1}), cabinet('Later', '2020', {a: 2})];
    expect(getCoalitionForElection('2020', coalitions)?.name).toBe('First');
    expect(getElectionSeats('2020', coalitions)).toEqual({a: 1});
    expect(getElectionSeats('2024', coalitions)).toBeNull();
  });

  // Regression: a cabinet sworn in earlier in an election year belongs to the previous election.
  it.each([
    ['nl', '1982', 'Lubbers I'],
    ['nl', '1972', 'Den Uyl'],
    ['nl', '2006', 'Balkenende IV'],
    ['uk', '1974-02', 'Wilson III'],
    ['uk', '1974-10', 'Wilson IV'],
  ])('links the %s %s election to %s', (country, year, name) => {
    expect(getCoalitionForElection(year, loadCoalitions(country))?.name).toBe(name);
  });
});

describe('party lookup', () => {
  const lineage: PartyInfo[] = [
    {party: 'new', display_name: 'New', color: '#abcdef', previous_names: ['old']},
    {party: 'old', display_name: 'Old', color: '#fedcba'},
  ];

  it('resolves a previous name to its successor', () => {
    expect(resolvePartyName('old', lineage)).toBe('new');
    expect(resolvePartyName('unknown', lineage)).toBe('unknown');
  });

  it('keeps the own name and colour of a predecessor that has a party file', () => {
    expect(getPartyDisplayName('old', lineage)).toBe('Old');
    expect(getPartyColor('old', lineage)).toBe('#fedcba');
  });

  it('falls back to the raw name and a neutral colour', () => {
    expect(getPartyDisplayName('unknown', lineage)).toBe('unknown');
    expect(getPartyColor('unknown', lineage)).toBe('#6b7280');
  });
});

describe('loadCountries', () => {
  it('lists every country with a name in both interface languages', () => {
    const countries = loadCountries();
    expect(countries.map((country) => country.id)).toEqual(expect.arrayContaining(['de', 'nl', 'se', 'uk']));
    for (const country of countries) {
      expect(country.name.en).not.toBe('');
      expect(country.name.nl).not.toBe('');
    }
  });
});
