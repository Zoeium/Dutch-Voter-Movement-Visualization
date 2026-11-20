import {describe, expect, it, vi} from 'vitest';
import {act, fireEvent, screen} from '@testing-library/react';
import AlluvialDiagram from '@/components/AlluvialDiagram';
import {buildMultiElectionFlows, getPartyDisplayName, loadElections, loadParties} from '@/data/loader';
import {formatElectionLabel} from '@/components/diagramUtils';
import {renderWithLanguage} from './render';
import {resizeAll} from './setup';

const elections = loadElections('nl');
const parties = loadParties('nl');
const labels = elections.map((election) => formatElectionLabel(election.year));

function renderFlows(selectedParty: string | null = null, sortMode?: 'votes' | 'alphabetical') {
  const {nodes, links} = buildMultiElectionFlows(elections, parties, selectedParty);
  return renderWithLanguage(
    <AlluvialDiagram nodes={nodes} links={links} electionLabels={labels} selectedParty={selectedParty} sortMode={sortMode}/>
  );
}

/** Party labels of the first column, top to bottom. */
function firstColumnLabels(container: HTMLElement): string[] {
  const nodes = [...container.querySelectorAll('rect[height]')]
    .filter((rect) => rect.getAttribute('width') === '16')
    .map((rect) => ({x: Number(rect.getAttribute('x')), y: Number(rect.getAttribute('y')), label: rect.nextElementSibling?.textContent ?? ''}));
  const firstX = Math.min(...nodes.map((node) => node.x));
  return nodes.filter((node) => node.x === firstX).sort((a, b) => a.y - b.y).map((node) => node.label);
}

describe('AlluvialDiagram', () => {
  it('draws a column per election with ribbons between them', () => {
    const {container} = renderFlows();
    for (const label of labels) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('path').length).toBeGreaterThan(20);
    expect(container.querySelectorAll('linearGradient').length).toBeGreaterThan(20);
  });

  it('puts non-voters and other parties at the bottom, the rest by votes or by name', () => {
    const byVotes = firstColumnLabels(renderFlows().container);
    expect(byVotes.at(-1)).toBe(getPartyDisplayName('not_voted', parties));
    const {container} = renderFlows(null, 'alphabetical');
    const byName = firstColumnLabels(container).slice(0, -2);
    expect(byName).toEqual(byName.toSorted((a, b) => a.localeCompare(b)));
  });

  it('puts the selected party at the top', () => {
    const {container} = renderFlows('vvd');
    expect(firstColumnLabels(container)[0]).toBe('VVD');
  });

  it('names the votes of each party and flow in its tooltip, and highlights the hovered ones', () => {
    const {container} = renderFlows();
    const node = container.querySelector('rect[width="16"]') as Element;
    expect(node.querySelector('title')?.textContent).toMatch(/^.+: [\d,]+ votes$/);
    const ribbon = container.querySelector('path') as SVGPathElement;
    expect(ribbon.querySelector('title')?.textContent).toMatch(/^.+ → .+: [\d,]+ votes$/);

    fireEvent.mouseEnter(node);
    const faded = [...container.querySelectorAll('rect[width="16"]')].filter((rect) => rect.getAttribute('fill-opacity') === '0.3');
    expect(faded.length).toBeGreaterThan(0);
    fireEvent.mouseLeave(node);

    fireEvent.mouseEnter(ribbon);
    expect(ribbon.getAttribute('fill-opacity')).toBe('0.7');
    fireEvent.mouseLeave(ribbon);
    expect(ribbon.getAttribute('fill-opacity')).toBe('0.35');
  });

  it('follows the width of its container', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const {container} = renderFlows();
    act(() => resizeAll(1800));
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toMatch(/^0 0 1800 /);
  });
});
