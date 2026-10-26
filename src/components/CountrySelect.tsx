import {useEffect, useId, useRef, useState, type KeyboardEvent} from 'react';
import {Check, ChevronDown} from 'lucide-react';
import type {CountryInfo} from '@/data/loader';
import {useI18n} from '@/theme';

interface CountrySelectProps {
  countries: CountryInfo[];
  value: string;
  onChange: (country: string) => void;
}

function Flag({country}: Readonly<{ country: CountryInfo }>) {
  if (!country.flagUrl) return <span className="inline-block w-6 h-4 rounded-sm bg-app-btn-hover"/>;
  return (
    <img
      src={country.flagUrl}
      alt=""
      className="w-6 h-4 rounded-sm object-cover ring-1 ring-black/10 flex-shrink-0"
    />
  );
}

/**
 * Picks whose election data is shown. A native <select> cannot show flag images,
 * so this is a small listbox with the same keyboard behaviour.
 */
export default function CountrySelect({countries, value, onChange}: Readonly<CountrySelectProps>) {
  const {lang, t} = useI18n();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const labelId = useId();
  const selected = countries.find((c) => c.id === value) ?? countries[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openList = () => {
    setActiveIndex(Math.max(0, countries.findIndex((c) => c.id === value)));
    setOpen(true);
  };

  const choose = (country: CountryInfo) => {
    setOpen(false);
    if (country.id !== value) onChange(country.id);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(countries.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(countries[activeIndex]);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  if (!selected) return null;

  return (
    <div ref={rootRef} className="relative flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span id={labelId} className="text-xs sm:text-sm font-medium text-app-muted whitespace-nowrap">{t('countryData')}</span>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={labelId}
        aria-activedescendant={open ? `${listboxId}-${countries[activeIndex]?.id}` : undefined}
        title={t('countryDataHint')}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all bg-app-btn text-app-heading hover:bg-app-btn-hover border border-app-border"
      >
        <Flag country={selected}/>
        {selected.name[lang]}
        <ChevronDown className={`w-4 h-4 text-app-muted transition-transform ${open ? 'rotate-180' : ''}`}/>
      </button>
      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute left-0 top-full mt-2 z-20 min-w-full py-1 rounded-lg border border-app-border bg-app-card shadow-2xl"
        >
          {countries.map((country, index) => {
            const isSelected = country.id === value;
            return (
              <li
                key={country.id}
                id={`${listboxId}-${country.id}`}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(country)}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer whitespace-nowrap ${index === activeIndex ? 'bg-app-btn-hover' : ''} ${isSelected ? 'font-semibold text-app-heading' : 'text-app-text'}`}
              >
                <Flag country={country}/>
                <span className="flex-1">{country.name[lang]}</span>
                {isSelected && <Check className="w-4 h-4 text-emerald-500"/>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
