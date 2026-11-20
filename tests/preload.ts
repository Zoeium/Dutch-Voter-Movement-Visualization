// The app downloads a country's data when it is first shown (loadCountryData). Tests read
// data straight away, so every country is loaded before any test file runs.
import {loadCountries, loadCountryData} from '@/data/loader';

await Promise.all(loadCountries().map((country) => loadCountryData(country.id)));
