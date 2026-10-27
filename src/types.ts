export interface PartyInfo {
  party: string;
  display_name: string;
  color: string;
  /** Predecessors this party continues or merged: renamed parties and mergers. */
  previous_names?: string[];
  /** Parties this party split off from. */
  split_off?: string[];
  /**
   * Parties that temporarily ran together as this joint list or alliance, and may run
   * separately again afterwards (e.g. an electoral alliance).
   */
  alliance_of?: string[];
  /** Parties this party (re)joined when it ended, e.g. after a temporary split. */
  rejoined?: string[];
}

export interface DataSource {
  name: string;
  url: string;
}

export interface VoteTotals {
  date: string;
  source: DataSource;
  electorate: number;
  not_voted: number;
  total_votes: number;
  non_valid_votes: number;
  blanco_votes: number;
  non_valid_votes_and_blanco_votes?: number;
  valid_votes: number;
  parties_votes: Record<string, number>;
}

export interface VoterMovement {
  party: string;
  vote_last_election_in_percentile: Record<string, number>;
}

export interface ElectionYear {
  year: string;
  voteTotals: VoteTotals;
  movements: VoterMovement[];
}

export interface Flow {
  source: string;
  target: string;
  value: number;
}

export interface DiagramNode {
  id: string;
  label: string;
  color: string;
  columnIndex: number;
  value: number;
}

export interface DiagramLink {
  source: string;
  target: string;
  value: number;
  color: string;
}

export interface CoalitionData {
  name: string;
  /** Inauguration year of the cabinet. */
  year: string;
  /** Year of the election whose result the seats reflect. */
  electionYear?: string;
  coalition: string[];
  support?: string[];
  seats: Record<string, number>;
}
