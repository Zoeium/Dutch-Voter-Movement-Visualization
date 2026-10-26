// Hemicycle layout for the coalition explorer: one dot per seat, any chamber size.

export interface PartySeat {
  partyId: string;
  label: string;
  color: string;
  seats: number;
}

export interface ChamberSeat {
  partyId: string;
  label: string;
  color: string;
  selected: boolean;
  x: number;
  y: number;
  row: number;
}

export interface ChamberLayout {
  seats: ChamberSeat[];
  borderRadius: number;
  seatRadius: number;
}

const CHAMBER_CENTER_X = 300;
const CHAMBER_CENTER_Y = 294;
const CHAMBER_INNER_RADIUS = 76;
const CHAMBER_OUTER_RADIUS = 238;
const MAX_SEAT_RADIUS = 5;

/**
 * Seats per row of a hemicycle holding `total` seats: the fewest rows whose arcs fit
 * every seat at the row spacing, with seats spread over the rows in proportion to
 * their length. Works for any chamber size (150 Dutch seats, 736 in the Bundestag).
 */
export function chamberRows(total: number): { radii: number[]; counts: number[]; spacing: number } {
  for (let rows = 2; ; rows++) {
    const spacing = (CHAMBER_OUTER_RADIUS - CHAMBER_INNER_RADIUS) / (rows - 1);
    const radii = Array.from({length: rows}, (_, row) => CHAMBER_INNER_RADIUS + row * spacing);
    const capacities = radii.map((radius) => Math.floor((Math.PI * radius) / spacing) + 1);
    if (capacities.reduce((sum, capacity) => sum + capacity, 0) < total) continue;

    // Largest-remainder share of the seats, never more than a row can hold.
    const radiusSum = radii.reduce((sum, radius) => sum + radius, 0);
    const exact = radii.map((radius) => (total * radius) / radiusSum);
    const counts = exact.map((share, row) => Math.min(capacities[row], Math.floor(share)));
    const byRemainder = exact.map((share, row) => ({row, remainder: share - Math.floor(share)}))
      .sort((a, b) => b.remainder - a.remainder);
    let missing = total - counts.reduce((sum, count) => sum + count, 0);
    while (missing > 0) {
      for (const {row} of byRemainder) {
        if (missing > 0 && counts[row] < capacities[row]) {
          counts[row]++;
          missing--;
        }
      }
    }
    return {radii, counts, spacing};
  }
}

export function createChamberLayout(parties: PartySeat[], selectedParties: Set<string>): ChamberLayout {
  const positions: {x: number; y: number; row: number; angle: number}[] = [];
  const selectedSeats = parties.filter((party) => selectedParties.has(party.partyId)).flatMap((party) =>
    Array.from({length: party.seats}, () => ({
      partyId: party.partyId,
      label: party.label,
      color: party.color,
      selected: true,
    }))
  );
  const emptySeats = parties.filter((party) => !selectedParties.has(party.partyId)).flatMap((party) =>
    Array.from({length: party.seats}, () => ({
      partyId: party.partyId,
      label: party.label,
      color: party.color,
      selected: false,
    }))
  );
  const partySeats = [...selectedSeats, ...emptySeats];
  if (partySeats.length === 0) {
    return {seats: [], borderRadius: CHAMBER_OUTER_RADIUS, seatRadius: MAX_SEAT_RADIUS};
  }

  const {radii, counts, spacing} = chamberRows(partySeats.length);
  radii.forEach((radius, row) => {
    const rowCount = counts[row];
    for (let position = 0; position < rowCount; position++) {
      const angle = Math.PI - (Math.PI * position) / Math.max(rowCount - 1, 1);
      positions.push({
        x: CHAMBER_CENTER_X + radius * Math.cos(angle),
        y: CHAMBER_CENTER_Y - radius * Math.sin(angle),
        row,
        angle,
      });
    }
  });

  // Hand out seats by angle, from the left, so each party fills a wedge of the chamber.
  positions.sort((a, b) => b.angle - a.angle || a.row - b.row);
  const seats = positions.map(({x, y, row}, index) => ({...partySeats[index], x, y, row}));
  const seatRadius = Math.min(MAX_SEAT_RADIUS, spacing * 0.4);

  return {seats, borderRadius: CHAMBER_OUTER_RADIUS + spacing / 2 + seatRadius, seatRadius};
}

