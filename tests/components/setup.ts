// Browser features jsdom does not provide, stubbed for the component tests.
import {afterEach, vi} from 'vitest';
import {cleanup} from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The alluvial diagram follows its container's width. Tests resize it with resizeAll().
const observers = new Set<ResizeObserverStub>();
class ResizeObserverStub {
  private readonly targets: Element[] = [];
  constructor(private readonly callback: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(target: Element): void {
    this.targets.push(target);
  }
  disconnect(): void {
    observers.delete(this);
  }
  resize(width: number): void {
    const entries = this.targets.map((target) => ({target, contentRect: {width}}) as unknown as ResizeObserverEntry);
    this.callback(entries, this as unknown as ResizeObserver);
  }
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

/** Report a new width to every observed element. */
export function resizeAll(width: number): void {
  for (const observer of observers) observer.resize(width);
}

// Label widths are measured on a canvas; jsdom has none. 6 px per character is close
// enough to make long names wrap or shorten in narrow blocks.
HTMLCanvasElement.prototype.getContext = function getContext() {
  return {font: '', measureText: (text: string) => ({width: text.length * 6})};
} as unknown as typeof HTMLCanvasElement.prototype.getContext;
