import {createContext, useContext} from 'react';

export type Theme = 'dark' | 'light';
export type Language = 'en' | 'nl';

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

export interface LanguageContextValue {
  lang: Language;
  toggleLanguage: () => void;
  t: (key: TranslationKey) => string;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
});

export const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  toggleLanguage: () => {},
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
    appTitle: 'Voter Flow',
    appSubtitle: 'Dutch election voter movement analysis',

    // Tabs
    tabAlluvial: 'Voter Movements',
    tabTurnout: 'Turnout Overview',
    tabParliament: 'Parliament Composition',

    // Alluvial
    alluvialTitle: 'Voter movements between parties',
    alluvialDescription:
      'Visualizes voter migration across Dutch parliamentary elections. Each flow shows where a party\u2019s voters came from — or where they went. Hover over a party block to highlight its flows, or filter to a single party.',
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
    blancoBeforeNote: '* Before 2010, blanco and invalid votes were reported as a combined total',
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
    toleratingParty: 'Tolerating party (gedoogpartner)',
    coalitionOpposition: 'Coalition above \u00b7 opposition below',

    // Footer
    sources: 'Sources',
    totals: 'Totals',
    movements: 'Movements',

    // Error
    somethingWrong: 'Something went wrong',

    // Theme/Language toggles
    lightMode: 'Light',
    darkMode: 'Dark',
    english: 'EN',
    dutch: 'NL',
  },

  nl: {
    appTitle: 'Kiezersstroom',
    appSubtitle: 'Analyse van kiezersmigratie bij Nederlandse verkiezingen',

    tabAlluvial: 'Kiezersmigratie',
    tabTurnout: 'Opkomstoverzicht',
    tabParliament: 'Tweede Kamer samenstelling',

    alluvialTitle: 'Kiezersmigratie tussen partijen',
    alluvialDescription:
      'Visualiseert kiezersmigratie bij Tweede Kamerverkiezingen. Elke stroom laat zien waar de kiezers van een partij vandaan kwamen — of naartoe gingen. Hover over een partijblok om de stromen te markeren, of filter op \u00e9\u00e9n partij.',
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
    blancoBeforeNote: '* Voor 2010 werden blanco en ongeldige stemmen als een gecombineerd totaal gerapporteerd',
    numberVotes: 'Aantal stemmen',
    pctOfElectorate: 'Percentage van kiesgerechtigden',

    parliamentTitle: 'Tweede Kamer samenstelling',
    parliamentDescription:
      'Coalitie- en oppositiepartijen door de jaren heen. Partijen zijn gesorteerd op aantal zetels, met coalitiepartijen boven de stippellijn en oppositiepartijen eronder. Lijnen verbinden dezelfde partij (of opvolgers) tussen verkiezingen.',
    range: 'Bereik:',
    all: 'Alles',
    last10: 'Laatste 10',
    last5: 'Laatste 5',
    noCoalitionData: 'Geen coalitiedata beschikbaar',
    toleratingParty: 'Gedoogpartner',
    coalitionOpposition: 'Coalitie boven \u00b7 oppositie onder',

    sources: 'Bronnen',
    totals: 'Totalen',
    movements: 'Migratie',

    somethingWrong: 'Er ging iets mis',

    lightMode: 'Licht',
    darkMode: 'Donker',
    english: 'EN',
    dutch: 'NL',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
