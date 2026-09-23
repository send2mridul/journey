import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Sparkles,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  MovementSignature,
  ProfileMark,
  type PathDiscovery,
  type SocialTrailStop,
} from "./SocialVisuals";

const SocialMapbox = lazy(() => import("./SocialMapbox"));

export type OurPathsData = {
  me: { displayName: string; handle: string };
  other: {
    displayName: string;
    handle: string;
    avatarUrl: string | null;
    mutualConnections: number;
    requestStatus: string;
  };
  permissions: {
    compareMine: boolean;
    compareTheirs: boolean;
    atlasMine: boolean;
    atlasTheirs: boolean;
    externalMine: boolean;
    externalTheirs: boolean;
    compareAllowed: boolean;
    fullComparisonAllowed: boolean;
    canViewOtherFullAtlas: boolean;
    externalShareAllowed: boolean;
  };
  discoveries: PathDiscovery[];
  mineTrail: SocialTrailStop[] | null;
  theirTrail: SocialTrailStop[] | null;
  moments: Array<{
    id: string;
    city: string;
    yearFrom: number | null;
    yearTo: number | null;
    title: string | null;
    memory: string | null;
    status: "PENDING" | "CONFIRMED";
    mineVisible: boolean;
    theirVisible: boolean;
  }>;
};

type ReplayEvent = {
  year: number;
  text: string;
  owner: "mine" | "theirs" | "shared";
  city?: string;
};

function PermissionPanel({
  data,
  onPermission,
}: {
  data: OurPathsData;
  onPermission: (permission: "COMPARE" | "ATLAS" | "EXTERNAL_SHARE", allowed: boolean) => void;
}) {
  return (
    <aside className="paths-permission-panel">
      <div>
        <LockKeyhole />
        <div>
          <strong>Privacy controls</strong>
          <p>Connection, path comparison, and full Atlas access remain separate.</p>
        </div>
      </div>
      <button
        className={data.permissions.compareMine ? "permission-row active" : "permission-row"}
        onClick={() => onPermission("COMPARE", !data.permissions.compareMine)}
      >
        <span>
          {data.permissions.compareMine ? <Check /> : <Eye />}
          <span>
            <strong>Compare our paths</strong>
            <small>
              {data.permissions.compareTheirs
                ? "They have allowed comparison."
                : "Both people must allow this."}
            </small>
          </span>
        </span>
        <i>{data.permissions.compareMine ? "Allowed" : "Private"}</i>
      </button>
      <button
        className={data.permissions.atlasMine ? "permission-row active" : "permission-row"}
        onClick={() => onPermission("ATLAS", !data.permissions.atlasMine)}
      >
        <span>
          {data.permissions.atlasMine ? <Check /> : <EyeOff />}
          <span>
            <strong>Share my full Atlas</strong>
            <small>Revocable and specific to @{data.other.handle}.</small>
          </span>
        </span>
        <i>{data.permissions.atlasMine ? "Shared" : "Private"}</i>
      </button>
      <button
        className={data.permissions.externalMine ? "permission-row active" : "permission-row"}
        disabled={!data.permissions.compareAllowed}
        onClick={() => onPermission("EXTERNAL_SHARE", !data.permissions.externalMine)}
      >
        <span>
          <Share2 />
          <span>
            <strong>Share Our Paths externally</strong>
            <small>
              {data.permissions.externalTheirs
                ? "They have allowed sharing. Both people must agree."
                : "Requires both people’s permission."}
            </small>
          </span>
        </span>
        <i>{data.permissions.externalMine ? "Allowed" : "Off"}</i>
      </button>
    </aside>
  );
}

