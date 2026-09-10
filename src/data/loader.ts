import * as yaml from 'js-yaml';
import type {
  DataSource,
  DiagramLink,
  DiagramNode,
  ElectionYear,
  Flow,
  PartyInfo,
  VoterMovement,
  VoteTotals,
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

const movementSourceModules = import.meta.glob('@/../resources/elections/*/voters_movement/source.yaml', {
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
      : {
        date: '',
        source: {name: '', url: ''},
        electorate: 0,
        not_voted: 0,
        total_votes: 0,
        non_valid_votes: 0,
        blanco_votes: 0,
        valid_votes: 0,
        parties_votes: {},
      };

    const movements: VoterMovement[] = [];
    for (const [path, raw] of Object.entries(movementModules)) {
      if (extractYear(path) !== year) continue;
      if (path.endsWith('/voters_movement/source.yaml')) continue;
      movements.push(yaml.load(raw) as VoterMovement);
    }

    return {year, voteTotals: totals as VoteTotals, movements};
  });
}

function normalizeDataSource(source: unknown): DataSource | string | null {
  if (typeof source === 'string') {
    return source;
  }

  if (!source || typeof source !== 'object') {
    return null;
  }

  const record = source as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name : null;
  if (!name) {
    return null;
  }

  return {
    name,
    url: typeof record.url === 'string' ? record.url : '',
  };
}

