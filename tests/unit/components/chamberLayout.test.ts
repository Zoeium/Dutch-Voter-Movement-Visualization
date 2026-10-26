import {describe, expect, it} from 'vitest';
import {chamberRows, createChamberLayout, type PartySeat} from '@/components/chamberLayout';

const party = (partyId: string, seats: number): PartySeat => ({partyId, label: partyId, color: '#000000', seats});

describe('chamberRows', () => {
  // Regression: the old fixed layout held at most 162 seats.
  it.each([150, 230, 349, 630, 650, 736])('places all %i seats', (total) => {
    const {counts} = chamberRows(total);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(total);
  });

  it('gives longer outer rows more seats', () => {
    const {counts} = chamberRows(650);
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
  });
});

describe('createChamberLayout', () => {
  const parties = [party('a', 400), party('b', 200), party('c', 50)];

  it('draws one dot per seat, also for large chambers', () => {
    expect(createChamberLayout(parties, new Set()).seats).toHaveLength(650);
  });

  it('colours exactly the seats of the selected parties', () => {
    const selected = createChamberLayout(parties, new Set(['b', 'c'])).seats.filter((seat) => seat.selected);
    expect(selected).toHaveLength(250);
    expect(new Set(selected.map((seat) => seat.partyId))).toEqual(new Set(['b', 'c']));
  });

  it('changes the coloured seats when the selection changes', () => {
    const count = (ids: string[]) => createChamberLayout(parties, new Set(ids)).seats.filter((seat) => seat.selected).length;
    expect([count([]), count(['c']), count(['a']), count(['a', 'b', 'c'])]).toEqual([0, 50, 400, 650]);
  });

  it('keeps every dot inside the drawing', () => {
    const {seats, borderRadius} = createChamberLayout(parties, new Set());
    expect(borderRadius).toBeLessThanOrEqual(300);
    for (const seat of seats) {
      expect(seat.x).toBeGreaterThanOrEqual(0);
      expect(seat.x).toBeLessThanOrEqual(600);
      expect(seat.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('handles an empty chamber', () => {
    expect(createChamberLayout([], new Set()).seats).toEqual([]);
  });
});
