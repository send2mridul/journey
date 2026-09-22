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
  sameCityDifferentTimes: boolean;
};

function project(longitude: number, latitude: number) {
  return { x: ((longitude + 180) / 360) * 1000, y: ((90 - latitude) / 180) * 500 };
}

export function ProfileMark({ handle, size = 78 }: { handle: string; size?: number }) {
  const seed = [...handle].reduce((value, letter) => value + letter.charCodeAt(0), 0);
  return (
    <svg
      className="social-profile-mark"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`mark-${seed}`}>
          <stop stopColor="#fffaf0" />
          <stop offset="1" stopColor="#e4c69f" />
        </radialGradient>
      </defs>
      <circle
        cx="50"
        cy="50"
        r="47"
        fill={`url(#mark-${seed})`}
        stroke="#b86343"
        strokeOpacity=".28"
      />
      {[0, 1, 2].map((ring) => {
        const radius = 15 + ring * 10;
        const start = ((seed * (ring + 3)) % 210) - 90;
        const length = 130 + ((seed + ring * 47) % 130);
        return (
          <path
            key={ring}
            d={fingerprintArcPath(50, 50, radius, start, length)}
            fill="none"
            stroke="#ad5032"
            strokeWidth={3.8 - ring * 0.45}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="50" cy="50" r="4" fill="#a8482c" />
    </svg>
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
