export type Place = {
  id: string;
  city: string;
  region: string | null;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
};

export type TrailStop = Place & {
  chapterId?: string | undefined;
  arrivalYear?: number | undefined;
  endYear?: number | undefined;
  reason?: string | undefined;
  title?: string | undefined;
  memory?: string | undefined;
  privacy?: StoryVisibility | undefined;
  photos?: ChapterPhoto[] | undefined;
};

export type StoryVisibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';

export type ChapterPhoto = {
  id: string;
  chapterId: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  displayOrder: number;
  caption: string | null;
  url: string;
};

export type AtlasRoute = {
  from: Place;
  to: Place;
  year: number;
  reason: string;
  volume: number;
};

export function shortestLongitude(from: number, to: number) {
  let target = to;
  while (target - from > 180) target -= 360;
  while (target - from < -180) target += 360;
  return target;
}

/**
 * Produces a geodesic line whose longitudes stay continuous across the
 * antimeridian. Mapbox accepts unwrapped longitudes (for example 181°), which
 * prevents the renderer from drawing a 300° line in the opposite direction.
 */
export function greatCircleArc(a: [number, number], b: [number, number], steps = 120) {
  const radians = (value: number) => value * Math.PI / 180;
  const degrees = (value: number) => value * 180 / Math.PI;
  const endLongitude = shortestLongitude(a[0], b[0]);
  const start = [radians(a[0]), radians(a[1])];
  const end = [radians(endLongitude), radians(b[1])];
  const startVector = [Math.cos(start[1]!) * Math.cos(start[0]!), Math.cos(start[1]!) * Math.sin(start[0]!), Math.sin(start[1]!)];
  const endVector = [Math.cos(end[1]!) * Math.cos(end[0]!), Math.cos(end[1]!) * Math.sin(end[0]!), Math.sin(end[1]!)];
  const dot = Math.max(-1, Math.min(1, startVector[0]! * endVector[0]! + startVector[1]! * endVector[1]! + startVector[2]! * endVector[2]!));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  let previousLongitude = a[0];

  return Array.from({ length: steps + 1 }, (_, index): [number, number] => {
    const t = index / steps;
    let coordinate: [number, number];
    if (sinOmega < 0.000001) {
      coordinate = [a[0] + (endLongitude - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    } else {
      const fromWeight = Math.sin((1 - t) * omega) / sinOmega;
      const toWeight = Math.sin(t * omega) / sinOmega;
      const x = fromWeight * startVector[0]! + toWeight * endVector[0]!;
      const y = fromWeight * startVector[1]! + toWeight * endVector[1]!;
      const z = fromWeight * startVector[2]! + toWeight * endVector[2]!;
      coordinate = [degrees(Math.atan2(y, x)), degrees(Math.atan2(z, Math.hypot(x, y)))];
    }
    coordinate[0] = index === 0 ? a[0] : shortestLongitude(previousLongitude, coordinate[0]);
    previousLongitude = coordinate[0];
    return coordinate;
  });
}

export function routeCoordinates(route: AtlasRoute) {
  return greatCircleArc(
    [route.from.longitude, route.from.latitude],
    [route.to.longitude, route.to.latitude],
  );
}

export function distanceKm(a: Place, b: Place) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(shortestLongitude(a.longitude, b.longitude) - a.longitude);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function routesFromTrail(trail: TrailStop[]): AtlasRoute[] {
  return trail.slice(0, -1).flatMap((from, index) => {
    const to = trail[index + 1];
    if (!to?.arrivalYear) return [];
    return [{ from, to, year: to.arrivalYear, reason: to.reason || 'Other', volume: 1 }];
  });
}

export function fingerprintFor(trail: TrailStop[], nowYear = new Date().getFullYear()) {
  const routes = routesFromTrail(trail);
  const totalDistance = routes.reduce((sum, route) => sum + distanceKm(route.from, route.to), 0);
  const countries = new Set(trail.map((stop) => stop.countryCode));
  const years = routes.map((route) => route.year);
  return {
    totalDistance,
    locations: trail.length,
    countries: countries.size,
    yearsRepresented: years.length ? Math.max(...years) - Math.min(...years) + 1 : 0,
    timeSinceLatestMove: years.length ? Math.max(0, nowYear - Math.max(...years)) : 0,
    longestMove: routes.reduce<AtlasRoute | null>((longest, route) => !longest || distanceKm(route.from, route.to) > distanceKm(longest.from, longest.to) ? route : longest, null),
    farthestFromStart: trail.length > 1 ? trail.slice(1).reduce<TrailStop | null>((farthest, stop) => !farthest || distanceKm(trail[0]!, stop) > distanceKm(trail[0]!, farthest) ? stop : farthest, null) : null,
    currentDistanceFromStart: trail.length > 1 ? distanceKm(trail[0]!, trail.at(-1)!) : 0,
    longestChapter: trail.slice(1).reduce<{ stop: TrailStop; years: number } | null>((longest, stop, index) => {
      const end = stop.endYear ?? trail[index + 2]?.arrivalYear ?? nowYear;
      const duration = stop.arrivalYear ? Math.max(0, end - stop.arrivalYear) : 0;
      return !longest || duration > longest.years ? { stop, years: duration } : longest;
    }, null),
  };
}

export function memoryPrompt(stop: TrailStop, index: number, total: number) {
  if (index === 0) return `What do you remember about growing into yourself in ${stop.city}?`;
  if (index === total - 1) return `What does life in ${stop.city} feel like now?`;
  switch (stop.reason) {
    case 'Career': return `What changed for you when you moved to ${stop.city}?`;
    case 'Study': return `What do you remember most about starting life in ${stop.city}?`;
    case 'Family': return `What made ${stop.city} feel like home?`;
    case 'Love': return 'What made this chapter special?';
    case 'Opportunity': return `What were you hoping to find in ${stop.city}?`;
    case 'A new start': return `What did starting again in ${stop.city} feel like?`;
    default: return `What do you remember most about this chapter in ${stop.city}?`;
  }
}

export function formatDistance(kilometres: number) {
  return `${Math.round(kilometres).toLocaleString()} km`;
}