export function loadDataSources(): {
  year: string;
  fromYear?: string;
  toYear?: string;
  name: string;
  url?: string;
  kind: 'totals' | 'movement'
}[] {
  const sources: {
    year: string;
    fromYear?: string;
    toYear?: string;
    name: string;
    url?: string;
    kind: 'totals' | 'movement'
  }[] = [];
  const electionYears = Array.from(
    new Set([
      ...Object.keys(totalsModules).map(extractYear),
      ...Object.keys(movementModules).map(extractYear),
    ])
  ).sort((a, b) => a.localeCompare(b));
  const previousYearByYear = new Map<string, string | undefined>();

  for (let i = 0; i < electionYears.length; i++) {
    previousYearByYear.set(electionYears[i], i > 0 ? electionYears[i - 1] : undefined);
  }

  const addUniqueSource = (
    year: string,
    kind: 'totals' | 'movement',
    source: DataSource | string,
    fromYear?: string,
    toYear?: string
  ) => {
    const normalized = typeof source === 'string' ? {name: source, url: ''} : source;
    const exists = sources.some(
      (item) => item.year === year && item.kind === kind && item.name === normalized.name
    );
    if (!exists) {
      sources.push({
        year,
        fromYear,
        toYear,
        kind,
        name: normalized.name,
        url: normalized.url || undefined,
      });
    }
  };

  for (const [path, raw] of Object.entries(movementSourceModules)) {
    const year = extractYear(path);
    if (!year) continue;

    const doc = yaml.load(raw) as { source?: unknown; from_year?: string; to_year?: string } | null;
    const source = normalizeDataSource(doc?.source);
    if (source) {
      const fromYear = doc?.from_year ?? previousYearByYear.get(year) ?? year;
      const toYear = doc?.to_year ?? year;
      addUniqueSource(year, 'movement', source, fromYear, toYear);
    }
  }

  for (const [path, raw] of Object.entries(totalsModules)) {
    const year = extractYear(path);
    if (!year) continue;

    const doc = yaml.load(raw) as { source?: unknown } | null;
    const source = normalizeDataSource(doc?.source);
    if (source) {
      addUniqueSource(year, 'totals', source);
    }
  }

  return sources.sort((a, b) => a.year.localeCompare(b.year));
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
  // Prefer exact match (party had same id in this election)
  const exact = parties.find((p) => p.party === name);
  if (exact) return exact.color;

  // If this name appears as a previous name for some canonical party, try to use
  // the historical party's own color file (if present). Fall back to the canonical party color.
  for (const p of parties) {
    if (p.previous_names?.includes(name)) {
      const hist = parties.find((h) => h.party === name);
      if (hist) return hist.color;
      return p.color;
    }
  }

  // Last resort: resolve to canonical and return that color if available
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
  toTotals: Record<string, number>
): Flow[] {
  const flows: Flow[] = [];

  for (const movement of toYear.movements) {
    const targetParty = movement.party;
    const targetVotes = toTotals[targetParty] ?? 0;
    if (targetVotes === 0) continue;

    for (const [sourceName, pct] of Object.entries(movement.vote_last_election_in_percentile)) {
      if (!shouldIncludeFlow(sourceName, targetParty, selectedParty, parties)) continue;

      const value = Math.round((pct / 100) * targetVotes);
      if (value > 0) {
        flows.push({source: sourceName, target: targetParty, value});
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
  selectedParty: string | null,
  isSource: boolean
): DiagramNode[] {
  return Array.from(ids)
    .sort((a, b) => {
      const aVotes = isSource ? getPartyVoteCount(a, totals) : totals[a] ?? 0;
      const bVotes = isSource ? getPartyVoteCount(b, totals) : totals[b] ?? 0;
      return bVotes - aVotes;
    })
    .map((id) => {
      const value = !selectedParty ? totals[id] : flows
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
      nodeMap[node.id] = {...node, value: Math.max(existingNode.value, node.value)};
      continue;
    }

    nodeMap[node.id] = node;
  }

  return Object.values(nodeMap);
}

function getTotals(electionYear: ElectionYear, parties: PartyInfo[]) {
  const totals = {...electionYear.voteTotals.parties_votes} as Record<string, number>;
  totals['not_voted'] = electionYear.voteTotals.not_voted;

  const partyIds = new Set(parties.map((party) => party.party));
  totals['other'] = Object.entries(electionYear.voteTotals.parties_votes).reduce((sum, [party, votes]) => {
    if (party === 'other') return sum + votes;
    if (partyIds.has(party)) return sum;
    return sum + votes;
  }, 0);
  return totals;
}

function collectVisiblePartyIds(elections: ElectionYear[]): Set<string> {
  const visiblePartySet = new Set<string>();

  for (const election of elections) {
    for (const movement of election.movements) {
      visiblePartySet.add(movement.party);

      const sourceMap = (movement as any).vote_last_election_in_percentile as Record<string, number> | undefined;
      if (!sourceMap) {
        continue;
      }

      for (const sourceName of Object.keys(sourceMap)) {
        visiblePartySet.add(sourceName);
      }
    }
  }

  return visiblePartySet;
}

function remapHiddenParties(flows: Flow[], visiblePartySet: Set<string>): Flow[] {
  const remapAgg: Record<string, number> = {};

  for (const flow of flows) {
    const source = visiblePartySet.has(flow.source) || flow.source === 'other' ? flow.source : 'other';
    const target = visiblePartySet.has(flow.target) || flow.target === 'other' ? flow.target : 'other';
    const key = `${source}|${target}`;
    remapAgg[key] = (remapAgg[key] ?? 0) + flow.value;
  }

  return Object.entries(remapAgg).map(([key, value]) => {
    const [source, target] = key.split('|');
    return {source, target, value} as Flow;
  });
}

function collectFlowIds(
  flows: Flow[],
  selectedParty: string | null,
  parties: PartyInfo[]
): { sourceIds: Set<string>; targetIds: Set<string> } {
  const sourceIds = new Set<string>();
  const targetIds = new Set<string>();

  for (const flow of flows) {
    sourceIds.add(flow.source);
    targetIds.add(flow.target);
  }

  if (!selectedParty && parties.some((party) => party.party === 'other')) {
    sourceIds.add('other');
    targetIds.add('other');
  }

  return {sourceIds, targetIds};
}

function buildStepNodesAndLinks(
  fromYear: ElectionYear,
  toYear: ElectionYear,
  fromCol: number,
  toCol: number,
  parties: PartyInfo[],
  selectedParty: string | null,
  visiblePartySet: Set<string>
): { nodes: DiagramNode[]; links: DiagramLink[] } {
  const fromTotals = getTotals(fromYear, parties);
  const toTotals = getTotals(toYear, parties);
  const flows = buildPairFlows(toYear, parties, selectedParty, toTotals);
  const remappedFlows = remapHiddenParties(flows, visiblePartySet);
  const {sourceIds, targetIds} = collectFlowIds(remappedFlows, selectedParty, parties);

  return {
    nodes: [
      ...buildColumnNodes(sourceIds, fromCol, fromTotals, remappedFlows, parties, selectedParty, true),
      ...buildColumnNodes(targetIds, toCol, toTotals, remappedFlows, parties, selectedParty, false),
    ],
    links: buildLinks(remappedFlows, fromCol, toCol, parties),
  };
}

export function buildMultiElectionFlows(
  elections: ElectionYear[],
  parties: PartyInfo[],
  selectedParty: string | null,
): { nodes: DiagramNode[]; links: DiagramLink[] } {
  if (elections.length < 2) {
    return {nodes: [], links: []};
  }

  const allNodes: DiagramNode[] = [];
  const allLinks: DiagramLink[] = [];
  const visiblePartySet = collectVisiblePartyIds(elections);

  for (let i = 0; i < elections.length - 1; i++) {
    const step = buildStepNodesAndLinks(
      elections[i],
      elections[i + 1],
      i,
      i + 1,
      parties,
      selectedParty,
      visiblePartySet
    );

    allNodes.push(...step.nodes);
    allLinks.push(...step.links);
  }

  return {nodes: mergeNodeMap(allNodes), links: allLinks};
}
