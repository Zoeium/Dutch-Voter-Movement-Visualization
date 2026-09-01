export interface PartyInfo {
  party: string;
  display_name: string;
  color: string;
  previous_names?: string[];
}

export interface VoteTotals {
  date: string;
  electorate: number;
  not_voted: number;
  total_votes: number;
  non_valid_votes: number;
  blanco_votes: number;
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
