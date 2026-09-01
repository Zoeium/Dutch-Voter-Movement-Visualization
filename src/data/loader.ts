import * as yaml from 'js-yaml';
import type {
  PartyInfo,
  VoteTotals,
  VoterMovement,
  ElectionYear,
  Flow,
  DiagramNode,
  DiagramLink,
} from '@/types';

// Auto-discover all party YAML files
const partyModules = import.meta.glob('@/../resources/parties/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// Auto-discover all election directories
// Each election has: vote_totals.yaml + voters_movement/*.yaml
const totalsModules = import.meta.glob('@/../resources/elections/*/vote_totals.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const movementModules = import.meta.glob('@/../resources/elections/*/voters_movement/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// Extract year from a path like "resources/elections/2021/vote_totals.yaml"
function extractYear(path: string): string {
  const match = new RegExp(/\/elections\/(\d{4})\//).exec(path);
  return match ? match[1] : '';
}

export function loadParties(): PartyInfo[] {
  return Object.values(partyModules).map((raw) => yaml.load(raw) as PartyInfo);
}

export function loadElections(): ElectionYear[] {
  // Build a map of year -> { totals, movements }
  const years = new Set<string>();

  for (const path of Object.keys(totalsModules)) {
    years.add(extractYear(path));
  }
  for (const path of Object.keys(movementModules)) {
    years.add(extractYear(path));
  }

  const sortedYears = Array.from(years).sort((a, b) => a.localeCompare(b));

  return sortedYears.map((year) => {
    const totalsPath = Object.keys(totalsModules).find((p) => extractYear(p) === year);
    const totals = totalsPath
      ? (yaml.load(totalsModules[totalsPath]) as VoteTotals)
      : { date: '', electorate: 0, not_voted: 0, total_votes: 0, non_valid_votes: 0, blanco_votes: 0, valid_votes: 0, parties_votes: {} };

    const movements: VoterMovement[] = [];
    for (const [path, raw] of Object.entries(movementModules)) {
      if (extractYear(path) !== year) continue;
      movements.push(yaml.load(raw) as VoterMovement);
    }

    return { year, voteTotals: totals, movements };
  });
}

/**
 * Resolve a raw party name to its canonical party ID for color/lookup.
 */
export function resolvePartyName(
  name: string,
  parties: PartyInfo[]
): string {
  for (const p of parties) {
    if (p.party === name) return p.party;
    if (p.previous_names?.includes(name)) return p.party;
  }
  return name;
}

/**
 * Get color for a party name. Resolves through previous_names for color matching.
 */
export function getPartyColor(name: string, parties: PartyInfo[]): string {
  const resolved = resolvePartyName(name, parties);
  const party = parties.find((p) => p.party === resolved);
  if (party) return party.color;
  return '#6b7280';
}

/**
 * Get display name for a party. Uses the RAW name as it appeared in the election,
 * NOT the resolved/canonical name.
 */
export function getPartyDisplayName(name: string, parties: PartyInfo[]): string {
  const party = parties.find((p) => p.party === name);
  if (party) return party.display_name;
  for (const p of parties) {
    if (p.previous_names?.includes(name)) {
      return name;
    }
  }
  return name;
}

/**
 * Check if two party names refer to the same party (for selectedParty filtering).
 */
export function isSameParty(nameA: string, nameB: string, parties: PartyInfo[]): boolean {
  return resolvePartyName(nameA, parties) === resolvePartyName(nameB, parties);
}

function shouldIncludeFlow(
  sourceName: string,
  targetParty: string,
  selectedParty: string | null,
  parties: PartyInfo[]
): boolean {
  if (!selectedParty) {
    return true;
  }

  const sourceMatches = isSameParty(sourceName, selectedParty, parties);
  const targetMatches = isSameParty(targetParty, selectedParty, parties);
  return sourceMatches || targetMatches;
}

function buildPairFlows(
  toYear: ElectionYear,
  parties: PartyInfo[],
  selectedParty: string | null,
  threshold: number,
  toTotals: Record<string, number>
): Flow[] {
  const flows: Flow[] = [];

  for (const movement of toYear.movements) {
    const targetParty = movement.party;
    const targetVotes = toTotals[targetParty] ?? 0;
    if (targetVotes === 0) continue;

    for (const [sourceName, pct] of Object.entries(movement.vote_last_election_in_percentile)) {
      if (pct < threshold) continue;
      if (!shouldIncludeFlow(sourceName, targetParty, selectedParty, parties)) continue;

      const value = Math.round((pct / 100) * targetVotes);
      if (value > 0) {
        flows.push({ source: sourceName, target: targetParty, value });
      }
    }
  }

  return flows;
}

function getPartyVoteCount(id: string, totals: Record<string, number>): number {
  return totals[id] ?? 0;
}

function buildColumnNodes(
  ids: Set<string>,
  columnIndex: number,
  totals: Record<string, number>,
  flows: Flow[],
  parties: PartyInfo[],
  isSource: boolean
): DiagramNode[] {
  return Array.from(ids)
    .sort((a, b) => {
      const aVotes = isSource ? getPartyVoteCount(a, totals) : totals[a] ?? 0;
      const bVotes = isSource ? getPartyVoteCount(b, totals) : totals[b] ?? 0;
      return bVotes - aVotes;
    })
    .map((id) => {
      const value = flows
        .filter((f) => (isSource ? f.source === id : f.target === id))
        .reduce((sum, f) => sum + f.value, 0);

      return {
        id: `${columnIndex}:${id}`,
        label: getPartyDisplayName(id, parties),
        color: getPartyColor(id, parties),
        columnIndex,
        value,
      };
    });
}

function buildLinks(
  flows: Flow[],
  fromCol: number,
  toCol: number,
  parties: PartyInfo[]
): DiagramLink[] {
  return flows.map((f) => ({
    source: `${fromCol}:${f.source}`,
    target: `${toCol}:${f.target}`,
    value: f.value,
    color: getPartyColor(f.target, parties),
  }));
}

function mergeNodeMap(nodes: DiagramNode[]): DiagramNode[] {
  const nodeMap: Record<string, DiagramNode> = {};

  for (const node of nodes) {
    const existingNode = nodeMap[node.id];
    if (existingNode) {
      nodeMap[node.id] = { ...node, value: Math.max(existingNode.value, node.value) };
      continue;
    }

    nodeMap[node.id] = node;
  }

  return Object.values(nodeMap);
}

function getTotals(electionYear: ElectionYear) {
    const totals = electionYear.voteTotals.parties_votes;
    totals['not_voted'] = electionYear.voteTotals.not_voted;
    return totals;
}

export function buildMultiElectionFlows(
  elections: ElectionYear[],
  parties: PartyInfo[],
  selectedParty: string | null,
  threshold: number = 1
): { nodes: DiagramNode[]; links: DiagramLink[] } {
  if (elections.length < 2) {
    return { nodes: [], links: [] };
  }

  const allNodes: DiagramNode[] = [];
  const allLinks: DiagramLink[] = [];

  for (let i = 0; i < elections.length - 1; i++) {
    const fromYear = elections[i];
    const toYear = elections[i + 1];
    const fromCol = i;
    const toCol = i + 1;

    const fromTotals = getTotals(fromYear);
    const toTotals = getTotals(toYear);
    const flows = buildPairFlows(toYear, parties, selectedParty, threshold, toTotals);

    const sourceIds = new Set<string>();
    const targetIds = new Set<string>();
    for (const flow of flows) {
      sourceIds.add(flow.source);
      targetIds.add(flow.target);
    }

    allNodes.push(
      ...buildColumnNodes(sourceIds, fromCol, fromTotals, flows, parties, true),
      ...buildColumnNodes(targetIds, toCol, toTotals, flows, parties, false)
    );
    allLinks.push(...buildLinks(flows, fromCol, toCol, parties));
  }

  return { nodes: mergeNodeMap(allNodes), links: allLinks };
}
