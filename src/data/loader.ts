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
  const match = path.match(/\/elections\/(\d{4})\//);
  return match ? match[1] : '';
}

// Extract party slug from a voters_movement path like ".../voters_movement/vvd.yaml"
function extractPartySlug(path: string): string {
  const match = path.match(/\/voters_movement\/(.+)\.yaml$/);
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

  const sortedYears = Array.from(years).sort();

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
  if (name === 'not_voted') return '#9ca3af';
  return '#6b7280';
}

/**
 * Get display name for a party. Uses the RAW name as it appeared in the election,
 * NOT the resolved/canonical name.
 */
export function getPartyDisplayName(name: string, parties: PartyInfo[]): string {
  if (name === 'not_voted') return 'Did not vote';
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

    const fromTotals = fromYear.voteTotals.parties_votes;
    const toTotals = toYear.voteTotals.parties_votes;
    const fromNotVoted = fromYear.voteTotals.not_voted;

    const flows: Flow[] = [];

    for (const movement of toYear.movements) {
      const targetParty = movement.party;
      const targetVotes = toTotals[targetParty] ?? 0;
      if (targetVotes === 0) continue;

      for (const [sourceName, pct] of Object.entries(movement.vote_last_election_in_percentile)) {
        if (pct < threshold) continue;

        const sourceId = sourceName;

        if (selectedParty) {
          const sourceMatches = isSameParty(sourceId, selectedParty, parties);
          const targetMatches = isSameParty(targetParty, selectedParty, parties);
          if (!sourceMatches && !targetMatches) {
            continue;
          }
        }

        const value = Math.round((pct / 100) * targetVotes);
        if (value > 0) {
          flows.push({ source: sourceId, target: targetParty, value });
        }
      }
    }

    const sourceIds = new Set<string>();
    const targetIds = new Set<string>();
    for (const f of flows) {
      sourceIds.add(f.source);
      targetIds.add(f.target);
    }

    for (const id of Array.from(sourceIds).sort((a, b) => {
      const aVotes = fromTotals[a] ?? (a === 'not_voted' ? fromNotVoted : 0);
      const bVotes = fromTotals[b] ?? (b === 'not_voted' ? fromNotVoted : 0);
      return bVotes - aVotes;
    })) {
      const outflow = flows.filter((f) => f.source === id).reduce((s, f) => s + f.value, 0);
      allNodes.push({
        id: `${fromCol}:${id}`,
        label: getPartyDisplayName(id, parties),
        color: getPartyColor(id, parties),
        columnIndex: fromCol,
        value: outflow,
      });
    }

    for (const id of Array.from(targetIds).sort((a, b) => {
      const aVotes = toTotals[a] ?? 0;
      const bVotes = toTotals[b] ?? 0;
      return bVotes - aVotes;
    })) {
      const inflow = flows.filter((f) => f.target === id).reduce((s, f) => s + f.value, 0);
      allNodes.push({
        id: `${toCol}:${id}`,
        label: getPartyDisplayName(id, parties),
        color: getPartyColor(id, parties),
        columnIndex: toCol,
        value: inflow,
      });
    }

    for (const f of flows) {
      allLinks.push({
        source: `${fromCol}:${f.source}`,
        target: `${toCol}:${f.target}`,
        value: f.value,
        color: getPartyColor(f.target, parties),
      });
    }
  }

  const nodeMap: Record<string, DiagramNode> = {};
  for (const node of allNodes) {
    if (nodeMap[node.id]) {
      nodeMap[node.id] = { ...node, value: Math.max(nodeMap[node.id].value, node.value) };
    } else {
      nodeMap[node.id] = node;
    }
  }

  return { nodes: Object.values(nodeMap), links: allLinks };
}
