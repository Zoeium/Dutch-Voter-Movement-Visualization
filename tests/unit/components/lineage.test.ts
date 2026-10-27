import {describe, expect, it} from 'vitest';
import type {PartyInfo} from '@/types';
import {collectMergeEdges, collectSplitEdges, type LineageBlock, type LineageEdge} from '@/components/lineage';

/** Columns of blocks from party ids; canonical names equal the ids. */
const columns = (...ids: string[][]): LineageBlock[][] => ids.map((col) => col.map((party) => ({party, canonical: party})));
const pairs = (edges: LineageEdge[], cols: LineageBlock[][]) =>
  edges.map(({from, to}) => {
    const fromCol = cols.findIndex((col) => col.includes(from));
    const toCol = cols.findIndex((col) => col.includes(to));
    return `${from.party}@${fromCol}>${to.party}@${toCol}`;
  }).sort();

const party = (id: string, relations: Partial<PartyInfo> = {}): PartyInfo => ({party: id, display_name: id, color: '#000000', ...relations});

describe('lineage between parliament columns', () => {
  it('draws a merger once, when the new party appears', () => {
    const cols = columns(['a', 'b', 'x'], ['ab', 'x'], ['ab', 'x']);
    const parties = [party('ab', {previous_names: ['a', 'b']})];
    expect(pairs(collectMergeEdges(cols, parties), cols)).toEqual(['a@0>ab@1', 'b@0>ab@1']);
    expect(collectSplitEdges(cols, parties)).toEqual([]);
  });

  it('shows a temporary split that rejoins its party', () => {
    // 'knp' splits off from 'kvp', then returns to it.
    const cols = columns(['kvp'], ['kvp', 'knp'], ['kvp', 'knp'], ['kvp']);
    const parties = [party('kvp'), party('knp', {split_off: ['kvp'], rejoined: ['kvp']})];
    expect(pairs(collectSplitEdges(cols, parties), cols)).toEqual(['kvp@0>knp@1']);
    expect(pairs(collectMergeEdges(cols, parties), cols)).toEqual(['knp@2>kvp@3']);
  });

  it('shows a party splitting off again after rejoining', () => {
    const cols = columns(['psi', 'psdi'], ['psu'], ['psi', 'psdi']);
    const parties = [party('psu', {alliance_of: ['psi', 'psdi']}), party('psi'), party('psdi')];
    expect(pairs(collectMergeEdges(cols, parties), cols)).toEqual(['psdi@0>psu@1', 'psi@0>psu@1']);
    expect(pairs(collectSplitEdges(cols, parties), cols)).toEqual(['psu@1>psdi@2', 'psu@1>psi@2']);
  });

  it('does not join a member to an alliance it runs next to', () => {
    // Navarra Suma includes the PP in one region, while the PP keeps running nationally.
    const cols = columns(['pp', 'upn'], ['pp', 'na_plus'], ['pp', 'upn']);
    const parties = [party('na_plus', {alliance_of: ['upn', 'pp'], previous_names: ['upn']})];
    expect(pairs(collectMergeEdges(cols, parties), cols)).toEqual(['upn@0>na_plus@1']);
    expect(pairs(collectSplitEdges(cols, parties), cols)).toEqual(['na_plus@1>upn@2']);
  });

  it('lets a party disappear into the party that continues it', () => {
    // National Liberals merged into the Conservatives, which already existed.
    const cols = columns(['con', 'nl'], ['con']);
    const parties = [party('con', {previous_names: ['nl']}), party('nl')];
    expect(pairs(collectMergeEdges(cols, parties), cols)).toEqual(['nl@0>con@1']);
  });

  it('does not invent a rejoin for a split-off party that only lost its seats', () => {
    const cols = columns(['pvda'], ['pvda', 'ds70'], ['pvda']);
    const parties = [party('ds70', {split_off: ['pvda']})];
    expect(collectMergeEdges(cols, parties)).toEqual([]);
    expect(pairs(collectSplitEdges(cols, parties), cols)).toEqual(['pvda@0>ds70@1']);
  });
});
