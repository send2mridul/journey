export type TimedPlace = {
  city: string;
  latitude: number;
  longitude: number;
  arrivalYear?: number | undefined;
  endYear?: number | undefined;
};

export function activePlaceAtYear<T extends TimedPlace>(
  trail: T[] | null | undefined,
  year: number,
) {
  if (!trail?.length) return null;
  let active: T | null = null;
  for (const stop of trail) {
    if (stop.arrivalYear === undefined || stop.arrivalYear > year) continue;
    if (stop.endYear !== undefined && stop.endYear < year) continue;
    if (active?.arrivalYear === undefined || stop.arrivalYear >= active.arrivalYear) active = stop;
  }
  return active;
}

export function knownYearRange(
  trails: Array<TimedPlace[] | null | undefined>,
  overlapYears: Array<{ from: number | null; to: number | null }> = [],
  currentYear = new Date().getFullYear(),
) {
  const years: number[] = [];
  let hasOpenEndedChapter = false;
  for (const trail of trails) {
    for (const stop of trail ?? []) {
      if (stop.arrivalYear !== undefined) years.push(stop.arrivalYear);
      if (stop.endYear !== undefined) years.push(stop.endYear);
      if (stop.arrivalYear !== undefined && stop.endYear === undefined) hasOpenEndedChapter = true;
    }
  }
  for (const overlap of overlapYears) {
    if (overlap.from !== null) years.push(overlap.from);
    if (overlap.to !== null) years.push(overlap.to);
  }
  if (!years.length) return null;
  return {
    min: Math.min(...years),
    max: Math.max(...years, hasOpenEndedChapter ? currentYear : Number.MIN_SAFE_INTEGER),
  };
}

export function approximateDistanceKm(first: TimedPlace | null, second: TimedPlace | null) {
  if (!first || !second) return null;
  const radians = Math.PI / 180;
  const latitudeDelta = (second.latitude - first.latitude) * radians;
  const longitudeDelta = (second.longitude - first.longitude) * radians;
  const firstLatitude = first.latitude * radians;
  const secondLatitude = second.latitude * radians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
}