function SharedPlaceRow({
  discovery,
  index,
  selected,
  confirmed,
  onSelect,
  onConfirm,
}: {
  discovery: PathDiscovery;
  index: number;
  selected: boolean;
  confirmed: boolean;
  onSelect: () => void;
  onConfirm: () => void;
}) {
  const years = !discovery.yearsComparable
    ? "Years not specified"
    : discovery.sameCityDifferentTimes
      ? "Different years"
    : discovery.overlapFrom === discovery.overlapTo
      ? String(discovery.overlapFrom)
      : `${discovery.overlapFrom}–${discovery.overlapTo}`;
  return (
    <article
      className={`shared-place-row ${selected ? "selected" : ""} ${confirmed ? "confirmed" : ""}`}
    >
      <button
        className="shared-place-focus"
        onClick={onSelect}
        aria-label={`Focus map on ${discovery.city}`}
      >
        <span>{String(index + 1).padStart(2, "0")}</span>
        <MapPin />
      </button>
      <div>
        <p className="eyebrow">
          {confirmed
            ? "Confirmed shared moment"
            : !discovery.yearsComparable || discovery.sameCityDifferentTimes
              ? "Shared place"
              : "Overlapping chapter"}
        </p>
        <h3>{discovery.city}</h3>
        <strong>{years}</strong>
        <p>
          {!discovery.yearsComparable
            ? `You both have a chapter in ${discovery.city}. At least one date is unspecified, so no time overlap is claimed.`
            : discovery.sameCityDifferentTimes
            ? `You both lived in ${discovery.city}, at different times.`
            : `You were both in ${discovery.city} for approximately ${discovery.approximateYears} ${discovery.approximateYears === 1 ? "year" : "years"}. This does not mean you met here.`}
        </p>
      </div>
      {discovery.yearsComparable && !discovery.sameCityDifferentTimes && !confirmed ? (
        <button className="outline-button compact" onClick={onConfirm}>
          Confirm shared moment
        </button>
      ) : confirmed ? (
        <span className="shared-moment-status">
          <Check />
          Confirmed
        </span>
      ) : null}
    </article>
  );
}

function replayEvents(data: OurPathsData): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  const mineOrigin = data.mineTrail?.[0];
  const theirOrigin = data.theirTrail?.[0];
  if (mineOrigin?.arrivalYear)
    events.push({
      year: mineOrigin.arrivalYear,
      text: `${data.me.displayName} · ${mineOrigin.city}`,
      owner: "mine",
      city: mineOrigin.city,
    });
  if (theirOrigin?.arrivalYear)
    events.push({
      year: theirOrigin.arrivalYear,
      text: `${data.other.displayName} · ${theirOrigin.city}`,
      owner: "theirs",
      city: theirOrigin.city,
    });
  data.mineTrail?.slice(1).forEach(
    (stop) =>
      stop.arrivalYear &&
      events.push({
        year: stop.arrivalYear,
        text: `${data.me.displayName} begins a chapter in ${stop.city}.`,
        owner: "mine",
        city: stop.city,
      }),
  );
  data.theirTrail?.slice(1).forEach(
    (stop) =>
      stop.arrivalYear &&
      events.push({
        year: stop.arrivalYear,
        text: `${data.other.displayName} begins a chapter in ${stop.city}.`,
        owner: "theirs",
        city: stop.city,
      }),
  );
  data.discoveries.forEach(
    (item) =>
      item.overlapFrom &&
      events.push({
        year: item.overlapFrom,
        text: `Both lives overlap in ${item.city}.`,
        owner: "shared",
        city: item.city,
      }),
  );
  return events.sort((a, b) => a.year - b.year || (a.owner === "shared" ? 1 : -1));
}

function ReplayPanel({
  events,
  playing,
  eventIndex,
  onToggle,
  onRestart,
}: {
  events: ReplayEvent[];
  playing: boolean;
  eventIndex: number;
  onToggle: () => void;
  onRestart: () => void;
}) {
  const event = events[Math.min(eventIndex, Math.max(0, events.length - 1))];
  return (
    <div className={`replay-panel ${event?.owner ?? "mine"}`}>
      <div className="replay-progress">
        {events.map((item, index) => (
          <i
            key={`${item.year}-${item.owner}-${index}`}
            className={`${index <= eventIndex ? "active" : ""} ${item.owner}`}
          />
        ))}
      </div>
      <div>
        <span>Replay Our Paths</span>
        <time>{event?.year || "—"}</time>
        <p>{event?.text || "Two routes begin in different places."}</p>
      </div>
      <div>
        <button aria-label={playing ? "Pause replay" : "Play replay"} onClick={onToggle}>
          {playing ? <Pause /> : <Play />}
        </button>
        <button aria-label="Restart replay" onClick={onRestart}>
          <RotateCcw />
        </button>
      </div>
    </div>
  );
}

