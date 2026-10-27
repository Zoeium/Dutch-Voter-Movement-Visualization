// Party lineage between parliament columns: continuations, mergers, splits,
// temporary alliances and parties rejoining. Pure, so it can be tested on its own.
import type {PartyInfo} from '@/types';

/** The part of a party block the lineage needs: its own key and its resolved identity. */
export interface LineageBlock {
  party: string;
  canonical: string;
}

export function getSplitParents(party: string, parties: PartyInfo[]): string[] {
  // Prefer the party's own entry over the `previous_names` fallback: `ppr` is also
  // a previous name of groenlinks, and groenlinks sorts first, so a combined
  // lookup would return groenlinks (no split_off) and never read ppr.yaml.
  const exact = parties.find((x) => x.party === party);
  if (exact) return exact.split_off ?? [];

  const viaPreviousName = parties.find((x) => x.previous_names?.includes(party));
  return viaPreviousName?.split_off ?? [];
}

export type LineageEdge<T extends LineageBlock = LineageBlock> = { from: T; to: T };

/** Party ids present in each column, to tell appearing and disappearing parties apart. */
function collectPresence(colBlocks: LineageBlock[][]): Set<string>[] {
  return colBlocks.map((list) => new Set(list.map((block) => block.party)));
}

function relationsOf(parties: PartyInfo[]): Map<string, PartyInfo> {
  const byParty = new Map<string, PartyInfo>();
  for (const party of parties) {
    if (!byParty.has(party.party)) byParty.set(party.party, party);
  }
  return byParty;
}

function pushUnique<T extends LineageBlock>(edges: LineageEdge<T>[], from: T, to: T): void {
  if (from.party === to.party) return;
  if (!edges.some((edge) => edge.from === from && edge.to === to)) edges.push({from, to});
}

/**
 * Lines into a party from the previous column. Drawn whenever a party appears or
 * reappears (not only the first time), and whenever one disappears into another, so
 * temporary splits that rejoin and temporary alliances that break up are shown too:
 *   - a party that appears takes over its predecessors (previous_names) and the members
 *     of its alliance (alliance_of) that no longer run on their own;
 *   - a party that disappears flows into the party that continues it, the alliance it
 *     joined, or the party it rejoined (rejoined).
 */
export function collectMergeEdges<T extends LineageBlock>(colBlocks: T[][], parties: PartyInfo[]): LineageEdge<T>[] {
  const edges: LineageEdge<T>[] = [];
  const relations = relationsOf(parties);
  const presence = collectPresence(colBlocks);

  for (let colIndex = 1; colIndex < colBlocks.length; colIndex += 1) {
    const step = {
      previous: new Map(colBlocks[colIndex - 1].map((block) => [block.party, block])),
      previousPresent: presence[colIndex - 1],
      current: presence[colIndex],
    };
    for (const block of colBlocks[colIndex]) {
      for (const from of mergeSourcesOf(block, relations.get(block.party), step)) pushUnique(edges, from, block);
    }
    appendDisappearingEdges(edges, colBlocks[colIndex - 1], colBlocks[colIndex], step.current, relations);
  }

  return edges;
}

/** Parties of the previous column that are gone now flow into the party they continue in. */
function appendDisappearingEdges<T extends LineageBlock>(
  edges: LineageEdge<T>[],
  previousList: T[],
  list: T[],
  current: Set<string>,
  relations: Map<string, PartyInfo>
): void {
  for (const from of previousList.filter((block) => !current.has(block.party))) {
    for (const to of list.filter((block) => continuesInto(from, block, relations))) pushUnique(edges, from, to);
  }
}

interface MergeStep<T> {
  previous: Map<string, T>;
  previousPresent: Set<string>;
  current: Set<string>;
}

/**
 * Blocks in the previous column that flow into an appearing party: its predecessors, and
 * members of its alliance that stop running separately in this column.
 */
function mergeSourcesOf<T extends LineageBlock>(block: T, info: PartyInfo | undefined, step: MergeStep<T>): T[] {
  const predecessors = step.previousPresent.has(block.party) ? [] : info?.previous_names ?? [];
  const joiningMembers = (info?.alliance_of ?? []).filter((member) => !step.current.has(member));
  return [...predecessors, ...joiningMembers]
    .map((party) => step.previous.get(party))
    .filter((from): from is T => from !== undefined);
}

/** A disappearing party continues in `to`: its successor, or the party it rejoined. */
function continuesInto(from: LineageBlock, to: LineageBlock, relations: Map<string, PartyInfo>): boolean {
  const successorOf = relations.get(to.party)?.previous_names ?? [];
  const rejoined = relations.get(from.party)?.rejoined ?? [];
  return successorOf.includes(from.party) || rejoined.includes(to.party) || rejoined.includes(to.canonical);
}

/**
 * Lines out of a party into one that appears or reappears in the next column: a party
 * splitting off (split_off), and members leaving an alliance that ended (alliance_of).
 * In the first column, a split from a party in the same column is still shown.
 */
export function collectSplitEdges<T extends LineageBlock>(colBlocks: T[][], parties: PartyInfo[]): LineageEdge<T>[] {
  const edges: LineageEdge<T>[] = [];
  const relations = relationsOf(parties);
  const presence = collectPresence(colBlocks);

  for (let colIndex = 0; colIndex < colBlocks.length; colIndex += 1) {
    const list = colBlocks[colIndex];
    const previousList = colBlocks[colIndex - 1] ?? [];
    const appearing = list.filter((block) => colIndex === 0 || !presence[colIndex - 1].has(block.party));

    for (const block of appearing) {
      // In the first column the parent can only be found in the same column.
      const from = splitParentBlock(block, colIndex === 0 ? list : previousList, parties);
      if (from) pushUnique(edges, from, block);
      for (const alliance of alliancesLeftBy(block, previousList, relations)) pushUnique(edges, alliance, block);
    }
  }

  return edges;
}

/** Alliances in the previous column that `block` was part of: it runs on its own again. */
function alliancesLeftBy<T extends LineageBlock>(block: T, previousList: T[], relations: Map<string, PartyInfo>): T[] {
  return previousList.filter((alliance) => (relations.get(alliance.party)?.alliance_of ?? []).includes(block.party));
}

/** The block of the party `block` split off from, if it is among `candidates`. */
function splitParentBlock<T extends LineageBlock>(block: T, candidates: T[], parties: PartyInfo[]): T | undefined {
  const parent = getSplitParents(block.party, parties)[0];
  if (!parent) return undefined;
  const from = candidates.find((candidate) => candidate.party === parent || candidate.canonical === parent);
  return from === block ? undefined : from;
}
