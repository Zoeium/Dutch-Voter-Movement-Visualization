import type {ReactNode} from 'react';
import {ArrowRight} from 'lucide-react';
import {useI18n} from '@/theme';
import {formatElectionLabel} from '@/components/diagramUtils';

export interface HomeView {
  key: string;
  title: string;
  description: string;
  icon: ReactNode;
}

interface HomePageProps {
  countryName: string;
  electionYears: string[];
  governmentCount: number;
  views: HomeView[];
  onOpen: (key: string) => void;
}

function Stat({value, label}: Readonly<{ value: string; label: string }>) {
  return (
    <div className="rounded-xl border border-app-border bg-app-card px-4 py-3">
      <div className="text-2xl font-bold text-app-heading">{value}</div>
      <div className="text-sm text-app-muted">{label}</div>
    </div>
  );
}

/** Start page: what the app is for, what data the selected country has, and a card per view. */
export default function HomePage({countryName, electionYears, governmentCount, views, onOpen}: Readonly<HomePageProps>) {
  const {t} = useI18n();
  const first = electionYears[0];
  const last = electionYears[electionYears.length - 1];

  return (
    <div className="space-y-8 sm:space-y-10">
      <section className="max-w-3xl">
        <h2 className="text-2xl sm:text-4xl font-bold mb-3 text-app-heading">{t('homeTitle')}</h2>
        <p className="text-app-muted text-base sm:text-lg">{t('homeIntro')}</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-app-muted mb-3">
          {t('homeDataFor')} {countryName}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
          <Stat value={String(electionYears.length)} label={t('homeElections')}/>
          <Stat value={first ? `${formatElectionLabel(first)}–${formatElectionLabel(last)}` : '—'} label={t('homePeriod')}/>
          <Stat value={String(governmentCount)} label={t('homeGovernments')}/>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-app-muted mb-3">{t('homeExplore')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {views.map((view) => (
            <button
              key={view.key}
              type="button"
              onClick={() => onOpen(view.key)}
              className="group text-left rounded-2xl border border-app-border bg-app-card p-5 transition-all hover:border-emerald-500 hover:shadow-xl"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center flex-shrink-0">
                  {view.icon}
                </span>
                <span className="text-lg font-semibold text-app-heading">{view.title}</span>
              </div>
              <p className="text-sm text-app-muted mb-3">{view.description}</p>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-500">
                {t('homeOpen')}
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1"/>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
