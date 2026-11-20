# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/):

- **Major** – a change that breaks how the app or its data files are used, such as a new data layout.
- **Minor** – new features or data, such as a new country, view or election.
- **Patch** – corrections to data or code that change nothing else.

## [Unreleased]

### Added

- Voter movements for the United Kingdom (2015–2017, 2017–2019 and 2019–2024), Sweden (every election from 2002 to 2022),
  Germany (2002–2005 and 2005–2009), Spain (every election from 2015 to 2023) and Italy (2013–2018 and 2018–2022).

### Changed

- The views work the same way:
  - Voter movements, turnout and the parliament share one range control with quick ranges, and all three start
    with the last ten elections or cabinets.
  - Every chart names what is under the pointer in the same kind of tooltip.
  - Every election list runs from newest to oldest.
  - Every view without data shows the same note.
- Each view keeps its settings when you switch tabs, and a shared link now also includes the parliament's range,
  the turnout chart's scale and hidden categories, and the coalition explorer's election and parties.
- Non-voters and "other parties" are named in the interface language in every view, and months in election names
  follow the interface language too.
- Screen readers hear the range sliders and the coalition chamber in the interface language.
- Every dropdown (country, language, the elections to compare, the coalition explorer's election) looks and works
  like the country selector, with its flags or icons and full keyboard support.
- Accessibility: every dropdown has a name screen readers announce, the two compared elections are labelled
  "Election" and "compared with", and headings no longer skip a level.
- Each column of the parliament diagram is as wide as its cabinet's time in office.

## [1.1.0] - 2026-10-27

### Added

- The app is usable on phones: a compact header, charts that scroll sideways instead of shrinking, and a comparison
  table that keeps the party names in view.
- Election data for France (1958–2024), Spain (1977–2023) and Italy (1948–2022), with their governments.
- A front page introducing the app and each view, reachable from the logo.
- The parliament diagram marks the cabinets formed after an election.
- The parliament diagram shows temporary alliances and parties that split off and later rejoin, and the relations
  between parties were reviewed for every country.
- A description of the data files and the relations between parties, in `docs/DATA.md`.
- The Burnham government (United Kingdom, July 2026).
- A release script: `npm run release:minor` (or `release:patch`, `release:major`) bumps the version, dates the
  changelog, commits and tags.

### Changed

- The flags in the "Election data" selector come from the flag-icons library, so they are complete (Spain's coat of
  arms was missing), and the countries are listed alphabetically by name.
- Parliament Composition comes before Turnout Overview in the tabs.
- In the parliament diagram, each party's block matches its share of the seats, and a cabinet's column is as tall as
  its parliament is large, however many parties it has.
- Where parties merge in the parliament diagram, the merged party is divided between them by the votes each won at
  the previous election, instead of evenly.

### Fixed

- Every party in the parliament diagram is named, including the smallest, which previously had no label.
- The coalition explorer draws every seat of large parliaments.
- The note about combined blank and invalid votes only appears for elections where they are combined.

## [1.0.0] - 2026-10-26

Initial release

[Unreleased]: https://github.com/Zoeium/Dutch-Voter-Movement-Visualization/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Zoeium/Dutch-Voter-Movement-Visualization/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Zoeium/Dutch-Voter-Movement-Visualization/releases/tag/v1.0.0
