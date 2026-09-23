import type { TrailStop } from '@/lib/atlas-data';

export type CityThenInsight = {
  population: number;
  populationYear: number;
  populationLabel: string;
  populationSource: { label: string; url: string };
  fact: string;
  factYear: number;
  factSource: { label: string; url: string };
};

type CachedCityInsight = CityThenInsight & {
  city: string;
  countryCode: string;
  relevantFrom: number;
  relevantTo: number;
};

const wupSource = {
  label: 'UN DESA · World Urbanization Prospects 2025',
  url: 'https://population.un.org/wup/assets/Publications/undesa_pd_2025_wup2025_summary_of_results_final.pdf',
};

// Deliberately small and source-backed. If a city is not listed, the UI shows
// nothing instead of inventing a fact or extrapolating an unavailable series.
const cachedCityInsights: CachedCityInsight[] = [
  {
    city: 'new delhi',
    countryCode: 'IN',
    relevantFrom: 1990,
    relevantTo: 2005,
    population: 17_969_000,
    populationYear: 2000,
    populationLabel: 'UN city estimate nearest this chapter',
    populationSource: wupSource,
    fact: 'Delhi Metro Rail Corporation was incorporated in May 1995, while this chapter of the city was taking shape.',
    factYear: 1995,
    factSource: {
      label: 'Delhi Metro Rail Corporation · annual report',
      url: 'https://delhimetrorail.com/OtherDocuments/EnglishAR201314Low.pdf',
    },
  },
  {
    city: 'chennai',
    countryCode: 'IN',
    relevantFrom: 1991,
    relevantTo: 2003,
    population: 7_613_000,
    populationYear: 2000,
    populationLabel: 'UN city estimate nearest this chapter',
    populationSource: wupSource,
    fact: 'In October 1996, Chennai held civic elections after a 23-year interval.',
    factYear: 1996,
    factSource: {
      label: 'Greater Chennai Corporation · council history',
      url: 'https://chennaicorporation.gov.in/council/',
    },
  },
];

export function cityThenInsight(stop: Pick<TrailStop, 'city' | 'countryCode' | 'arrivalYear' | 'endYear'>): CityThenInsight | null {
  const fromYear = stop.arrivalYear;
  if (!fromYear) return null;
  const toYear = stop.endYear ?? fromYear;
  const city = stop.city.trim().toLowerCase();
  const match = cachedCityInsights.find((item) => item.city === city
    && item.countryCode === stop.countryCode
    && toYear >= item.relevantFrom
    && fromYear <= item.relevantTo);
  if (!match) return null;
  const { city: _city, countryCode: _countryCode, relevantFrom: _from, relevantTo: _to, ...insight } = match;
  return insight;
}

