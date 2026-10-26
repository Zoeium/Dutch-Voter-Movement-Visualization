import {describe, expect, it} from 'vitest';
import {stateToSearchParams} from '@/utils/export';

describe('stateToSearchParams', () => {
  it('serialises values and leaves out empty ones', () => {
    expect(stateToSearchParams({tab: 'compare', ys: 0, party: null, cmpA: '', dark: true})).toBe('tab=compare&ys=0&dark=true');
  });

  it('encodes values that need escaping', () => {
    expect(stateToSearchParams({name: 'a b&c'})).toBe('name=a+b%26c');
  });
});
