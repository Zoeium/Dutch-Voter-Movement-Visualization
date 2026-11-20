import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {copyShareUrl, exportCsv, exportSvg, updateUrl} from '@/utils/export';

const revokeObjectURL = vi.fn<(url: string) => void>();

/** Capture what a download would save: the file name and the file's text. */
function captureDownloads() {
  const files: {name: string; blob: Blob}[] = [];
  let blob: Blob | undefined;
  URL.createObjectURL = vi.fn((value: Blob) => {
    blob = value;
    return 'blob:test';
  });
  URL.revokeObjectURL = revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
    if (blob) files.push({name: this.download, blob});
  });
  return files;
}

describe('updateUrl', () => {
  beforeEach(() => window.history.replaceState({}, '', '/app/'));

  it('writes the state into the URL, leaving out empty values', () => {
    updateUrl({tab: 'compare', party: null});
    expect(window.location.search).toBe('?tab=compare');
    updateUrl({party: null});
    expect(window.location.search).toBe('');
  });

  it('leaves the URL alone when it already matches', () => {
    updateUrl({tab: 'turnout'});
    const replace = vi.spyOn(window.history, 'replaceState');
    updateUrl({tab: 'turnout'});
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps going when the browser refuses the update', () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('too many calls');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => updateUrl({tab: 'home'})).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe('copyShareUrl', () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();
  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
    window.history.replaceState({}, '', '/app/');
  });

  it('copies the URL with the state', async () => {
    writeText.mockResolvedValue();
    await expect(copyShareUrl({tab: 'compare'})).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/app/?tab=compare`);
    await copyShareUrl({});
    expect(writeText).toHaveBeenLastCalledWith(`${window.location.origin}/app/`);
  });

  it('reports a failed copy', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    await expect(copyShareUrl({tab: 'home'})).resolves.toBe(false);
  });
});

describe('exportCsv', () => {
  afterEach(() => vi.useRealTimers());

  it('downloads the rows, quoting cells that need it', async () => {
    vi.useFakeTimers();
    const files = captureDownloads();
    exportCsv(['Party', 'Votes'], [['VVD', 100], ['a, "b"', 2]], 'compare.csv');
    expect(files[0]?.name).toBe('compare.csv');
    expect(await files[0]?.blob.text()).toBe('Party,Votes\nVVD,100\n"a, ""b""",2');
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});

describe('exportSvg', () => {
  it('downloads the chart with its colours and a background', async () => {
    const files = captureDownloads();
    document.documentElement.style.setProperty('--c-bg-card', '#123456');
    document.body.innerHTML = '<svg viewBox="0 0 200 100"><rect fill="red" width="10" height="10"/></svg>';
    const svg = document.querySelector('svg') as SVGSVGElement;

    exportSvg(svg, 'chart.svg');

    expect(files[0]?.name).toBe('chart.svg');
    const text = await files[0]?.blob.text();
    expect(text).toContain('width="200px"');
    expect(text).toContain('fill="#123456"');
    expect(text).toContain('--c-bg-card: #123456');
  });

  it('exports a chart without a viewBox as it is', async () => {
    const files = captureDownloads();
    document.body.innerHTML = '<svg><circle r="3"/></svg>';
    exportSvg(document.querySelector('svg') as SVGSVGElement, 'plain.svg');
    const text = await files[0]?.blob.text();
    expect(text).toContain('<circle');
    expect(text).not.toContain('<rect');
  });
});
