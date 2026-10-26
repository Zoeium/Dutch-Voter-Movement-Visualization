import {describe, expect, it} from 'vitest';
import {buildGradientId, formatElectionLabel, partyButtonClass, sliceByIndexRange} from '@/components/diagramUtils';

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
