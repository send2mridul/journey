import { describe, expect, test } from 'bun:test';
import { deriveSharedDiscoveries, minimalProfile, normalizeHandle, pairAccess, type ComparisonChapter } from './social-policy';

const acceptedPair = {
  status: 'ACCEPTED' as const,
  requesterIsLow: true,
  lowCompareAllowed: false,
  highCompareAllowed: false,
  lowAtlasShared: false,
  highAtlasShared: false,
  lowExternalShareAllowed: false,
  highExternalShareAllowed: false,
};

describe('Life Atlas handles', () => {
  test('normalizes case and an optional @ prefix', () => {
    expect(normalizeHandle('  @Mridul_7  ')).toEqual({ display: 'Mridul_7', normalized: 'mridul_7' });
  });

  test('rejects reserved, ambiguous, and malformed handles', () => {
    expect(() => normalizeHandle('admin')).toThrow('reserved');
    expect(() => normalizeHandle('a')).toThrow('between 3 and 24');
    expect(() => normalizeHandle('_mridul')).toThrow('begin and end');
    expect(() => normalizeHandle('mridul__atlas')).toThrow('repeated underscores');
    expect(() => normalizeHandle('mridul-atlas')).toThrow('letters, numbers');
  });
});

describe('minimal social payloads', () => {
  test('serializes identity and relationship context only', () => {
    const payload = minimalProfile({
      displayName: 'Mridul',
      handle: 'mridul',
      image: null,
      mutualConnections: 2,
      requestStatus: 'NONE',
    });
    expect(payload).toEqual({
      displayName: 'Mridul',
      handle: 'mridul',
      avatarUrl: null,
      mutualConnections: 2,
      requestStatus: 'NONE',
    });
    const forbidden = ['id', 'userId', 'email', 'city', 'cityId', 'country', 'latitude', 'longitude', 'arrivalYear', 'endYear', 'reason', 'route', 'memory', 'photos', 'stats'];
    expect(forbidden.filter((key) => key in payload)).toEqual([]);
  });
});

describe('mutual consent', () => {
  test('a friendship reveals no comparison or full Atlas by itself', () => {
    expect(pairAccess(acceptedPair)).toEqual({
      connected: true,
      compareAllowed: false,
      canViewOtherFullAtlas: false,
      fullComparisonAllowed: false,
      externalShareAllowed: false,
    });
  });

  test('comparison requires both people and still does not reveal full trails', () => {
    const access = pairAccess({ ...acceptedPair, lowCompareAllowed: true, highCompareAllowed: true });
    expect(access.compareAllowed).toBe(true);
    expect(access.fullComparisonAllowed).toBe(false);
    expect(access.canViewOtherFullAtlas).toBe(false);
  });

  test('full comparison and external sharing are separately mutual', () => {
    const access = pairAccess({
      ...acceptedPair,
      lowCompareAllowed: true,
      highCompareAllowed: true,
      lowAtlasShared: true,
      highAtlasShared: true,
      lowExternalShareAllowed: true,
      highExternalShareAllowed: true,
    });
    expect(access.compareAllowed).toBe(true);
    expect(access.fullComparisonAllowed).toBe(true);
    expect(access.externalShareAllowed).toBe(true);
  });

  test('blocking revokes every access mode immediately', () => {
    const access = pairAccess({
      ...acceptedPair,
      status: 'BLOCKED',
      lowCompareAllowed: true,
      highCompareAllowed: true,
      lowAtlasShared: true,
      highAtlasShared: true,
      lowExternalShareAllowed: true,
      highExternalShareAllowed: true,
    });
    expect(access).toEqual({
      connected: false,
      compareAllowed: false,
      canViewOtherFullAtlas: false,
      fullComparisonAllowed: false,
      externalShareAllowed: false,
    });
  });
});

