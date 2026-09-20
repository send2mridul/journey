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
  arrivalYear?: number;
  reason?: string;
};

export type AtlasRoute = {
  from: Place;
  to: Place;
  year: number;
  reason: string;
  volume: number;
};

function shortestLongitude(from: number, to: number) {
  let target = to;
  while (target - from > 180) target -= 360;
  while (target - from < -180) target += 360;
  return target;
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
  };
}

export function formatDistance(kilometres: number) {
  return `${Math.round(kilometres).toLocaleString()} km`;
}
