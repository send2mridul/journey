import { distanceKm, routesFromTrail, type TrailStop } from '@/lib/atlas-data';

export type FingerprintArc = {
  index: number;
  radius: number;
  start: number;
  length: number;
  weight: number;
  opacity: number;
};

function bearing(from: TrailStop, to: TrailStop) {
  const radians = (value: number) => value * Math.PI / 180;
  const y = Math.sin(radians(to.longitude - from.longitude)) * Math.cos(radians(to.latitude));
  const x = Math.cos(radians(from.latitude)) * Math.sin(radians(to.latitude))
    - Math.sin(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.cos(radians(to.longitude - from.longitude));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function fingerprintArcs(trail: TrailStop[]) {
  const routes = routesFromTrail(trail);
  return routes.map((route, index): FingerprintArc => {
    const length = 74 + Math.min(238, Math.log10(distanceKm(route.from, route.to) + 10) * 57);
    return {
      index,
      radius: 34 + index * Math.min(13, 104 / Math.max(1, routes.length)),
      length,
      start: bearing(route.from, route.to) - length / 2,
      weight: 2.1 + Math.min(2.6, Math.log10(distanceKm(route.from, route.to) + 1) * .55),
      opacity: .52 + (index / Math.max(1, routes.length)) * .34,
    };
  });
}

export function fingerprintPoint(cx: number, cy: number, radius: number, degrees: number) {
  const angle = (degrees - 90) * Math.PI / 180;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

export function fingerprintArcPath(cx: number, cy: number, radius: number, start: number, length: number) {
  const from = fingerprintPoint(cx, cy, radius, start);
  const to = fingerprintPoint(cx, cy, radius, start + length);
  return `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} A ${radius} ${radius} 0 ${length > 180 ? 1 : 0} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
}
