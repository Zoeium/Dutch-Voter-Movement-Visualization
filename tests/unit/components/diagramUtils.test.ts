import {describe, expect, it} from 'vitest';
import {
  buildGradientId,
  formatElectionLabel,
  partyButtonClass,
  scaleToFill,
  sliceByIndexRange,
} from '@/components/diagramUtils';

describe('scaleToFill', () => {
  const MIN = 12;
  const heights = (seats: number[], scale: number) => seats.map((s) => Math.max(MIN, s * scale));
  const total = (values: number[]) => values.reduce((sum, value) => sum + value, 0);

  it('scales by seats when no block needs raising', () => {
    expect(scaleToFill([30, 70], 200, MIN)).toBeCloseTo(2);
  });

  it('raises small blocks and lets the others fill the rest exactly', () => {
    const seats = [100, 40, 2, 1];
    const scale = scaleToFill(seats, 300, MIN);
    expect(total(heights(seats, scale))).toBeCloseTo(300);
    expect(heights(seats, scale).slice(2)).toEqual([MIN, MIN]);
  });

  it('can settle below the scale at which a small block first fits', () => {
    // At 12.65 px/seat the 1-seat block just fits without raising; filling the column
    // then needs a slightly lower scale. Stopping at 12.65 overshoots the column.
    const seats = [29, 1];
    const scale = scaleToFill(seats, 378.94, MIN);
    expect(total(heights(seats, scale))).toBeCloseTo(378.94);
    expect(scale).toBeCloseTo(378.94 / 30);
  });

  it('fills random columns exactly', () => {
    for (let run = 0; run < 500; run += 1) {
      const seats = Array.from({length: 1 + (run % 12)}, (_, i) => 1 + ((run * 37 + i * 53) % 150));
      const target = total(heights(seats, 0)) + (run % 7) * 40 + 5;
      expect(total(heights(seats, scaleToFill(seats, target, MIN)))).toBeCloseTo(target);
    }
  });

  it('returns 0 without seats', () => {
    expect(scaleToFill([], 100, MIN)).toBe(0);
  });
});

describe('formatElectionLabel', () => {
  it('shows a plain year unchanged', () => {
    expect(formatElectionLabel('2021')).toBe('2021');
  });

  it('shows a YYYY-MM id as month and year', () => {
    expect(formatElectionLabel('1974-02')).toBe('Feb 1974');
    expect(formatElectionLabel('1974-10')).toBe('Oct 1974');
  });

  it('leaves anything it cannot read unchanged', () => {
    expect(formatElectionLabel('1974-13')).toBe('1974-13');
    expect(formatElectionLabel('')).toBe('');
  });
});

describe('sliceByIndexRange', () => {
  it('keeps the inclusive index range', () => {
    expect(sliceByIndexRange(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['b', 'c']);
    expect(sliceByIndexRange(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('buildGradientId', () => {
  it('produces an id that is safe in url(#...)', () => {
    expect(buildGradientId('1:Party A', 'b/c', 2)).toBe('grad-1-Party-A-b-c-2');
  });
});

describe('partyButtonClass', () => {
  it('adds the ring with the given offset only when selected', () => {
    expect(partyButtonClass(true, 'ring-offset-app-bg')).toContain('ring-2 ring-offset-2 ring-offset-app-bg');
    expect(partyButtonClass(false, 'ring-offset-app-bg')).not.toContain('ring-2');
  });
});
