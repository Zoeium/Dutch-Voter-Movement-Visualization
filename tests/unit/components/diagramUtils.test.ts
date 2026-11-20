import {describe, expect, it} from 'vitest';
import {
  buildGradientId,
  buildRibbonPath,
  buildStripeId,
  defaultRange,
  formatElectionDate,
  formatElectionLabel,
  formatNumber,
  formatPct,
  formatSignedNumber,
  formatSignedPP,
  partyButtonClass,
  scaleToFill,
  sliceByIndexRange,
  sumFlowValues,
  toggleButtonClass,
  zip,
} from '@/components/diagramUtils';

describe('election months in the interface language', () => {
  it('names the month of a second election in a year in English or Dutch', () => {
    expect(formatElectionLabel('1974-02', 'en')).toBe('Feb 1974');
    expect(formatElectionLabel('1974-10', 'nl')).toBe('okt 1974');
  });

  it('formats an election date the same way', () => {
    expect(formatElectionDate('2023-11-22', 'en')).toBe('Nov 2023');
    expect(formatElectionDate('2023-03-15', 'nl')).toBe('mrt 2023');
    expect(formatElectionDate('2023', 'en')).toBe('Jan 2023');
  });
});

describe('defaultRange', () => {
  it('starts every view at the last ten items, or all of them when there are fewer', () => {
    expect(defaultRange(25)).toEqual({start: 15, end: 24});
    expect(defaultRange(4)).toEqual({start: 0, end: 3});
    expect(defaultRange(0)).toEqual({start: 0, end: 0});
  });
});

describe('zip', () => {
  it('pairs items by position, as far as the shorter list goes', () => {
    expect(zip([1, 2, 3], ['a', 'b'])).toEqual([[1, 'a'], [2, 'b']]);
    expect(zip([], ['a'])).toEqual([]);
  });
});

describe('number formatting', () => {
  it('formats counts with thousands separators', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('signs gains but not zero', () => {
    expect(formatSignedNumber(1500)).toBe('+1,500');
    expect(formatSignedNumber(-1500)).toBe('-1,500');
    expect(formatSignedNumber(0)).toBe('0');
    expect(formatSignedPP(1.25)).toBe('+1.3pp');
    expect(formatSignedPP(-0.04)).toBe('-0.0pp');
  });

  it('formats percentages with one decimal', () => {
    expect(formatPct(12.345)).toBe('12.3%');
  });
});

describe('sumFlowValues', () => {
  it('sums the flows leaving and entering each id', () => {
    const flows = [
      {source: 'a', target: 'b', value: 3},
      {source: 'a', target: 'c', value: 2},
      {source: 'b', target: 'c', value: 5},
    ];
    expect(sumFlowValues(flows)).toEqual({outgoing: {a: 5, b: 5}, incoming: {b: 3, c: 7}});
  });
});

describe('buildRibbonPath', () => {
  it('starts at the source band and closes back to it through the target band', () => {
    const path = buildRibbonPath(0, 10, 20, 100, 50, 70);
    expect(path.startsWith('M 0 10 C 50 10, 50 50, 100 50')).toBe(true);
    expect(path).toContain('L 100 70');
    expect(path.endsWith('C 50 70, 50 20, 0 20 Z')).toBe(true);
  });
});

describe('DOM-safe ids and classes', () => {
  it('replaces characters that are not allowed in ids', () => {
    expect(buildStripeId('1974-02', 'a b')).toBe('stripes-1974-02-a-b');
  });

  it('marks the active toggle button', () => {
    expect(toggleButtonClass(true)).toContain('bg-emerald-500');
    expect(toggleButtonClass(false)).not.toContain('bg-emerald-500');
  });
});

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
