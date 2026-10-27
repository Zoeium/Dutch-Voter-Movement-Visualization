import {createContext, useContext} from 'react';

export type Theme = 'dark' | 'light';
export type Language = 'en' | 'nl';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

export interface LanguageContextValue {
  lang: Language;
  t: (key: TranslationKey) => string;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  t: () => '',
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useI18n(): LanguageContextValue {
  return useContext(LanguageContext);
}

export const translations = {
  en: {
    // Header
    appTitle: 'Election Results Statistics',

    // Tabs
    tabAlluvial: 'Voter Movements',
    tabTurnout: 'Turnout Overview',
    tabParliament: 'Parliament Composition',
    tabCompare: 'Compare Elections',
    tabCoalition: 'Coalition Explorer',

    // Alluvial
    alluvialTitle: 'Voter movements between parties',
    alluvialDescription:
      'Visualizes voter migration across parliamentary elections. Each flow shows where a party\u2019s voters came from — or where they went. Hover over a party block to highlight its flows, or filter to a single party.',
    partyFilter: 'Party filter:',
    allParties: 'All parties',
    years: 'Years',
    yearsNone: 'Years: none available',
    sort: 'Sort:',
    sortByVotes: 'By votes',
    sortAlphabetical: 'Alphabetical',
    noFlowData: 'No flow data available for the selected filters.',
    votes: 'votes',

    // Turnout
    turnoutTitle: 'Turnout & vote breakdown',
    turnoutDescription:
      'Total electorate split into valid votes, blanco, invalid, and those who did not vote. Hover a bar for details.',
    scale: 'Scale:',
    absolute: 'Absolute',
    percentage: 'Percentage',
    validVotes: 'Valid votes',
    blanco: 'Blanco',
    invalid: 'Invalid',
    didNotVote: 'Did not vote',
    turnout: 'turnout',
    noTurnoutData: 'No turnout data available for the selected years.',
    election: 'election',
    electorate: 'Electorate',
    turnoutLabel: 'Turnout',
    valid: 'Valid',
    validOfCast: 'of cast',
    blancoInvalid: 'Blanco + Invalid',
    blancoInvalidCombined: 'Blanco + Invalid (combined)',
    blancoBeforeNote: '* Striped bars: blank and invalid votes are only reported as one combined total',
    numberVotes: 'Number of votes',
    pctOfElectorate: 'Percentage of electorate',

    // Parliament
    parliamentTitle: 'Parliament composition',
    parliamentDescription:
      'Coalition and opposition parties across elections. Parties are sorted by number of seats, with coalition parties shown above the dashed line and opposition parties below. Lines connect the same party (or successor parties) across elections.',
    range: 'Range:',
    all: 'All',
    last10: 'Last 10',
    last5: 'Last 5',
    noCoalitionData: 'No coalition data available',
    toleratingParty: 'Supporting party (outside the cabinet)',
    coalitionOpposition: 'Coalition above \u00b7 opposition below',
    electionMarker: 'Election',
    electionMarkerLegend: 'Election: a new parliament starts here',

    // Footer
    sources: 'Sources',
    sourcesShow: 'Show all sources',
    sourcesHide: 'Hide sources',
    totals: 'Totals',
    movements: 'Movements',

    // Error
    somethingWrong: 'Something went wrong',

    // Theme/Language toggles
    lightMode: 'Light',
    darkMode: 'Dark',
    language: 'Language',
    countryData: 'Election data:',
    countryDataHint: 'Choose which country’s elections are shown',
    languageHint: 'Language of the interface',
    version: 'Version',

    // Front page
    homeLink: 'Front page',
    homeTitle: 'How do voters move between elections?',
    homeIntro:
      'Election coverage often follows one party in one election. This app puts every party, election and government side by side: where voters came from and went to, how parliaments were divided, how many people voted, and which coalitions could have formed.',
    homeDataFor: 'Data for',
    homeElections: 'elections',
    homePeriod: 'period',
    homeGovernments: 'cabinets and governments',
    homeExplore: 'Explore',
    homeOpen: 'Open',
    homeAlluvial: 'Where each party’s voters came from and where they went, from one election to the next.',
    homeParliament: 'How the seats were divided under every cabinet, and how parties merged and split over time.',
    homeTurnout: 'How many people voted in every election, and how many votes were blank or invalid.',
    homeCompare: 'Votes, vote share and seats of every party in any two elections, side by side.',
    homeCoalition: 'Pick parties and see whether they reach a majority, next to the coalition that actually formed.',

    // Compare Elections
    compareTitle: 'Compare elections',
    compareDescription:
      'Select two elections to see how party votes and seats changed between them. Gains and losses are shown with percentage-point differences.',
    compareElectionYear: 'Election year',
    compareParty: 'Party',
    compareVotes: 'Votes',
    compareVoteChange: 'Vote change',
    compareSeats: 'Seats',
    compareSeatChange: 'Seat change',
    compareVoteShare: 'Share',
    compareShareChange: 'pp change',
    compareTotalVotes: 'Total valid votes',
    compareTotalSeats: 'Total seats',
    compareSelectTwo: 'Select two different elections to compare.',
    compareSameElection: 'Please select two different elections.',
    compareNoSeats: 'No seat data for this election.',
    compareGainers: 'Biggest gainers',
    compareLosers: 'Biggest losers',

    // Coalition Explorer
    coalitionExplTitle: 'Coalition explorer',
    coalitionExplDescription:
      'Select an election and pick parties to see if they reach a majority. The majority threshold adjusts to the number of seats in each election.',
    coalitionSelectElection: 'Election',
    coalitionSelectParties: 'Parties',
    coalitionTotalSeats: 'Total seats',
    coalitionReached: 'Majority reached!',
    coalitionNotReached: 'Not enough seats',
    coalitionSurplus: 'Surplus',
    coalitionShortfall: 'Shortfall',
    coalitionClear: 'Clear',
    coalitionSeatSelected: 'selected',
    coalitionSeatsLabel: 'seats',
    coalitionActual: 'Actual coalition',
    coalitionNoSeatData: 'No seat data available for this election year.',
    coalitionNoElection: 'Select an election to explore coalitions.',

    // Share & Export
    share: 'Share',
    shareLink: 'Share link',
    shareCopied: 'Link copied to clipboard!',
    export: 'Export',
    exportChart: 'Export chart (SVG)',
    exportData: 'Export data (CSV)',
    exportDone: 'Exported!',
  },

  nl: {
    appTitle: 'Verkiezingsuitslagen Statistieken',

    tabAlluvial: 'Kiezersmigratie',
    tabTurnout: 'Opkomstoverzicht',
    tabParliament: 'Samenstelling parlement',
    tabCompare: 'Verkiezingen vergelijken',
    tabCoalition: 'Coalitie verkenner',

    alluvialTitle: 'Kiezersmigratie tussen partijen',
    alluvialDescription:
      'Visualiseert kiezersmigratie bij parlementsverkiezingen. Elke stroom laat zien waar de kiezers van een partij vandaan kwamen — of naartoe gingen. Hover over een partijblok om de stromen te markeren, of filter op \u00e9\u00e9n partij.',
    partyFilter: 'Partijfilter:',
    allParties: 'Alle partijen',
    years: 'Jaren',
    yearsNone: 'Jaren: geen beschikbaar',
    sort: 'Sorteren:',
    sortByVotes: 'Op stemmen',
    sortAlphabetical: 'Alfabetisch',
    noFlowData: 'Geen stroomdata beschikbaar voor de geselecteerde filters.',
    votes: 'stemmen',

    turnoutTitle: 'Opkomst en stemverdeling',
    turnoutDescription:
      'Het totale kiescorps opgesplitst in geldige stemmen, blanco, ongeldig en niet-stemmers. Hover over een balk voor details.',
    scale: 'Schaal:',
    absolute: 'Absoluut',
    percentage: 'Percentage',
    validVotes: 'Geldige stemmen',
    blanco: 'Blanco',
    invalid: 'Ongeldig',
    didNotVote: 'Niet gestemd',
    turnout: 'opkomst',
    noTurnoutData: 'Geen opkomstdata beschikbaar voor de geselecteerde jaren.',
    election: 'verkiezing',
    electorate: 'Kiesgerechtigden',
    turnoutLabel: 'Opkomst',
    valid: 'Geldig',
    validOfCast: 'van uitgebrachte stemmen',
    blancoInvalid: 'Blanco + Ongeldig',
    blancoInvalidCombined: 'Blanco + Ongeldig (gecombineerd)',
    blancoBeforeNote: '* Gestreepte balken: blanco en ongeldige stemmen zijn alleen als één gecombineerd totaal bekend',
    numberVotes: 'Aantal stemmen',
    pctOfElectorate: 'Percentage van kiesgerechtigden',

    parliamentTitle: 'Samenstelling parlement',
    parliamentDescription:
      'Coalitie- en oppositiepartijen door de jaren heen. Partijen zijn gesorteerd op aantal zetels, met coalitiepartijen boven de stippellijn en oppositiepartijen eronder. Lijnen verbinden dezelfde partij (of opvolgers) tussen verkiezingen.',
    range: 'Bereik:',
    all: 'Alles',
    last10: 'Laatste 10',
    last5: 'Laatste 5',
    noCoalitionData: 'Geen coalitiedata beschikbaar',
    toleratingParty: 'Gedoogpartner',
    coalitionOpposition: 'Coalitie boven \u00b7 oppositie onder',
    electionMarker: 'Verkiezing',
    electionMarkerLegend: 'Verkiezing: hier begint een nieuw parlement',

    sources: 'Bronnen',
    sourcesShow: 'Alle bronnen tonen',
    sourcesHide: 'Bronnen verbergen',
    totals: 'Totalen',
    movements: 'Migratie',

    somethingWrong: 'Er ging iets mis',

    lightMode: 'Licht',
    darkMode: 'Donker',
    language: 'Taal',
    countryData: 'Verkiezingsdata:',
    countryDataHint: 'Kies van welk land de verkiezingen worden getoond',
    languageHint: 'Taal van de interface',
    version: 'Versie',

    // Front page
    homeLink: 'Voorpagina',
    homeTitle: 'Hoe bewegen kiezers tussen verkiezingen?',
    homeIntro:
      'Verkiezingsnieuws volgt vaak één partij bij één verkiezing. Deze app zet alle partijen, verkiezingen en kabinetten naast elkaar: waar kiezers vandaan kwamen en naartoe gingen, hoe het parlement verdeeld was, hoeveel mensen stemden en welke coalities mogelijk waren.',
    homeDataFor: 'Gegevens voor',
    homeElections: 'verkiezingen',
    homePeriod: 'periode',
    homeGovernments: 'kabinetten en regeringen',
    homeExplore: 'Verkennen',
    homeOpen: 'Openen',
    homeAlluvial: 'Waar de kiezers van elke partij vandaan kwamen en naartoe gingen, van de ene verkiezing naar de volgende.',
    homeParliament: 'Hoe de zetels onder elk kabinet verdeeld waren, en hoe partijen in de loop der tijd fuseerden en splitsten.',
    homeTurnout: 'Hoeveel mensen bij elke verkiezing stemden, en hoeveel stemmen blanco of ongeldig waren.',
    homeCompare: 'Stemmen, stemaandeel en zetels van elke partij bij twee verkiezingen naast elkaar.',
    homeCoalition: 'Kies partijen en zie of ze een meerderheid halen, naast de coalitie die echt gevormd werd.',

    compareTitle: 'Verkiezingen vergelijken',
    compareDescription:
      'Selecteer twee verkiezingen om te zien hoe partijstemmen en zetels veranderden. Winst en verlies worden getoond met verschil in procentpunten.',
    compareElectionYear: 'Verkiezingsjaar',
    compareParty: 'Partij',
    compareVotes: 'Stemmen',
    compareVoteChange: 'Stemverschil',
    compareSeats: 'Zetels',
    compareSeatChange: 'Zetelverschil',
    compareVoteShare: 'Aandeel',
    compareShareChange: 'pp verschil',
    compareTotalVotes: 'Totaal geldige stemmen',
    compareTotalSeats: 'Totaal zetels',
    compareSelectTwo: 'Selecteer twee verschillende verkiezingen om te vergelijken.',
    compareSameElection: 'Selecteer twee verschillende verkiezingen.',
    compareNoSeats: 'Geen zeteldata voor deze verkiezing.',
    compareGainers: 'Grootste winnaars',
    compareLosers: 'Grootste verliezers',

    coalitionExplTitle: 'Coalitie verkenner',
    coalitionExplDescription:
      'Selecteer een verkiezing en kies partijen om te zien of zij een meerderheid halen. De meerderheidsgrens wordt aangepast aan het aantal zetels bij elke verkiezing.',
    coalitionSelectElection: 'Verkiezing',
    coalitionSelectParties: 'Partijen',
    coalitionTotalSeats: 'Totaal zetels',
    coalitionReached: 'Meerderheid bereikt!',
    coalitionNotReached: 'Niet genoeg zetels',
    coalitionSurplus: 'Overschot',
    coalitionShortfall: 'Tekort',
    coalitionClear: 'Wissen',
    coalitionSeatSelected: 'geselecteerd',
    coalitionSeatsLabel: 'zetels',
    coalitionActual: 'Werkelijke coalitie',
    coalitionNoSeatData: 'Geen zeteldata beschikbaar voor dit verkiezingsjaar.',
    coalitionNoElection: 'Selecteer een verkiezing om coalities te verkennen.',

    share: 'Delen',
    shareLink: 'Deel link',
    shareCopied: 'Link gekopieerd naar klembord!',
    export: 'Exporteren',
    exportChart: 'Exporteer grafiek (SVG)',
    exportData: 'Exporteer data (CSV)',
    exportDone: 'Ge\u00ebxporteerd!',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
