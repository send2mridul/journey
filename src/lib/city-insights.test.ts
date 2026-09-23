import { describe, expect, test } from 'bun:test';
import { cityThenInsight } from './city-insights';

describe('cached city insights', () => {
  test('returns a source-backed insight for a relevant chapter', () => {
    const insight = cityThenInsight({ city: 'New Delhi', countryCode: 'IN', arrivalYear: 1996, endYear: 1997 });
    expect(insight?.populationYear).toBe(2000);
    expect(insight?.population).toBe(17_969_000);
    expect(insight?.factYear).toBe(1995);
    expect(insight?.populationSource.url).toStartWith('https://population.un.org/');
  });

  test('does not fabricate an insight when the cache has no reliable match', () => {
    expect(cityThenInsight({ city: 'Mount Joy', countryCode: 'US', arrivalYear: 2000 })).toBeNull();
    expect(cityThenInsight({ city: 'New Delhi', countryCode: 'IN', arrivalYear: 2020 })).toBeNull();
  });
});