describe('Our Paths derivation', () => {
  const mridul: ComparisonChapter[] = [
    { cityId: 1, city: 'Patna', country: 'India', countryCode: 'IN', latitude: 25.5941, longitude: 85.1376, fromYear: 1994, toYear: 2017 },
    { cityId: 2, city: 'Bengaluru', country: 'India', countryCode: 'IN', latitude: 12.9716, longitude: 77.5946, fromYear: 2018, toYear: 2024 },
    { cityId: 3, city: 'London', country: 'United Kingdom', countryCode: 'GB', latitude: 51.5072, longitude: -0.1276, fromYear: 2025, toYear: null },
  ];
  const rohan: ComparisonChapter[] = [
    { cityId: 4, city: 'Jaipur', country: 'India', countryCode: 'IN', latitude: 26.9124, longitude: 75.7873, fromYear: 1995, toYear: 2021 },
    { cityId: 2, city: 'Bengaluru', country: 'India', countryCode: 'IN', latitude: 12.9716, longitude: 77.5946, fromYear: 2022, toYear: 2026 },
    { cityId: 5, city: 'Toronto', country: 'Canada', countryCode: 'CA', latitude: 43.6532, longitude: -79.3832, fromYear: 2027, toYear: null },
  ];

  test('reveals only the derived Bengaluru overlap for Mridul and Rohan', () => {
    const discoveries = deriveSharedDiscoveries(mridul, rohan, 2026);
    expect(discoveries).toEqual([{
      city: 'Bengaluru',
      country: 'India',
      countryCode: 'IN',
      latitude: 12.9716,
      longitude: 77.5946,
      overlapFrom: 2022,
      overlapTo: 2024,
      approximateYears: 3,
      yearsComparable: true,
      sameCityDifferentTimes: false,
    }]);
    const serialized = JSON.stringify(discoveries);
    expect(serialized).not.toContain('Patna');
    expect(serialized).not.toContain('Jaipur');
    expect(serialized).not.toContain('London');
    expect(serialized).not.toContain('Toronto');
    expect(serialized.toLowerCase()).not.toContain('met');
  });

  test('marks a same city in different years without inventing an overlap', () => {
    const discoveries = deriveSharedDiscoveries(
      [{ ...mridul[0]!, cityId: 2, city: 'Bengaluru', fromYear: 2018, toYear: 2020 }],
      [{ ...rohan[0]!, cityId: 2, city: 'Bengaluru', fromYear: 2022, toYear: 2024 }],
      2026,
    );
    expect(discoveries[0]).toMatchObject({ sameCityDifferentTimes: true, overlapFrom: null, overlapTo: null, approximateYears: 0 });
  });

  test('keeps shared geography but does not invent an overlap when a start year is unknown', () => {
    const discoveries = deriveSharedDiscoveries(
      [{ ...mridul[0]!, cityId: 2, city: 'Bengaluru', fromYear: null, toYear: 2020 }],
      [{ ...rohan[0]!, cityId: 2, city: 'Bengaluru', fromYear: 2018, toYear: 2024 }],
      2026,
    );
    expect(discoveries[0]).toMatchObject({
      city: 'Bengaluru',
      yearsComparable: false,
      sameCityDifferentTimes: false,
      overlapFrom: null,
      overlapTo: null,
      approximateYears: 0,
    });
  });

  test('returns an honest empty state when the two routes share no city', () => {
    expect(deriveSharedDiscoveries(
      [mridul[0]!],
      [rohan[0]!],
      2026,
    )).toEqual([]);
  });

  test('uses a known end year when the other chapter is still open-ended', () => {
    const discoveries = deriveSharedDiscoveries(
      [{ ...mridul[1]!, fromYear: 2021, toYear: null }],
      [{ ...rohan[1]!, fromYear: 2022, toYear: 2023 }],
      2026,
    );
    expect(discoveries[0]).toMatchObject({
      city: 'Bengaluru',
      overlapFrom: 2022,
      overlapTo: 2023,
      approximateYears: 2,
      yearsComparable: true,
      sameCityDifferentTimes: false,
    });
  });
});
