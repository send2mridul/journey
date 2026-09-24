import type { TrailStop } from "@/lib/atlas-data";
import { fingerprintArcPath, fingerprintArcs } from "@/lib/fingerprint";

export type SocialTrailStop = Pick<
  TrailStop,
  | "id"
  | "city"
  | "country"
  | "countryCode"
  | "latitude"
  | "longitude"
  | "arrivalYear"
  | "endYear"
  | "reason"
  | "title"
  | "memory"
  | "photos"
>;
export type PathDiscovery = {
  city: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  overlapFrom: number | null;
  overlapTo: number | null;
  approximateYears: number;
  yearsComparable: boolean;
  sameCityDifferentTimes: boolean;
};

function project(longitude: number, latitude: number) {
  return { x: ((longitude + 180) / 360) * 1000, y: ((90 - latitude) / 180) * 500 };
}

export function ProfileMark({
  handle,
  displayName,
  avatarUrl,
  size = 78,
}: {
  handle: string;
  displayName?: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initials = (displayName || handle)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <div
      className="social-profile-mark"
      style={{ width: size, height: Math.round(size * 1.12) }}
      aria-label={`${displayName || `@${handle}`} profile`}
    >
      {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" /> : <strong>{initials || "LA"}</strong>}
      <span aria-hidden="true" />
    </div>
  );
}

export function MovementSignature({
  trail,
  label,
  tone = "mine",
}: {
  trail: SocialTrailStop[];
  label: string;
  tone?: "mine" | "theirs";
}) {
  const safeTrail = trail.map((stop) => ({ ...stop, region: null })) as TrailStop[];
  const geographicArcs = fingerprintArcs(safeTrail);
  const seed = [...label].reduce((value, letter) => value + letter.charCodeAt(0), 0);
  const arcs = geographicArcs.length
    ? geographicArcs
    : [0, 1, 2, 3].map((index) => ({
        index,
        radius: 34 + index * 17,
        start: ((seed * (index + 3)) % 200) - 100,
        length: 150 + ((seed + index * 41) % 120),
        opacity: 0.88 - index * 0.13,
        weight: 8 - index * 0.8,
      }));
  const color = tone === "mine" ? "#ad5032" : "#315d70";
  return (
    <div className={`movement-signature ${tone}`}>
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle
          cx="120"
          cy="120"
          r="112"
          fill="rgba(255,255,255,.78)"
          stroke={color}
          strokeOpacity=".24"
        />
        {arcs.map((arc) => (
          <path
            key={arc.index}
            d={fingerprintArcPath(120, 120, arc.radius, arc.start, arc.length)}
            fill="none"
            stroke={color}
            strokeOpacity={arc.opacity}
            strokeWidth={arc.weight}
            strokeLinecap="round"
          />
        ))}
        <circle cx="120" cy="120" r="5" fill={color} />
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function PlaceMapPreview({
  city,
  country,
  latitude,
  longitude,
}: {
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}) {
  const point = project(longitude, latitude);
  const cropWidth = 330;
  const cropHeight = 210;
  const cropX = Math.max(0, Math.min(1000 - cropWidth, point.x - cropWidth / 2));
  const cropY = Math.max(0, Math.min(500 - cropHeight, point.y - cropHeight / 2));
  return (
    <div
      className="chapter-atlas-fallback"
      aria-label={`Accurate geographic preview of ${city}, ${country}`}
    >
      <svg
        viewBox={`${cropX} ${cropY} ${cropWidth} ${cropHeight}`}
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={`${city} shown on a real world map`}
      >
        <defs>
          <radialGradient id={`chapter-glow-${city.replace(/\W/g, "")}`}>
            <stop stopColor="#d19a43" stopOpacity=".52" />
            <stop offset="1" stopColor="#d19a43" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect
          x={cropX}
          y={cropY}
          width={cropWidth}
          height={cropHeight}
          className="place-map-water"
        />
        <g className="place-map-grid">
          {[-120, -60, 0, 60, 120].map((longitudeLine) => {
            const p = project(longitudeLine, 0);
            return <line key={longitudeLine} x1={p.x} x2={p.x} y1="0" y2="500" />;
          })}
          {[-60, -30, 0, 30, 60].map((latitudeLine) => {
            const p = project(0, latitudeLine);
            return <line key={latitudeLine} x1="0" x2="1000" y1={p.y} y2={p.y} />;
          })}
        </g>
        <image href="/world-land-110m.svg" width="1000" height="500" className="place-map-land" />
        <circle
          cx={point.x}
          cy={point.y}
          r="42"
          fill={`url(#chapter-glow-${city.replace(/\W/g, "")})`}
        />
        <circle className="place-map-ring" cx={point.x} cy={point.y} r="9" />
        <circle className="place-map-point" cx={point.x} cy={point.y} r="4" />
      </svg>
      <div>
        <span>
          {latitude.toFixed(2)}° · {longitude.toFixed(2)}°
        </span>
        <strong>{city}</strong>
        <small>{country} · Natural Earth geography</small>
      </div>
    </div>
  );
}

export const ChapterAtlasFallback = PlaceMapPreview;