function SharedAtlasPanel({ data }: { data: OurPathsData }) {
  if (!data.permissions.canViewOtherFullAtlas || !data.theirTrail?.length) return null;
  return (
    <section className="friend-atlas-panel">
      <div>
        <p className="eyebrow">Shared directly with you</p>
        <h2>{data.other.displayName}’s Life Atlas</h2>
        <p>
          @{data.other.handle} explicitly shared this chapter route. Memories and photographs remain
          private.
        </p>
      </div>
      <ol>
        {data.theirTrail.map((stop, index) => (
          <li key={`${stop.id}-${index}`}>
            <i />
            <div>
              <strong>{stop.city}</strong>
              <span>{stop.country}</span>
            </div>
            <small>
              {stop.arrivalYear
                ? `${stop.arrivalYear}${stop.endYear ? `–${stop.endYear}` : "–present"}`
                : "Origin"}
              {stop.reason ? ` · ${stop.reason}` : ""}
            </small>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MapLoading() {
  return (
    <div className="social-map-loading">
      <div />
      <span>Drawing real geography…</span>
    </div>
  );
}

export function OurPathsView({
  data,
  onPermission,
  onConfirmMoment,
  onShare,
  previewReplay = false,
}: {
  data: OurPathsData;
  onPermission: (permission: "COMPARE" | "ATLAS" | "EXTERNAL_SHARE", allowed: boolean) => void;
  onConfirmMoment: (discovery: PathDiscovery) => void;
  onShare?: () => void;
  previewReplay?: boolean;
}) {
  const [playing, setPlaying] = useState(previewReplay);
  const [eventIndex, setEventIndex] = useState(previewReplay ? 1 : 0);
  const [selectedDiscovery, setSelectedDiscovery] = useState<number | null>(
    data.discoveries.length ? 0 : null,
  );
  const events = useMemo(() => replayEvents(data), [data]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setEventIndex((index) => {
          if (index >= events.length - 1) {
            setPlaying(false);
            return index;
          }
          return index + 1;
        }),
      1800,
    );
    return () => window.clearInterval(timer);
  }, [events.length, playing]);
  const confirmedCities = useMemo(
    () =>
      new Set(
        data.moments.filter((moment) => moment.status === "CONFIRMED").map((moment) => moment.city),
      ),
    [data.moments],
  );
  const fullRoutes = Boolean(
    data.permissions.fullComparisonAllowed && data.mineTrail?.length && data.theirTrail?.length,
  );
  const trailFallback = (handle: string): SocialTrailStop[] => [
    { id: handle, city: "", country: "", countryCode: "", latitude: 0, longitude: 0 },
  ];
  const currentEvent = events[Math.min(eventIndex, Math.max(0, events.length - 1))];
  const replayDiscovery =
    currentEvent?.owner === "shared"
      ? data.discoveries.findIndex((item) => item.city === currentEvent.city)
      : -1;
  const activeDiscovery = playing && replayDiscovery >= 0 ? replayDiscovery : selectedDiscovery;
  const sharedCount = data.discoveries.length;

  return (
    <main className="our-paths-page">
      <header className="paths-header">
        <Link to="/circle">
          <ArrowLeft />
          Life Circle
        </Link>
        <Link to="/" className="circle-brand">
          Life Atlas
        </Link>
        <span>Private comparison</span>
      </header>
      <section className="paths-hero">
        <div className="paths-intro">
          <p className="eyebrow">Our Paths</p>
          <h1>See where your lives overlapped.</h1>
          <p>Only geography both people permitted is shown.</p>
          {onShare ? <button className="outline-button paths-share-button" disabled={!data.permissions.externalShareAllowed} title={data.permissions.externalShareAllowed ? 'Preview the permitted Our Paths card' : 'Both people must allow external sharing first.'} onClick={onShare}><Share2/>Share Our Paths</button> : null}
        </div>
        <div className="dual-signatures">
          <MovementSignature
            trail={data.mineTrail?.length ? data.mineTrail : trailFallback(data.me.handle)}
            label={data.me.displayName}
            tone="mine"
          />
          <div className="signature-cross">
            <i />
            <span>×</span>
            <i />
          </div>
          <MovementSignature
            trail={data.theirTrail?.length ? data.theirTrail : trailFallback(data.other.handle)}
            label={data.other.displayName}
            tone="theirs"
          />
        </div>
      </section>

      {!data.permissions.compareAllowed ? (
        <section className="paths-locked">
          <div className="locked-globe">
            <ProfileMark handle={data.me.handle} size={100} />
            <span />
            <ProfileMark handle={data.other.handle} size={100} />
          </div>
          <p className="eyebrow">Comparison private</p>
          <h2>Path comparison is off.</h2>
          <p>
            {data.permissions.compareMine
              ? `Waiting for ${data.other.displayName} to allow comparison.`
              : "Both people must allow comparison. A connection alone reveals no places."}
          </p>
          <button
            className="primary-button"
            disabled={data.permissions.compareMine}
            onClick={() => onPermission("COMPARE", true)}
          >
            <Sparkles />
            {data.permissions.compareMine ? "Comparison requested" : "Compare our paths"}
          </button>
        </section>
      ) : (
        <>
          <section className="paths-map-stage" id="paths-map">
            <div className="paths-map-heading">
              <div>
                <p className="eyebrow">
                  {fullRoutes ? "Full route comparison" : "Permitted shared places"}
                </p>
                <h2>
                  {sharedCount
                    ? `${sharedCount} shared ${sharedCount === 1 ? "place" : "places"}`
                    : "No shared city — yet"}
                </h2>
              </div>
              <div className="path-legend">
                <span>
                  <i className="mine" />
                  {data.me.displayName}
                </span>
                <span>
                  <i className="theirs" />
                  {data.other.displayName}
                </span>
                <span>
                  <i className="shared" />
                  Shared place
                </span>
              </div>
            </div>
            <div className="paths-map-canvas">
              <Suspense fallback={<MapLoading />}>
                <SocialMapbox
                  mine={fullRoutes ? data.mineTrail! : []}
                  theirs={fullRoutes ? data.theirTrail! : []}
                  discoveries={data.discoveries}
                  activeDiscovery={activeDiscovery}
                  replayYear={playing ? (currentEvent?.year ?? null) : null}
                  onDiscovery={setSelectedDiscovery}
                />
              </Suspense>
            </div>
            {fullRoutes && events.length ? (
              <ReplayPanel
                events={events}
                playing={playing}
                eventIndex={eventIndex}
                onToggle={() => setPlaying((value) => !value)}
                onRestart={() => {
                  setEventIndex(0);
                  setPlaying(true);
                }}
              />
            ) : null}
          </section>

          <section className="discoveries-stage" id="shared-places">
            <div className="circle-section-title">
              <div>
                <p className="eyebrow">Shared places</p>
                <h2>
                  {sharedCount ? "Geography in both lives" : "Different routes, one connection"}
                </h2>
              </div>
              <span>{String(sharedCount).padStart(2, "0")}</span>
            </div>
            {sharedCount ? (
              <div className="discovery-list">
                {data.discoveries.map((discovery, index) => (
                  <SharedPlaceRow
                    key={`${discovery.city}-${discovery.overlapFrom}`}
                    discovery={discovery}
                    index={index}
                    selected={selectedDiscovery === index}
                    confirmed={confirmedCities.has(discovery.city)}
                    onSelect={() => setSelectedDiscovery(index)}
                    onConfirm={() => onConfirmMoment(discovery)}
                  />
                ))}
              </div>
            ) : (
              <div className="no-shared-path">
                <div className="two-route-key">
                  <i />
                  <i />
                </div>
                <h3>No shared city — yet.</h3>
                <p>
                  Both permitted routes remain visible above without creating a score or suggesting
                  a match.
                </p>
              </div>
            )}
          </section>
        </>
      )}
      <SharedAtlasPanel data={data} />
      <PermissionPanel data={data} onPermission={onPermission} />
    </main>
  );
}
