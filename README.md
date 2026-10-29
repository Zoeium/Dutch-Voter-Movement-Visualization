# Dutch Voter Movement Visualization

This project visualizes how voter support moves between Dutch parties across election cycles. It was created after the
2025 Dutch parliamentary election, when media narratives around D66 suggested that voters from many parties had shifted
toward the party. The project asks a broader question: how do those flows actually look across multiple elections, and
how much of the apparent change is real movement versus a continuation of existing support from two elections earlier?

The NOS visualizations focus on one party for one election at a time, which makes it difficult to see the full picture.
This project puts the flows for every party and several elections side by side. The example below shows D66's movement
from 2021 to 2025:

![Voters movement for D66, 2021 to 2025](resources/pictures/d66-2021-to-2025.png)

To put the Dutch results in perspective, the app also covers the United Kingdom, Germany and Sweden.

**Try it:** [zoeium.github.io/Dutch-Voter-Movement-Visualization](https://zoeium.github.io/Dutch-Voter-Movement-Visualization/)

## What the app shows

- **Voter movements:** where each party's voters came from and went to between elections, for all parties at once or
  focused on a single party. Available for every country except France, for the elections listed below.
- **Turnout:** for every election, how the electorate splits into valid votes, blank and invalid votes, and people who
  did not vote.
- **Parliament:** how the seats in parliament were divided under each cabinet or government, and how parties merged,
  split and carried their seats over from one to the next.
- **Compare elections:** for any two elections, each party's change in votes, vote share and seats, with the biggest
  gainers and losers highlighted.
- **Coalition explorer:** for each election, which combinations of parties reach a majority of the seats, next to the
  coalition that actually formed after it.

Every view can be shared through its link and exported as an SVG chart or, for comparisons, a CSV file. The app is
available in English and Dutch, in a light and a dark theme.

## The data

The app covers seven countries, chosen with the "Election data" selector in the header.

**Netherlands**

- **Election results** for every Tweede Kamer election from 1946 to 2025: electorate, turnout and votes for every
  list that took part, checked against the official results of the Kiesraad (Electoral Council).
- **Voter movements** for the 2021, 2023 and 2025 elections. These come from post-election research such as the Ipsos
  I&O election survey. They are estimates based on polling, not counted votes.
- **Cabinets** from Beel I (1946) to Jetten (2026): the governing parties, any supporting parties, and the seat
  distribution produced by the preceding election.

**United Kingdom**

- **Election results** for every House of Commons general election since the Second World War, from 1945 to 2024,
  including both elections of 1974: electorate, turnout, and votes and seats per party. Small parties are grouped as
  "Other parties". Spoilt ballots are not part of the published national totals, so turnout shows valid votes only.
- **Governments** from Attlee I (1945) to Burnham (2026), including changes of prime minister between elections.
- **Voter movements** for 2015 to 2017, 2017 to 2019 and 2019 to 2024, for Great Britain. 2017 comes from YouGov's
  post-election survey and 2019 from YouGov's final pre-election projection (MRP), both adjusted to match the official
  results; these tables are in whole percentages, so parties under 2% of the vote are left out. 2024 comes from Lord
  Ashcroft's post-vote poll: each party's 2024 voters by their 2019 vote, as published.

**Germany**

- **Election results** for every Bundestag election from 1949 to 2025 (West Germany until 1987): party-list votes
  (Zweitstimmen) and seats. Seats before 1990 exclude West Berlin's non-voting delegates.
- **Governments** from Adenauer I (1949) to Merz (2025).
- **Voter movements** for 2002 to 2005 and 2005 to 2009, from Infratest dimap's estimates for the ARD: how many voters
  each party kept and won from or lost to each other party and the non-voters. For later elections only net balances
  between parties are published, which hide voters moving both ways, so they are not used.

**Sweden**

- **Election results** for every Riksdag election from 1948 to 2026. Until 1968 these are the elections to the second
  chamber; since 1970 the Riksdag has had a single chamber. The 2026 figures are the election-night count.
- **Governments** from Erlander I (1948) to the caretaker government after the 2026 election, including governments
  that continued after an election.
- **Voter movements** for 2014 to 2018 and 2018 to 2022, from the Swedish National Election Studies (University of
  Gothenburg). 2018 is the study's own table of where each party's voters came from; for 2022 the study's table of
  where each party's 2018 voters went is adjusted to match the official results of both elections.

**France**

- **Election results** for every National Assembly election of the Fifth Republic, from 1958 to 2024: first-round
  votes and the seats after both rounds. Since 2017, alliances (Ensemble, NUPES, New Popular Front) are counted as
  one list, as in the official results. For 1958 and 1962 the seats cover metropolitan France.
- **Governments** from Debré (1959) to Lecornu (2025).

**Spain**

- **Election results** for every Congress of Deputies election since the return to democracy, from 1977 to 2023,
  including both elections of 2019.
- **Governments** from Suárez II (1977) to Sánchez III (2023), including the acting governments after the 2015 and
  April 2019 elections.
- **Voter movements** for every election from 2015 to 2023, from the CIS post-election surveys: each voter's vote by
  their vote at the previous election, adjusted to match the official results of both elections. Parties with fewer
  than 20 respondents in a survey are left out.

**Italy**

- **Election results** for every Chamber of Deputies election from 1948 to 2022. Since 1994: proportional-list votes
  and total seats. In 1994, votes for small lists are counted together with blank and invalid votes.
- **Governments**: all 65 from De Gasperi V (1948) to Meloni (2022). A party founded during a parliamentary term
  holds no seats of its own until the next election, so it is not shown in that term's governments.
- **Voter movements** for 2013 to 2018 (Ipsos) and 2018 to 2022 (Istituto Ixè): how each party's voters at one
  election voted at the next, adjusted to match the official results of both elections.

For Germany, Sweden, France, Spain and Italy, parties that never won a seat or 1% of the vote are grouped as "other
parties". No voter movements are available for France: the published figures compare a legislative election with
a presidential or European one, or are voting intentions before the election.

Every source is listed in the app itself, under "Sources" at the bottom of the page.

### Data checks

Every change to the data is checked automatically before it is published. Among other things, the checks confirm that
each party's votes add up to the valid votes, that every party has a name and colour, that a cabinet or government
with seats follows every election, and that every governing party actually holds seats.

## Versions

The app is released in numbered versions; the version shown at the bottom of the page is the one you are looking at.
What changed in each version is described in the [changelog](CHANGELOG.md), and every version is available on the
[releases page](https://github.com/Zoeium/Dutch-Voter-Movement-Visualization/releases).

## Notes

This project is primarily a data-visualization and analysis tool rather than a software-first project. A significant
part of the implementation was generated with the help of AI, while the underlying election data and narrative are the
main focus.
