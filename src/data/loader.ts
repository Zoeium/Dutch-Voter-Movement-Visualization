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

// Every country lives in resources/countries/<id>/ with the same layout:
// country.yaml, parties/*.yaml, coalitions/*.yaml and
// elections/<election id>/vote_totals.yaml (+ optional voters_movement/*.yaml).
const countryModules = import.meta.glob('@/../resources/countries/*/country.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// Flag images are served as files; only their URLs are bundled.
const flagUrls = import.meta.glob('@/../resources/countries/*/flag.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const allPartyModules = import.meta.glob('@/../resources/countries/*/parties/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const allTotalsModules = import.meta.glob('@/../resources/countries/*/elections/*/vote_totals.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const allCoalitionModules = import.meta.glob('@/../resources/countries/*/coalitions/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const allMovementModules = import.meta.glob('@/../resources/countries/*/elections/*/voters_movement/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const allMovementSourceModules = import.meta.glob('@/../resources/countries/*/elections/*/voters_movement/source.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const DEFAULT_PARTY_COLOR = '#6b7280';
const MOVEMENT_SOURCE_PATH_SUFFIX = '/voters_movement/source.yaml';

/** Extract the country id from a resource path. */
function extractCountry(path: string): string {
  const match = /\/countries\/([^/]+)\//.exec(path);
  return match ? match[1] : '';
}

/**
 * Extract an election id from a resource path: the election directory name,
 * usually a year, or YYYY-MM when a country held two elections in one year.
 */
function extractYear(path: string): string {
  const match = /\/elections\/([^/]+)\//.exec(path);
  return match ? match[1] : '';
}

/** The subset of a module group that belongs to one country. */
function modulesForCountry(modules: Record<string, string>, country: string): Record<string, string> {
  return Object.fromEntries(Object.entries(modules).filter(([path]) => extractCountry(path) === country));
}

export interface CountryInfo {
  id: string;
  name: Record<'en' | 'nl', string>;
  /** URL of the country's flag.svg, when it has one. */
  flagUrl?: string;
}

/** List every country that has data, sorted by id. */
export function loadCountries(): CountryInfo[] {
  const flagByCountry = new Map(Object.entries(flagUrls).map(([path, url]) => [extractCountry(path), url]));
  return Object.entries(countryModules)
    .map(([path, raw]) => {
      const id = extractCountry(path);
      const doc = yaml.load(raw) as { name?: Partial<Record<'en' | 'nl', string>> } | null;
      return {
        id,
        name: {en: doc?.name?.en ?? id, nl: doc?.name?.nl ?? doc?.name?.en ?? id},
        flagUrl: flagByCountry.get(id),
      };
    })
    .filter((country) => country.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * True for a movement YAML that carries actual voter-movement data (i.e. not the
 * `source.yaml` citation file). Defined once so the exclusion cannot drift
 * between the visibility check and the loaders.
 */
function isMovementDataFile(path: string): boolean {
  return !path.endsWith(MOVEMENT_SOURCE_PATH_SUFFIX);
}

/** Key for per-country, per-election lookups. */
const electionKey = (country: string, year: string): string => `${country}/${year}`;

// Bucket the movement modules by country and election once, so per-election
// lookups are O(1) instead of re-running the regexes over every module on each call.
const movementFilesByElection = new Map<string, string[]>();
for (const [path, raw] of Object.entries(allMovementModules)) {
  if (!isMovementDataFile(path)) continue;
  const year = extractYear(path);
  if (!year || !raw) continue;

  const key = electionKey(extractCountry(path), year);
  const files = movementFilesByElection.get(key) ?? [];
  files.push(raw);
  movementFilesByElection.set(key, files);
}

// Totals are read by the election loaders, the citation list and the coalition
// date lookup; parse each file once and share the result.
const parsedTotalsByPath = new Map<string, VoteTotals | null>();

/** Parse (once) the vote totals resource at `path`. */
function getParsedTotals(path: string): VoteTotals | null {
  if (!parsedTotalsByPath.has(path)) {
    parsedTotalsByPath.set(path, yaml.load(allTotalsModules[path]) as VoteTotals | null);
  }
  return parsedTotalsByPath.get(path) ?? null;
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
    return nextYear !== undefined && hasOwnMovementData(nextYear);
  });
}

/** Report whether an election has at least one movement data file. */
function hasMovementDataForYear(country: string, year: string): boolean {
  return (movementFilesByElection.get(electionKey(country, year))?.length ?? 0) > 0;
}

/** Return the election years of a country that can participate in the flow diagram. */
function getVisibleElectionYears(country: string): string[] {
  const years = getSortedElectionYears(
    modulesForCountry(allTotalsModules, country),
    modulesForCountry(allMovementModules, country)
  );
  const flags = movementYearFlags(years, (year) => hasMovementDataForYear(country, year));
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

/** Parse all valid party metadata resources of a country. */
export function loadParties(country: string): PartyInfo[] {
  return Object.values(modulesForCountry(allPartyModules, country))
    .map((raw) => yaml.load(raw) as PartyInfo | null | undefined)
    .filter((party): party is PartyInfo => Boolean(party && typeof party.party === 'string'));
}

/**
 * Parse the given election years (totals + movements). Parsing lives here once so
 * `loadElections` and `loadAllElections` cannot drift and each resource is only
 * parsed a single time.
 */
function buildElections(country: string, years: string[]): ElectionYear[] {
  const totalsPathByYear = new Map<string, string>();
  for (const path of Object.keys(modulesForCountry(allTotalsModules, country))) {
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
    const totals = (totalsPath ? getParsedTotals(totalsPath) : null) ?? getDefaultTotals();

    const movements = (movementFilesByElection.get(electionKey(country, year)) ?? [])
      .map((raw) => yaml.load(raw) as VoterMovement | null | undefined)
      .filter((movement): movement is VoterMovement => Boolean(movement && typeof movement.party === 'string'));

    return {year, voteTotals: totals, movements};
  });
}

/**
 * Load a country's elections that have enough movement data for the flow
 * diagram. Empty when no voter movements are known for the country.
 */
export function loadElections(country: string): ElectionYear[] {
  return buildElections(country, getVisibleElectionYears(country));
}

/** Load every election of a country with vote totals for the turnout diagram. */
export function loadAllElections(country: string): ElectionYear[] {
  return buildElections(country, getSortedElectionYears(modulesForCountry(allTotalsModules, country)));
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

// Cache so repeated lookups with the same party array reuse one index.
let cachedParties: PartyInfo[] | null = null;
let cachedIndex: PartyIndex | null = null;

/** Return a party index, rebuilding it only when the party list actually changes. */
function getPartyIndex(parties: PartyInfo[]): PartyIndex {
  if (cachedParties === parties && cachedIndex) {
    return cachedIndex;
  }
  cachedParties = parties;
  cachedIndex = createPartyIndex(parties);
  return cachedIndex;
}

export type DataSourceEntry = {
  year: string;
  fromYear?: string;
  toYear?: string;
  name: string;
  url?: string;
  kind: 'totals' | 'movement';
};

/** Load and deduplicate a country's citations for election totals and movements. */
export function loadDataSources(country: string): DataSourceEntry[] {
  const sources: DataSourceEntry[] = [];
  const electionYears = getVisibleElectionYears(country);
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

  for (const [path, raw] of Object.entries(modulesForCountry(allMovementSourceModules, country))) {
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
  for (const path of Object.keys(modulesForCountry(allTotalsModules, country))) {
    const year = extractYear(path);
    if (!year) continue;

    const source = normalizeDataSource(getParsedTotals(path)?.source);
    if (!source) {
      console.warn(`[loader] Skipping totals source with no resolvable source block: ${path}`);
      continue;
    }

    addUniqueSource(year, 'totals', source);
  }

  return sources.sort((a, b) => a.year.localeCompare(b.year));
}

export interface PartyIndex {
  byKey: Map<string, PartyInfo>;
  byPreviousName: Map<string, PartyInfo>;
  resolveMap: Map<string, string>;
}

/** Build a reusable party lookup index for a dataset without shared module state. */
export function createPartyIndex(parties: PartyInfo[]): PartyIndex {
  const byKey = new Map<string, PartyInfo>();
  const byPreviousName = new Map<string, PartyInfo>();
  const resolveMap = new Map<string, string>();

  for (const party of parties) {
    if (!byKey.has(party.party)) {
      byKey.set(party.party, party);
    }
    if (!resolveMap.has(party.party)) {
      resolveMap.set(party.party, party.party);
    }

    for (const previousName of party.previous_names ?? []) {
      if (!byPreviousName.has(previousName)) {
        byPreviousName.set(previousName, party);
      }
      if (!resolveMap.has(previousName)) {
        resolveMap.set(previousName, party.party);
      }
    }
  }

  return {byKey, byPreviousName, resolveMap};
}

/**
 * Resolve a raw party name to its canonical party ID for color/lookup.
 */
export function resolvePartyName(
  name: string,
  parties: PartyInfo[]
): string {
  const index = getPartyIndex(parties);
  return index.resolveMap.get(name) ?? name;
}

/**
 * Get color for a party name. Resolves through previous_names for color matching.
 */
export function getPartyColor(name: string, parties: PartyInfo[]): string {
  const index = getPartyIndex(parties);

  const exact = index.byKey.get(name);
  if (exact) return exact.color || DEFAULT_PARTY_COLOR;

  const withPreviousName = index.byPreviousName.get(name);
  if (withPreviousName) return withPreviousName.color || DEFAULT_PARTY_COLOR;

  const resolved = index.resolveMap.get(name);
  const party = resolved ? index.byKey.get(resolved) : undefined;
  if (party) return party.color || DEFAULT_PARTY_COLOR;

  return DEFAULT_PARTY_COLOR;
}

/**
 * Get display name for a party. Uses the RAW name as it appeared in the election,
 * NOT the resolved/canonical name.
 */
export function getPartyDisplayName(name: string, parties: PartyInfo[]): string {
  const party = getPartyIndex(parties).byKey.get(name);
  if (party) return party.display_name;

  return name;
}

/**
 * Check if two party names refer to the same party (for selectedParty filtering).
 */
function isSameParty(nameA: string, nameB: string, parties: PartyInfo[]): boolean {
  const index = getPartyIndex(parties);
  return (index.resolveMap.get(nameA) ?? nameA) === (index.resolveMap.get(nameB) ?? nameB);
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
      let value = totals[id] ?? 0;

      if (selectedParty) {
        value = isSource ? (outgoingSums[id] ?? 0) : (incomingSums[id] ?? 0);
      }

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

  const partyIds = collectVisiblePartyIds(parties);
  totals['other'] = Object.entries(partiesVotes).reduce((sum, [party, votes]) => {
    if (party === 'other') return sum + votes;
    if (partyIds.has(party)) return sum;
    return sum + votes;
  }, 0);
  return totals;
}

/** Collect identifiers that have a displayable party definition. */
function collectVisiblePartyIds(parties: PartyInfo[]): Set<string> {
  return new Set(parties.flatMap(({party, previous_names = []}) => [party, ...previous_names]));
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
  const visiblePartySet = collectVisiblePartyIds(parties);

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

/** Election dates (YYYY-MM-DD) in chronological order, read from the totals resources. */
function getElectionDates(country: string): {year: string; date: string}[] {
  return Object.keys(modulesForCountry(allTotalsModules, country))
    .map((path) => {
      const date: unknown = getParsedTotals(path)?.date;
      return {year: extractYear(path), date: typeof date === 'string' ? date : ''};
    })
    .filter((entry) => entry.year && entry.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Parse a country's coalition resources and return them in inauguration order. */
export function loadCoalitions(country: string): CoalitionData[] {
  const electionDates = getElectionDates(country);
  // The election that produced a cabinet's seats is the latest one held before its inauguration.
  const findElectionYear = (inaugurationDate: string): string | undefined => {
    const preceding = electionDates.filter((election) => election.date <= inaugurationDate);
    return preceding[preceding.length - 1]?.year;
  };

  type CoalitionEntry = {
    sortKey: string;
    name: string;
    year: string;
    coalition: string[];
    support: string[];
    seats: Record<string, number>;
  };

  const entries: CoalitionEntry[] = Object.entries(modulesForCountry(allCoalitionModules, country)).map(([path, raw]) => {
    const filenameYear = new RegExp(/(\d{4})\.yaml$/).exec(path)?.[1] || '';
    const data = yaml.load(raw) as {
      inauguration?: unknown;
      name?: unknown;
      coalition?: string[];
      support?: unknown;
      seats?: Record<string, number>;
    } | null;
    const inauguration = typeof data?.inauguration === 'string' ? data.inauguration : '';
    const inaugurationMatch = /^(\d{4})/.exec(inauguration);
    const year = inaugurationMatch ? inaugurationMatch[1] : filenameYear;

    return {
      sortKey: inauguration || year,
      name: typeof data?.name === 'string' ? data.name : '',
      year,
      coalition: data?.coalition || [],
      support: Array.isArray(data?.support)
        ? data.support.filter((party): party is string => typeof party === 'string')
        : [],
      seats: data?.seats || {},
    };
  });

  const sortedEntries = [...entries].sort(
    (a, b) => a.sortKey.localeCompare(b.sortKey) || a.name.localeCompare(b.name)
  );

  return sortedEntries.map((entry) => ({
    name: entry.name,
    year: entry.year,
    electionYear: findElectionYear(entry.sortKey),
    coalition: entry.coalition,
    support: entry.support,
    seats: entry.seats,
  }));
}

/**
 * The first cabinet formed after an election. Its seat snapshot is that
 * election's result; later cabinets in the same term can reflect mid-term splits.
 */
export function getCoalitionForElection(
  electionYear: string,
  coalitions: CoalitionData[]
): CoalitionData | undefined {
  return coalitions.find((coalition) => coalition.electionYear === electionYear);
}

/** Seats produced by an election, taken from the first cabinet formed after it. */
export function getElectionSeats(
  electionYear: string,
  coalitions: CoalitionData[]
): Record<string, number> | null {
  return getCoalitionForElection(electionYear, coalitions)?.seats ?? null;
}

export interface ComparisonRow {
  partyId: string;
  label: string;
  color: string;
  votesA: number;
  votesB: number;
  voteChange: number;
  shareA: number;
  shareB: number;
  shareChange: number;
  seatsA: number | null;
  seatsB: number | null;
  seatChange: number | null;
}

/**
 * Per-party vote, share and seat changes between two elections. Shared by the
 * compare table and its CSV export so both always show the same numbers.
 */
export function buildComparisonRows(
  elections: ElectionYear[],
  yearA: string,
  yearB: string,
  coalitions: CoalitionData[],
  parties: PartyInfo[]
): ComparisonRow[] {
  const elA = elections.find((e) => e.year === yearA);
  const elB = elections.find((e) => e.year === yearB);
  if (!elA || !elB || yearA === yearB) return [];

  const votesA = elA.voteTotals.parties_votes ?? {};
  const votesB = elB.voteTotals.parties_votes ?? {};
  const totalValidA = elA.voteTotals.valid_votes || 1;
  const totalValidB = elB.voteTotals.valid_votes || 1;
  const seatsA = getElectionSeats(yearA, coalitions);
  const seatsB = getElectionSeats(yearB, coalitions);

  const rows: ComparisonRow[] = [];
  for (const partyId of new Set([...Object.keys(votesA), ...Object.keys(votesB)])) {
    const vA = votesA[partyId] ?? 0;
    const vB = votesB[partyId] ?? 0;
    if (vA === 0 && vB === 0) continue;

    // Seat maps only list parties that won seats: missing means 0, unless the
    // election has no seat data at all.
    const sA = seatsA ? (seatsA[partyId] ?? 0) : null;
    const sB = seatsB ? (seatsB[partyId] ?? 0) : null;
    const shareA = (vA / totalValidA) * 100;
    const shareB = (vB / totalValidB) * 100;

    rows.push({
      partyId,
      label: getPartyDisplayName(partyId, parties),
      color: getPartyColor(partyId, parties),
      votesA: vA,
      votesB: vB,
      voteChange: vB - vA,
      shareA,
      shareB,
      shareChange: shareB - shareA,
      seatsA: sA,
      seatsB: sB,
      seatChange: sA !== null && sB !== null ? sB - sA : null,
    });
  }

  return rows;
}
