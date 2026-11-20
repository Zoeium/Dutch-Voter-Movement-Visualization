import {describe, expect, it} from 'vitest';
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

  it('shows a tooltip for the hovered bar and segment', () => {
    const {container} = renderWithLanguage(<TurnoutDiagram elections={loadAllElections('nl')}/>);
    // The latest election reports blank and invalid votes separately.
    const valid = segments(container, EMERALD).at(-1) as SVGRectElement;
    const bar = valid.parentElement as Element;

    fireEvent.mouseEnter(bar);
    expect(screen.getByText(new RegExp(`${en('electorate')}:`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`^${en('blanco')}:`))).toBeTruthy();

    const details: [string, string][] = [
      [EMERALD, en('validOfCast')],
      [AMBER, `${en('blanco')}:`],
      [RED, `${en('invalid')}:`],
      [SLATE, `${en('didNotVote')}:`],
    ];
    for (const [color, text] of details) {
      const segment = [...bar.querySelectorAll(`rect[fill="${color}"]`)][0] as Element;
      fireEvent.mouseEnter(segment);
      expect(screen.getAllByText(new RegExp(text)).length).toBeGreaterThan(0);
    }

    fireEvent.mouseLeave(bar);
    expect(screen.queryByText(new RegExp(`${en('electorate')}:`))).toBeNull();
  });

  it('marks elections where blank and invalid votes were counted together', () => {
    const {container} = renderWithLanguage(<TurnoutDiagram elections={loadAllElections('de')}/>);
    expect(screen.getByText(en('blancoBeforeNote'))).toBeTruthy();
    expect(container.querySelectorAll('pattern').length).toBeGreaterThan(0);

    const combined = segments(container, AMBER)[0] as SVGRectElement;
    const bar = combined.parentElement as Element;
    fireEvent.mouseEnter(bar);
    expect(screen.getByText(`${en('blancoInvalid')}:`, {exact: false})).toBeTruthy();
    fireEvent.mouseEnter(combined);
    expect(screen.getByText(en('blancoInvalidCombined'), {exact: false})).toBeTruthy();
  });
});
