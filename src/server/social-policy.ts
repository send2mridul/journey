export const reservedHandles = new Set([
  'admin', 'api', 'auth', 'circle', 'explore', 'help', 'invite', 'lifeatlas', 'login', 'logout',
  'moderator', 'paths', 'privacy', 'root', 'security', 'settings', 'staff', 'support', 'system', 'team',
]);

export function normalizeHandle(value: string) {
  const display = value.trim().replace(/^@+/, '');
  const normalized = display.toLowerCase();
  if (normalized.length < 3 || normalized.length > 24) throw new Error('Handles must be between 3 and 24 characters.');
  if (!/^[a-z0-9](?:[a-z0-9_]*[a-z0-9])?$/.test(normalized)) throw new Error('Use letters, numbers, and single underscores; begin and end with a letter or number.');
  if (normalized.includes('__')) throw new Error('Handles cannot contain repeated underscores.');
  if (reservedHandles.has(normalized)) throw new Error('That handle is reserved by Life Atlas.');
  return { display, normalized };
}

export type MinimalProfileRow = {
  displayName: string | null;
  handle: string;
  image: string | null;
  mutualConnections?: number;
  requestStatus?: 'NONE' | 'INCOMING' | 'OUTGOING' | 'CONNECTED';
};

export function minimalProfile(row: MinimalProfileRow) {
  return {
    displayName: row.displayName || row.handle,
    handle: row.handle,
    avatarUrl: row.image,
    mutualConnections: row.mutualConnections ?? 0,
    requestStatus: row.requestStatus ?? 'NONE' as const,
  };
}

export type PairPermissionState = {
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED' | null;
  requesterIsLow: boolean;
  lowCompareAllowed: boolean;
  highCompareAllowed: boolean;
  lowAtlasShared: boolean;
  highAtlasShared: boolean;
  lowExternalShareAllowed?: boolean;
  highExternalShareAllowed?: boolean;
};

export function pairAccess(state: PairPermissionState) {
  const connected = state.status === 'ACCEPTED';
  const compareAllowed = connected && state.lowCompareAllowed && state.highCompareAllowed;
  const requesterFullShared = state.requesterIsLow ? state.lowAtlasShared : state.highAtlasShared;
  const otherFullShared = state.requesterIsLow ? state.highAtlasShared : state.lowAtlasShared;
  const externalShareAllowed = compareAllowed
    && Boolean(state.lowExternalShareAllowed)
    && Boolean(state.highExternalShareAllowed);
  return {
    connected,
    compareAllowed,
    canViewOtherFullAtlas: connected && otherFullShared,
    fullComparisonAllowed: connected && requesterFullShared && otherFullShared,
    externalShareAllowed,
  };
}

export type ComparisonChapter = {
  cityId: number;
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  fromYear: number;
  toYear: number | null;
};

export type SharedDiscovery = {
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  overlapFrom: number | null;
  overlapTo: number | null;
  approximateYears: number;
  sameCityDifferentTimes: boolean;
};

export function deriveSharedDiscoveries(mine: ComparisonChapter[], theirs: ComparisonChapter[], nowYear = new Date().getFullYear()) {
  const discoveries: SharedDiscovery[] = [];
  for (const mineChapter of mine) {
    for (const theirChapter of theirs) {
      if (mineChapter.cityId !== theirChapter.cityId) continue;
      const mineTo = mineChapter.toYear ?? nowYear;
      const theirTo = theirChapter.toYear ?? nowYear;
      const overlapFrom = Math.max(mineChapter.fromYear, theirChapter.fromYear);
      const overlapTo = Math.min(mineTo, theirTo);
      const overlaps = overlapFrom <= overlapTo;
      discoveries.push({
        city: mineChapter.city,
        country: mineChapter.country,
        countryCode: mineChapter.countryCode,
        latitude: mineChapter.latitude,
        longitude: mineChapter.longitude,
        overlapFrom: overlaps ? overlapFrom : null,
        overlapTo: overlaps ? overlapTo : null,
        approximateYears: overlaps ? Math.max(1, overlapTo - overlapFrom + 1) : 0,
        sameCityDifferentTimes: !overlaps,
      });
    }
  }
  return discoveries
    .filter((item, index, all) => all.findIndex((candidate) => candidate.city === item.city && candidate.overlapFrom === item.overlapFrom && candidate.overlapTo === item.overlapTo) === index)
    .sort((a, b) => (a.overlapFrom ?? Number.MAX_SAFE_INTEGER) - (b.overlapFrom ?? Number.MAX_SAFE_INTEGER) || a.city.localeCompare(b.city));
}
