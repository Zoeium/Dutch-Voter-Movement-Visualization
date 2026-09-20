import * as yaml from 'js-yaml';
import type {
  DiagramLink,
  DiagramNode,
  ElectionYear,
  Flow,
  PartyInfo,
  VoterMovement,
  VoteTotals,
  CoalitionData,
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

// Auto-discover coalition data
const coalitionModules = import.meta.glob('@/../resources/coalitions/*.yaml', {
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

const DEFAULT_PARTY_COLOR = '#6b7280';
const MOVEMENT_SOURCE_PATH_SUFFIX = '/voters_movement/source.yaml';

/** Extract an election year from a resource path. */
function extractYear(path: string): string {
  const match = /\/elections\/(\d{4})\//.exec(path);
  return match ? match[1] : '';
}

/**
 * True for a movement YAML that carries actual voter-movement data (i.e. not the
 * `source.yaml` citation file). Defined once so the exclusion cannot drift
 * between the visibility check and the loaders.
 */
function isMovementDataFile(path: string): boolean {
  return !path.endsWith(MOVEMENT_SOURCE_PATH_SUFFIX);
}

// Bucket the movement modules by election year once, so per-year lookups are O(1)
// instead of re-running the year regex over every module on each call.
const movementFilesByYear = new Map<string, string[]>();
for (const [path, raw] of Object.entries(movementModules)) {
  if (!isMovementDataFile(path)) continue;
  const year = extractYear(path);
  if (!year || !raw) continue;

  const files = movementFilesByYear.get(year) ?? [];
  files.push(raw);
  movementFilesByYear.set(year, files);
}

/** Collect unique election years from module groups in chronological order. */
function getSortedElectionYears(...moduleGroups: Record<string, string>[]): string[] {
  return Array.from(
    new Set(
      moduleGroups
        .flatMap((moduleGroup) => Object.keys(moduleGroup))
        .map((path) => extractYear(path))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

/**
 * The single "does this year participate in the flow diagram" rule: a year is
 * included when it has movement data of its own, or when the NEXT year does
 * (voters moving INTO the next election are what the diagram renders). Defined
 * once over a year list so the loader and the flow builder cannot drift.
 */
function movementYearFlags(
  years: string[],
  hasOwnMovementData: (year: string) => boolean
): boolean[] {
  return years.map((year, index) => {
    if (hasOwnMovementData(year)) return true;
    const nextYear = years[index + 1];
    return !nextYear || hasOwnMovementData(nextYear);
  });
}

/** Report whether an election year has at least one movement data file. */
function hasMovementDataForYear(year: string): boolean {
  return (movementFilesByYear.get(year)?.length ?? 0) > 0;
}

/** Return the election years that can participate in the flow diagram. */
function getVisibleElectionYears(): string[] {
  const years = getSortedElectionYears(totalsModules, movementModules);
  const flags = movementYearFlags(years, hasMovementDataForYear);
  return years.filter((_, index) => flags[index]);
}

/** Create empty vote totals for an election with a missing totals resource. */
function getDefaultTotals(): VoteTotals {
  return {
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
}

/** Parse all valid party metadata resources. */
export function loadParties(): PartyInfo[] {
  return Object.values(partyModules)
    .map((raw) => yaml.load(raw) as PartyInfo | null | undefined)
    .filter((party): party is PartyInfo => Boolean(party && typeof party.party === 'string'));
}

/**
 * Parse the given election years (totals + movements). Parsing lives here once so
 * `loadElections` and `loadAllElections` cannot drift and each resource is only
 * parsed a single time.
 */
function buildElections(years: string[]): ElectionYear[] {
  const totalsPathByYear = new Map<string, string>();
  for (const path of Object.keys(totalsModules)) {
    const year = extractYear(path);
    if (year && !totalsPathByYear.has(year)) {
      totalsPathByYear.set(year, path);
    }
  }

  return years.map((year) => {
    const totalsPath = totalsPathByYear.get(year);
    if (!totalsPath) {
      // Movement data without a totals file yields an all-zero VoteTotals, which
      // would silently drop every flow - surface the broken year instead.
      console.warn(`[loader] Missing vote_totals.yaml for election year ${year}`);
    }
    const totals = totalsPath ? (yaml.load(totalsModules[totalsPath]) as VoteTotals) : getDefaultTotals();

    const movements = (movementFilesByYear.get(year) ?? [])
      .map((raw) => yaml.load(raw) as VoterMovement | null | undefined)
      .filter((movement): movement is VoterMovement => Boolean(movement && typeof movement.party === 'string'));

    return {year, voteTotals: totals, movements};
  });
}

/** Load elections that have enough movement data for the flow diagram. */
export function loadElections(): ElectionYear[] {
  return buildElections(getVisibleElectionYears());
}

/** Load every election with vote totals for the turnout diagram. */
export function loadAllElections(): ElectionYear[] {
  return buildElections(getSortedElectionYears(totalsModules));
}

/**
 * Only http(s) URLs are safe to render into an `<a href>`; anything else (e.g. a
 * crafted `javascript:`/`data:` value) is dropped so the caller falls back to
 * plain text.
 */
function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
}

/** Normalize a YAML source value into a safe, structured citation. */
function normalizeDataSource(source: unknown): {name: string; url: string} | null {
  if (typeof source === 'string') {
    return source ? {name: source, url: ''} : null;
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
    url: sanitizeUrl(typeof record.url === 'string' ? record.url : ''),
  };
}

export type DataSourceEntry = {
  year: string;
  fromYear?: string;
  toYear?: string;
  name: string;
  url?: string;
  kind: 'totals' | 'movement';
};

/** Load and deduplicate citations for election totals and movements. */
export function loadDataSources(): DataSourceEntry[] {
  const sources: DataSourceEntry[] = [];
  const electionYears = getVisibleElectionYears();
  const visibleYearSet = new Set(electionYears);
  const previousYearByYear = new Map<string, string | undefined>();

  electionYears.forEach((year, index) => {
    previousYearByYear.set(year, index > 0 ? electionYears[index - 1] : undefined);
  });

  const addUniqueSource = (
    year: string,
    kind: DataSourceEntry['kind'],
    source: {name: string; url: string},
    fromYear?: string,
    toYear?: string
  ) => {
    const alreadyExists = sources.some(
      (item) => item.year === year && item.kind === kind && item.name === source.name
    );

    if (alreadyExists) {
      return;
    }

    sources.push({
      year,
      fromYear,
      toYear,
      kind,
      name: source.name,
      url: source.url || undefined,
    });
  };

  for (const [path, raw] of Object.entries(movementSourceModules)) {
    const year = extractYear(path);
    if (!year || !visibleYearSet.has(year)) continue;

    const doc = yaml.load(raw) as { source?: unknown; from_year?: string; to_year?: string } | null;
    const source = normalizeDataSource(doc?.source);
    if (!source) {
      console.warn(`[loader] Skipping movement source with no resolvable source block: ${path}`);
      continue;
    }

    const fromYear = doc?.from_year ?? previousYearByYear.get(year) ?? year;
    const toYear = doc?.to_year ?? year;
    addUniqueSource(year, 'movement', source, fromYear, toYear);
  }

  // Load totals for all years (not just visible years)
  for (const [path, raw] of Object.entries(totalsModules)) {
    const year = extractYear(path);
    if (!year) continue;

    const doc = yaml.load(raw) as { source?: unknown } | null;
    const source = normalizeDataSource(doc?.source);
    if (!source) {
      console.warn(`[loader] Skipping totals source with no resolvable source block: ${path}`);
      continue;
    }

    addUniqueSource(year, 'totals', source);
  }

  return sources.sort((a, b) => a.year.localeCompare(b.year));
}

// Party lookups are linear scans per node/link otherwise; build name-keyed maps
// once per `parties` array (the array is loaded once and passed around as-is).
let cachedParties: PartyInfo[] | null = null;
const partyByKey = new Map<string, PartyInfo>();
const partyByPreviousName = new Map<string, PartyInfo>();
const partyResolveMap = new Map<string, string>();

/** Rebuild party lookup caches when the party array identity changes. */
function ensurePartyCache(parties: PartyInfo[]): void {
  if (cachedParties === parties) return;

  cachedParties = parties;
  partyByKey.clear();
  partyByPreviousName.clear();
  partyResolveMap.clear();

  for (const party of parties) {
    if (!partyByKey.has(party.party)) {
      partyByKey.set(party.party, party);
    }
    // First party (in array order) that claims a name - either as its own id or as
    // a previous name - wins, mirroring the original linear-scan semantics.
    if (!partyResolveMap.has(party.party)) {
      partyResolveMap.set(party.party, party.party);
    }
    for (const previousName of party.previous_names ?? []) {
      if (!partyByPreviousName.has(previousName)) {
        partyByPreviousName.set(previousName, party);
      }
      if (!partyResolveMap.has(previousName)) {
        partyResolveMap.set(previousName, party.party);
      }
    }
  }
}

/**
 * Resolve a raw party name to its canonical party ID for color/lookup.
 */
export function resolvePartyName(
  name: string,
  parties: PartyInfo[]
): string {
  ensurePartyCache(parties);
  return partyResolveMap.get(name) ?? name;
}

/**
 * Get color for a party name. Resolves through previous_names for color matching.
 */
export function getPartyColor(name: string, parties: PartyInfo[]): string {
  ensurePartyCache(parties);

  // Prefer exact match (party had same id in this election)
  const exact = partyByKey.get(name);
  if (exact) return exact.color || DEFAULT_PARTY_COLOR;

  // If this name appears as a previous name for some canonical party, try to use
  // the historical party's own color file (if present). Fall back to the canonical party color.
  const withPreviousName = partyByPreviousName.get(name);
  if (withPreviousName) {
    const historical = partyByKey.get(name);
    if (historical) return historical.color || DEFAULT_PARTY_COLOR;
    return withPreviousName.color || DEFAULT_PARTY_COLOR;
  }

  // Last resort: resolve to canonical and return that color if available
  const resolved = partyResolveMap.get(name);
  const party = resolved ? partyByKey.get(resolved) : undefined;
  if (party) return party.color || DEFAULT_PARTY_COLOR;

  return DEFAULT_PARTY_COLOR;
}

/**
 * Get display name for a party. Uses the RAW name as it appeared in the election,
 * NOT the resolved/canonical name.
 */
export function getPartyDisplayName(name: string, parties: PartyInfo[]): string {
  ensurePartyCache(parties);

  const party = partyByKey.get(name);
  if (party) return party.display_name;

  return name;
}

/**
 * Check if two party names refer to the same party (for selectedParty filtering).
 */
function isSameParty(nameA: string, nameB: string, parties: PartyInfo[]): boolean {
  return resolvePartyName(nameA, parties) === resolvePartyName(nameB, parties);
}

/** Decide whether a flow matches the optional selected-party filter. */
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

/** Convert movement percentages for an election pair into vote-count flows. */
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

    const sourceMap = movement.vote_last_election_in_percentile;
    if (!sourceMap) continue;

    for (const [sourceName, pct] of Object.entries(sourceMap)) {
      if (!shouldIncludeFlow(sourceName, targetParty, selectedParty, parties)) continue;

      const value = Math.round((pct / 100) * targetVotes);
      if (value > 0) {
        flows.push({source: sourceName, target: targetParty, value});
      }
    }
  }

  return flows;
}

/** Build diagram nodes for one source or target election column. */
function buildColumnNodes(
  ids: Set<string>,
  columnIndex: number,
  totals: Record<string, number>,
  flows: Flow[],
  parties: PartyInfo[],
  selectedParty: string | null,
  isSource: boolean
): DiagramNode[] {
  // Sum outgoing/incoming flow values once instead of filtering `flows` per node.
  const outgoingSums: Record<string, number> = {};
  const incomingSums: Record<string, number> = {};
  for (const flow of flows) {
    outgoingSums[flow.source] = (outgoingSums[flow.source] ?? 0) + flow.value;
    incomingSums[flow.target] = (incomingSums[flow.target] ?? 0) + flow.value;
  }

  return Array.from(ids)
    .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))
    .map((id) => {
      const value = !selectedParty
        ? (totals[id] ?? 0)
        : (isSource ? outgoingSums[id] ?? 0 : incomingSums[id] ?? 0);

      return {
        id: `${columnIndex}:${id}`,
        label: getPartyDisplayName(id, parties),
        color: getPartyColor(id, parties),
        columnIndex,
        value,
      };
    });
}

/** Convert party flows into links between column-scoped node identifiers. */
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

/** Merge duplicate diagram nodes while retaining the largest value. */
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

/** Build party totals for a column, including abstentions and unknown parties. */
function getTotals(electionYear: ElectionYear, parties: PartyInfo[]) {
  const partiesVotes = electionYear.voteTotals.parties_votes ?? {};
  const totals = {...partiesVotes} as Record<string, number>;
  totals['not_voted'] = electionYear.voteTotals.not_voted ?? 0;

  const partyIds = new Set(parties.map((party) => party.party));
  totals['other'] = Object.entries(partiesVotes).reduce((sum, [party, votes]) => {
    if (party === 'other') return sum + votes;
    if (partyIds.has(party)) return sum;
    return sum + votes;
  }, 0);
  return totals;
}

/** Collect party identifiers explicitly represented in movement resources. */
function collectVisiblePartyIds(elections: ElectionYear[]): Set<string> {
  const visiblePartySet = new Set<string>();

  for (const election of elections) {
    for (const movement of election.movements) {
      if (!movement) continue;
      visiblePartySet.add(movement.party);

      const sourceMap = movement.vote_last_election_in_percentile;
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

/** Aggregate flows for unrepresented parties into the synthetic other party. */
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

/** Collect the source and target identifiers present in a set of flows. */
function collectFlowIds(flows: Flow[]): { sourceIds: Set<string>; targetIds: Set<string> } {
  const sourceIds = new Set<string>();
  const targetIds = new Set<string>();

  // Ids come only from the (already remapped) flows, so a ribbon-less `'other'`
  // block is not added to columns where nothing was actually remapped to it.
  for (const flow of flows) {
    sourceIds.add(flow.source);
    targetIds.add(flow.target);
  }

  return {sourceIds, targetIds};
}

/** Build nodes and links for one transition between adjacent elections. */
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
  const {sourceIds, targetIds} = collectFlowIds(remappedFlows);

  return {
    nodes: [
      ...buildColumnNodes(sourceIds, fromCol, fromTotals, remappedFlows, parties, selectedParty, true),
      ...buildColumnNodes(targetIds, toCol, toTotals, remappedFlows, parties, selectedParty, false),
    ],
    links: buildLinks(remappedFlows, fromCol, toCol, parties),
  };
}

/** Build the complete multi-election node and link graph. */
export function buildMultiElectionFlows(
  elections: ElectionYear[],
  parties: PartyInfo[],
  selectedParty: string | null,
): { nodes: DiagramNode[]; links: DiagramLink[] } {
  const years = elections.map((election) => election.year);
  const movementsByYear = new Map(
    elections.map((election) => [election.year, election.movements.length > 0] as const)
  );
  const flags = movementYearFlags(years, (year) => movementsByYear.get(year) ?? false);
  const visibleElections = elections.filter((_, index) => flags[index]);

  if (visibleElections.length < 2) {
    return {nodes: [], links: []};
  }

  const allNodes: DiagramNode[] = [];
  const allLinks: DiagramLink[] = [];
  const visiblePartySet = collectVisiblePartyIds(visibleElections);

  for (let i = 0; i < visibleElections.length - 1; i++) {
    const step = buildStepNodesAndLinks(
      visibleElections[i],
      visibleElections[i + 1],
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

/** Parse coalition resources and return them in inauguration order. */
export function loadCoalitions(): CoalitionData[] {
  const entries = Object.entries(coalitionModules).map(([path, raw]) => {
    const filenameYear = new RegExp(/(\d{4})\.yaml$/).exec(path)?.[1] || '';
    const data = yaml.load(raw) as {
      inauguration?: unknown;
      name?: unknown;
      coalition?: string[];
      support?: unknown;
      seats?: Record<string, number>;
    } | null;
    // Each coalition file carries an `inauguration` date (YYYY-MM-DD), which is
    // used to derive the year for sorting and column labels. Fall back to the
    // four-digit year encoded in the filename for files without the field.
    const inauguration = typeof data?.inauguration === 'string' ? data.inauguration : '';
    const inaugurationMatch = /^(\d{4})/.exec(inauguration);
    const year = inaugurationMatch ? inaugurationMatch[1] : filenameYear;
    return {
      // Sort on the full inauguration date, not just the year: several coalitions
      // share a year, and Van Agt III (1982-05-29) must precede Lubbers I
      // (1982-11-04). Falls back to the year for files without a date.
      sortKey: inauguration || year,
      name: typeof data?.name === 'string' ? data.name : '',
      year,
      coalition: data?.coalition || [],
      // Parties that tolerated the coalition without joining it (gedoogpartners).
      support: Array.isArray(data?.support)
        ? data.support.filter((party): party is string => typeof party === 'string')
        : [],
      seats: data?.seats || {},
    };
  });

  return entries
    .toSorted((a, b) => a.sortKey.localeCompare(b.sortKey) || a.name.localeCompare(b.name))
    .map((entry) => ({
      name: entry.name,
      year: entry.year,
      coalition: entry.coalition,
      support: entry.support,
      seats: entry.seats,
    }));
}
