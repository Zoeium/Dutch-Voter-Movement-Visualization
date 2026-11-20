import {describe, expect, it, vi} from 'vitest';
import {fireEvent, screen} from '@testing-library/react';
import TurnoutDiagram from '@/components/TurnoutDiagram';
import {loadAllElections} from '@/data/loader';
import {en, renderWithLanguage} from './render';

const EMERALD = '#10b981';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const SLATE = '#475569';

const segments = (container: HTMLElement, color: string) =>
  [...container.querySelectorAll<SVGRectElement>(`rect[fill="${color}"]`)];

describe('TurnoutDiagram', () => {
  it('shows a note without data', () => {
    renderWithLanguage(<TurnoutDiagram elections={[]}/>);
    expect(screen.getByText(en('noTurnoutData'))).toBeTruthy();
  });

  it('stacks valid, blank, invalid votes and non-voters per election', () => {
    const elections = loadAllElections('nl');
    const {container} = renderWithLanguage(<TurnoutDiagram elections={elections}/>);
    for (const color of [EMERALD, AMBER, RED, SLATE]) {
      expect(segments(container, color).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(en('numberVotes'))).toBeTruthy();
  });

  it('switches to a percentage scale and hides categories', () => {
    const {container} = renderWithLanguage(<TurnoutDiagram elections={loadAllElections('nl')}/>);
    fireEvent.click(screen.getByText(en('percentage')));
    expect(screen.getByText(en('pctOfElectorate'))).toBeTruthy();
    expect(screen.getAllByText('100.0%').length).toBeGreaterThan(0);

    for (const key of ['validVotes', 'blanco', 'invalid', 'didNotVote'] as const) {
      fireEvent.click(screen.getByText(en(key)));
    }
    expect(segments(container, EMERALD)).toHaveLength(0);
    expect(segments(container, SLATE)).toHaveLength(0);

    fireEvent.click(screen.getByText(en('validVotes')));
    fireEvent.click(screen.getByText(en('absolute')));
    expect(segments(container, EMERALD).length).toBeGreaterThan(0);
  });

  it('names each segment in its tooltip, and highlights the hovered bar and segment', () => {
    const {container} = renderWithLanguage(<TurnoutDiagram elections={loadAllElections('nl')}/>);
    // The latest election reports blank and invalid votes separately.
    const valid = segments(container, EMERALD).at(-1) as SVGRectElement;
    const bar = valid.closest('g') as SVGGElement;
    const title = (color: string) => bar.querySelector(`rect[fill="${color}"] > title`)?.textContent ?? '';

    expect(title(EMERALD)).toMatch(new RegExp(String.raw`^2025 ${en('election')}\n${en('electorate')}: [\d,]+\n`));
    expect(title(EMERALD)).toContain(en('validOfCast'));
    expect(title(AMBER)).toMatch(new RegExp(String.raw`\n${en('blanco')}: [\d,]+$`));
    expect(title(RED)).toMatch(new RegExp(String.raw`\n${en('invalid')}: [\d,]+$`));
    expect(title(SLATE)).toMatch(new RegExp(String.raw`\n${en('didNotVote')}: [\d,]+ \(`));

    fireEvent.mouseEnter(bar);
    fireEvent.mouseEnter(valid);
    expect(valid.getAttribute('fill-opacity')).toBe('1');
    const otherBar = segments(container, EMERALD)[0]?.closest('g') as SVGGElement;
    expect(otherBar.style.opacity).toBe('0.4');
    fireEvent.mouseLeave(bar);
    expect(otherBar.style.opacity).toBe('1');
  });

  it('marks elections where blank and invalid votes were counted together', () => {
    const {container} = renderWithLanguage(<TurnoutDiagram elections={loadAllElections('de')}/>);
    expect(screen.getByText(en('blancoBeforeNote'))).toBeTruthy();
    expect(container.querySelectorAll('pattern').length).toBeGreaterThan(0);
    const combined = segments(container, AMBER)[0] as SVGRectElement;
    expect(combined.querySelector('title')?.textContent).toContain(en('blancoInvalidCombined'));
  });

  it('starts with a given view and reports changes to it', () => {
    const onViewChange = vi.fn();
    const {container} = renderWithLanguage(
      <TurnoutDiagram elections={loadAllElections('nl')} view={{scale: 'percentage', hidden: ['notVoted']}} onViewChange={onViewChange}/>
    );
    expect(screen.getByText(en('pctOfElectorate'))).toBeTruthy();
    expect(segments(container, SLATE)).toHaveLength(0);

    fireEvent.click(screen.getByText(en('didNotVote')));
    expect(onViewChange).toHaveBeenLastCalledWith({scale: 'percentage', hidden: []});
    fireEvent.click(screen.getByText(en('invalid')));
    expect(onViewChange).toHaveBeenLastCalledWith({scale: 'percentage', hidden: ['invalid']});
    fireEvent.click(screen.getByText(en('absolute')));
    expect(onViewChange).toHaveBeenLastCalledWith({scale: 'absolute', hidden: ['invalid']});
  });
});
