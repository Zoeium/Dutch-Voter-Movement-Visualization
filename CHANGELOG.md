# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/):

- **Major** – a change that breaks how the app or its data files are used, such as a new data layout.
- **Minor** – new features or data, such as a new country, view or election.
- **Patch** – corrections to data or code that change nothing else.

## [Unreleased]

### Added

- The app is usable on phones: a compact header, charts that scroll sideways instead of shrinking, and a comparison
  table that keeps the party names in view.
- Election data for France (1958–2024), Spain (1977–2023) and Italy (1948–2022), with their governments.
- A front page introducing the app and each view, reachable from the logo.
- The parliament diagram marks the cabinets formed after an election.
- The parliament diagram shows temporary alliances and parties that split off and later rejoin, and the relations
  between parties were reviewed for every country.
- A description of the data files and the relations between parties, in `docs/DATA.md`.

### Changed

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

[Unreleased]: https://github.com/Zoeium/Dutch-Voter-Movement-Visualization/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Zoeium/Dutch-Voter-Movement-Visualization/releases/tag/v1.0.0
