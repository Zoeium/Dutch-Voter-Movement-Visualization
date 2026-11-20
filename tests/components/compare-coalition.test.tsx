import {describe, expect, it, vi} from 'vitest';
import {fireEvent, screen, within} from '@testing-library/react';
import ElectionCompare from '@/components/ElectionCompare';
import CoalitionExplorer from '@/components/CoalitionExplorer';
import {loadAllElections, loadCoalitions, loadParties} from '@/data/loader';
import {chooseOption, dropdownValue, en, renderWithLanguage} from './render';

const elections = loadAllElections('nl');
const coalitions = loadCoalitions('nl');
const parties = loadParties('nl');

describe('ElectionCompare', () => {
  const renderCompare = (yearA: string, yearB: string, electionList = elections) => {
    const onYearAChange = vi.fn();
    const onYearBChange = vi.fn();
    renderWithLanguage(
      <ElectionCompare elections={electionList} coalitions={coalitions} parties={parties} yearA={yearA} yearB={yearB}
        onYearAChange={onYearAChange} onYearBChange={onYearBChange}/>
    );
    return {onYearAChange, onYearBChange};
  };
  const partyColumn = () =>
    screen.getAllByRole('row').slice(2).map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');

  it('compares two elections with the biggest gainers and losers', () => {
    renderCompare('2021', '2023');
    expect(screen.getByText(en('compareGainers'))).toBeTruthy();
    expect(screen.getByText(en('compareLosers'))).toBeTruthy();
    expect(screen.getByText(en('compareTotalVotes'))).toBeTruthy();
    expect(screen.getAllByText('PVV').length).toBeGreaterThan(0);
  });

  it('sorts by any column, in both directions', () => {
    renderCompare('2021', '2023');
    const header = (label: string) => screen.getByRole('button', {name: new RegExp(label)});

    fireEvent.click(header(en('compareParty')));
    const descending = partyColumn();
    fireEvent.click(header(en('compareParty')));
    expect(partyColumn()).toEqual(descending.toReversed());
    expect(screen.getByRole('columnheader', {name: new RegExp(en('compareParty'))}).getAttribute('aria-sort')).toBe('ascending');

    for (const label of [en('compareVoteShare'), en('compareSeatChange'), en('compareVotes')]) {
      fireEvent.click(screen.getAllByRole('button', {name: new RegExp(label)})[0] as HTMLElement);
    }
    expect(screen.getAllByRole('row').length).toBeGreaterThan(10);
  });

  it('shows a dash for seats of an election without a cabinet', () => {
    const withoutCabinet = elections.filter((election) => election.year !== '2025');
    renderCompare('2023', '2021', withoutCabinet);
    // Parties new in one election have no seat change in the other.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('asks for two different elections', () => {
    renderCompare('2023', '2023');
    expect(screen.getByText(en('compareSameElection'))).toBeTruthy();
  });

  it('asks for two elections when one is unknown', () => {
    renderCompare('1999', '2023');
    expect(screen.getByText(en('compareSelectTwo'))).toBeTruthy();
  });

  it('lists the elections newest first, as the coalition explorer does', () => {
    renderCompare('2021', '2023');
    fireEvent.click(screen.getByRole('combobox', {name: en('compareFirst')}));
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options[0]).toBe(elections.at(-1)?.year);
    expect(options.at(-1)).toBe(elections[0]?.year);
  });

  it('reports a different election choice', () => {
    const {onYearAChange, onYearBChange} = renderCompare('2021', '2023');
    chooseOption(en('compareFirst'), '2017');
    chooseOption(en('compareSecond'), '2025');
    expect(onYearAChange).toHaveBeenCalledWith('2017');
    expect(onYearBChange).toHaveBeenCalledWith('2025');
  });
});

describe('CoalitionExplorer', () => {
  const seatCount = () => screen.getByText(/ \/ \d+$/).textContent;

  it('builds a coalition party by party, up to a majority', () => {
    renderWithLanguage(<CoalitionExplorer coalitions={coalitions} parties={parties}/>);
    // Rutte IV (2021) had a majority: 78 of 150 seats.
    chooseOption(en('coalitionSelectElection'), '2021');
    expect(screen.getByText(en('coalitionNotReached'))).toBeTruthy();

    fireEvent.click(screen.getByText(en('coalitionSelectParties'), {selector: 'button'}));
    expect(screen.getByText(en('coalitionReached'))).toBeTruthy();
    expect(screen.getAllByText(new RegExp(en('coalitionSurplus'))).length).toBeGreaterThan(0);

    const firstParty = screen.getAllByRole('button').find((button) => button.textContent.includes('('));
    fireEvent.click(firstParty as HTMLElement);
    fireEvent.click(firstParty as HTMLElement);

    fireEvent.click(screen.getByText(en('coalitionClear')));
    expect(screen.queryByText(en('coalitionClear'))).toBeNull();
    expect(seatCount()).toMatch(/^0 \//);
  });

  it('shows the tolerating party of a minority cabinet', () => {
    renderWithLanguage(<CoalitionExplorer coalitions={coalitions} parties={parties}/>);
    chooseOption(en('coalitionSelectElection'), '2010');
    expect(screen.getByText(/Rutte I$/)).toBeTruthy();
    expect(screen.getByText(/^\+ /)).toBeTruthy();
  });

  it('starts with a given election and parties, and reports every change', () => {
    const onSelectionChange = vi.fn();
    renderWithLanguage(
      <CoalitionExplorer coalitions={coalitions} parties={parties} selection={{year: '2021', parties: ['vvd', 'd66']}}
        onSelectionChange={onSelectionChange}/>
    );
    expect(dropdownValue(en('coalitionSelectElection'))).toBe('2021');
    expect(screen.getByText(/^2 /)).toBeTruthy();

    fireEvent.click(screen.getByText(en('coalitionClear')));
    expect(onSelectionChange).toHaveBeenLastCalledWith({year: '2021', parties: []});
    chooseOption(en('coalitionSelectElection'), '2017');
    expect(onSelectionChange).toHaveBeenLastCalledWith({year: '2017', parties: []});
  });

  it('ignores a given election without seat data', () => {
    renderWithLanguage(<CoalitionExplorer coalitions={coalitions} parties={parties} selection={{year: '1800', parties: ['vvd']}}/>);
    expect(dropdownValue(en('coalitionSelectElection'))).toBe(coalitions.at(-1)?.electionYear);
    expect(screen.queryByText(en('coalitionClear'))).toBeNull();
  });

  it('describes the chamber in the interface language', () => {
    renderWithLanguage(<CoalitionExplorer coalitions={coalitions} parties={parties}/>, 'nl');
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^0 van \d+ zetels geselecteerd; \d+ zetels nodig/);
  });

  it('shows a note without seat data', () => {
    renderWithLanguage(<CoalitionExplorer coalitions={[]} parties={parties}/>);
    expect(screen.getByText(en('coalitionNoSeatData'))).toBeTruthy();
  });
});
