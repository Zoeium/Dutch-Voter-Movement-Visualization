import {useMemo} from 'react';
import type {CountryInfo} from '@/data/loader';
import {useI18n} from '@/theme';
import {Dropdown} from '@/components/Dropdown';

interface CountrySelectProps {
  countries: CountryInfo[];
  value: string;
  onChange: (country: string) => void;
}

function Flag({country}: Readonly<{ country: CountryInfo }>) {
  if (!country.flagUrl) return <span className="inline-block w-6 h-4 rounded-xs bg-app-btn-hover"/>;
  return <img src={country.flagUrl} alt="" className="w-6 h-4 rounded-xs object-cover ring-1 ring-black/10 shrink-0"/>;
}

/** Picks whose election data is shown: the countries with their flags, by name. */
export default function CountrySelect({countries, value, onChange}: Readonly<CountrySelectProps>) {
  const {lang, t} = useI18n();
  // Listed alphabetically by name in the interface language (Spain is Spanje in Dutch).
  const options = useMemo(
    () => countries
      .toSorted((a, b) => a.name[lang].localeCompare(b.name[lang], lang))
      .map((country) => ({value: country.id, label: country.name[lang], icon: <Flag country={country}/>})),
    [countries, lang]
  );
  return <Dropdown label={t('countryData')} hint={t('countryDataHint')} options={options} value={value} onChange={onChange}/>;
}
