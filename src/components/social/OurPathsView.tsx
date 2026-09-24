import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  LockKeyhole,
  MapPin,
  Pause,
  Play,
  RotateCcw,
  Share2,
  SkipForward,
  Users,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { LifeAtlasMobileNav } from "@/components/LifeAtlasMobileNav";
import { activePlaceAtYear, approximateDistanceKm, knownYearRange } from "@/lib/our-paths-timeline";
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
    friendsSharingMine: boolean;
    friendsSharingTheirs: boolean;
    externalMine: boolean;
    externalTheirs: boolean;
    compareAllowed: boolean;
    fullComparisonAllowed: boolean;
    canViewOtherFullAtlas: boolean;
    externalShareAllowed: boolean;
  };
  friendOptions?: Array<{ displayName: string; handle: string }>;
  additional?: {
    profile: {
      displayName: string;
      handle: string;
      avatarUrl: string | null;
      mutualConnections: number;
      requestStatus: string;
    };
    permissions: {
      compareAllowed: boolean;
      fullComparisonAllowed: boolean;
      canViewOtherFullAtlas: boolean;
    };
    discoveries: PathDiscovery[];
    trail: SocialTrailStop[] | null;
  } | null;
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

function ExternalSharingPanel({
  data,
  onPermission,
}: {
  data: OurPathsData;
  onPermission: (permission: "EXTERNAL_SHARE", allowed: boolean) => void;
}) {
  return (
    <aside className="paths-permission-panel">
      <div>
        <LockKeyhole />
        <div>
          <strong>External sharing</strong>
          <p>Your friendship already covers this private view. Exporting it is a separate choice.</p>
        </div>
      </div>
      <button
        className={data.permissions.externalMine ? "permission-row active" : "permission-row"}
        aria-pressed={data.permissions.externalMine}
        disabled={!data.permissions.compareAllowed}
        onClick={() => onPermission("EXTERNAL_SHARE", !data.permissions.externalMine)}
      >
        <span>
          <Share2 />
          <span>
            <strong>Allow an Our Paths card</strong>
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

function PathYearPanel({
  min,
  max,
  year,
  playing,
  people,
  overlapText,
  onYear,
  onToggle,
  onRestart,
  onSkip,
}: {
  min: number;
  max: number;
  year: number;
  playing: boolean;
  people: Array<{ name: string; place: string | null; distanceKm: number | null; tone: string }>;
  overlapText: string | null;
  onYear: (year: number) => void;
  onToggle: () => void;
  onRestart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="paths-year-panel">
      <div className="paths-year-heading">
        <span>Recorded year</span>
        <time>{year}</time>
        <div className="paths-playback-controls" role="group" aria-label="Timeline playback controls">
          <button aria-label={playing ? "Pause timeline" : "Play timeline"} onClick={onToggle}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button aria-label="Next recorded year" onClick={onSkip}>
            <SkipForward />
          </button>
          <button aria-label="Restart timeline" onClick={onRestart}>
            <RotateCcw />
          </button>
        </div>
      </div>
      <input
        aria-label="Our Paths year"
        type="range"
        min={min}
        max={max}
        value={year}
        onChange={(event) => onYear(Number(event.target.value))}
      />
      <div className="paths-year-locations">
        {people.map((person) => (
          <p key={person.name} className={person.tone}>
            <i />
            <span>
              <strong>{person.name}</strong>
              <small>{person.place ?? "No recorded location for this year"}</small>
            </span>
            {person.distanceKm !== null ? (
              <b>≈ {person.distanceKm.toLocaleString()} km apart</b>
            ) : null}
          </p>
        ))}
      </div>
      <p className="paths-year-note">
        {overlapText ?? "Locations reflect recorded chapter dates only. Distance is approximate."}
      </p>
    </div>
  );
}

function SharedAtlasPanel({ data }: { data: OurPathsData }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!data.permissions.canViewOtherFullAtlas || !data.theirTrail?.length) return null;
  return (
    <section className="friend-atlas-panel">
      <div>
        <p className="eyebrow">Shared directly with you</p>
        <h2>{data.other.displayName}’s Life Atlas</h2>
        <p>
          Shared with accepted friends. Anything marked Private by @{data.other.handle} is omitted.
        </p>
      </div>
      <ol>
        {data.theirTrail.map((stop, index) => (
          <li key={`${stop.id}-${index}`}>
            <i />
            <div className="friend-atlas-copy">
              <strong>{stop.city}</strong>
              <span>{stop.country}</span>
              {stop.title ? <h3>{stop.title}</h3> : null}
              {stop.memory ? <p>{stop.memory}</p> : null}
              {stop.photos?.length ? (
                <div className="friend-atlas-photos">
                  {stop.photos.slice(0, 4).map((photo) => (
                    <button key={photo.id} onClick={() => setLightbox(photo.url)} aria-label={`Open photograph from ${stop.city}`}>
                      <img src={photo.url} alt={photo.caption || `A chapter photograph from ${stop.city}`} />
                    </button>
                  ))}
                </div>
              ) : null}
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
      {lightbox ? (
        <button className="atlas-photo-lightbox" onClick={() => setLightbox(null)} aria-label="Close photograph">
          <img src={lightbox} alt="Expanded chapter photograph" />
          <span>Close</span>
        </button>
      ) : null}
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
  onAdditionalFriend,
  previewReplay = false,
}: {
  data: OurPathsData;
  onPermission: (permission: "EXTERNAL_SHARE", allowed: boolean) => void;
  onConfirmMoment: (discovery: PathDiscovery) => void;
  onShare?: () => void;
  onAdditionalFriend?: (handle: string | null) => void;
  previewReplay?: boolean;
}) {
  const [playing, setPlaying] = useState(previewReplay);
  const [timelineYear, setTimelineYear] = useState<number | null>(null);
  const [selectedDiscovery, setSelectedDiscovery] = useState<number | null>(
    data.discoveries.length ? 0 : null,
  );
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
  const additionalFullRoute = Boolean(
    data.additional?.permissions.fullComparisonAllowed && data.additional.trail?.length,
  );
  const timelineRange = useMemo(
    () =>
      knownYearRange(
        [
          data.mineTrail,
          fullRoutes ? data.theirTrail : null,
          additionalFullRoute ? data.additional?.trail : null,
        ],
        [...data.discoveries, ...(data.additional?.discoveries ?? [])].map((item) => ({
          from: item.overlapFrom,
          to: item.overlapTo,
        })),
      ),
    [
      additionalFullRoute,
      data.additional,
      data.discoveries,
      data.mineTrail,
      data.theirTrail,
      fullRoutes,
    ],
  );
  useEffect(() => {
    if (!timelineRange) {
      setTimelineYear(null);
      setPlaying(false);
      return;
    }
    setTimelineYear((year) =>
      year === null || year < timelineRange.min || year > timelineRange.max
        ? timelineRange.min
        : year,
    );
  }, [timelineRange]);
  useEffect(() => {
    if (!playing || !timelineRange) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(
      () =>
        setTimelineYear((year) => {
          const current = year ?? timelineRange.min;
          if (current >= timelineRange.max) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      900,
    );
    return () => window.clearInterval(timer);
  }, [playing, timelineRange]);
  const trailFallback = (handle: string): SocialTrailStop[] => [
    { id: handle, city: "", country: "", countryCode: "", latitude: 0, longitude: 0 },
  ];
  const sharedCount = data.discoveries.length;
  const activeYear = timelineYear ?? timelineRange?.min ?? null;
  const activeMine = activeYear === null ? null : activePlaceAtYear(data.mineTrail, activeYear);
  const activeTheirs = activeYear === null ? null : activePlaceAtYear(data.theirTrail, activeYear);
  const activeAdditional =
    activeYear === null ? null : activePlaceAtYear(data.additional?.trail, activeYear);
  const activeOverlap =
    activeYear === null
      ? null
      : [...data.discoveries, ...(data.additional?.discoveries ?? [])].find(
          (item) =>
            item.overlapFrom !== null &&
            item.overlapTo !== null &&
            item.overlapFrom <= activeYear &&
            item.overlapTo >= activeYear,
        );
  const timelinePeople = [
    {
      name: data.me.displayName,
      place: activeMine?.city ?? null,
      distanceKm: null,
      tone: "mine",
    },
    {
      name: data.other.displayName,
      place: activeTheirs?.city ?? null,
      distanceKm: approximateDistanceKm(activeMine, activeTheirs),
      tone: "theirs",
    },
    ...(data.additional
      ? [
          {
            name: data.additional.profile.displayName,
            place: activeAdditional?.city ?? null,
            distanceKm: approximateDistanceKm(activeMine, activeAdditional),
            tone: "additional",
          },
        ]
      : []),
  ];

  return (
    <main className="our-paths-page">
      <LifeAtlasMobileNav active="circle" />
      <header className="paths-header">
        <Link to="/circle">
          <ArrowLeft />
          Life Circle
        </Link>
        <Link to="/" className="circle-brand">
          Life Atlas
        </Link>
        <span>Friends-only view</span>
      </header>
      <section className="paths-hero">
        <div className="paths-intro">
          <p className="eyebrow">Our Paths</p>
          <h1>Two lives, one living map.</h1>
          <p>Routes, chapter photographs and shared places — visible only between accepted friends.</p>
          <div className="paths-hero-actions">
            <Link
              to="/atlas/friend/$handle"
              params={{ handle: data.other.handle }}
              className="outline-button"
            >
              <Eye /> {data.other.displayName}’s Atlas
            </Link>
            {onShare ? (
              <button
                className="outline-button paths-share-button"
                disabled={!data.permissions.externalShareAllowed}
                title={
                  data.permissions.externalShareAllowed
                    ? "Preview the permitted Our Paths card"
                    : "Both people must allow external sharing first."
                }
                onClick={onShare}
              >
                <Share2 /> Share Our Paths
              </button>
            ) : null}
          </div>
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

      <section className="paths-friend-selector" aria-label="Friends on this globe">
        <div>
          <Users />
          <span>
            <strong>Friends on this globe</strong>
            <small>
              You + {data.other.displayName}
              {data.additional ? ` + ${data.additional.profile.displayName}` : ""}. Each route keeps
              its owner’s Friends-only or Private setting.
            </small>
          </span>
        </div>
        <label>
          <span>Add a second friend</span>
          <select
            aria-label="Add a second friend to Our Paths"
            value={data.additional?.profile.handle ?? ""}
            disabled={!onAdditionalFriend || !(data.friendOptions?.length ?? 0)}
            onChange={(event) => onAdditionalFriend?.(event.target.value || null)}
          >
            <option value="">
              {data.friendOptions?.length
                ? "Choose an accepted friend"
                : "No other friends available"}
            </option>
            {data.friendOptions?.map((friend) => (
              <option key={friend.handle} value={friend.handle}>
                {friend.displayName} · @{friend.handle}
              </option>
            ))}
          </select>
        </label>
        {data.additional && !data.additional.permissions.compareAllowed ? (
          <p>
            @{data.additional.profile.handle} is keeping their Atlas private.
          </p>
        ) : null}
        {data.additional?.permissions.canViewOtherFullAtlas ? (
          <Link
            to="/atlas/friend/$handle"
            params={{ handle: data.additional.profile.handle }}
            className="paths-friend-atlas-link"
          >
            View {data.additional.profile.displayName}’s Atlas
          </Link>
        ) : null}
      </section>

      {!data.permissions.compareAllowed ? (
        <section className="paths-private-note">
          <div className="locked-globe">
            <ProfileMark handle={data.me.handle} displayName={data.me.displayName} size={72} />
            <span />
            <ProfileMark handle={data.other.handle} displayName={data.other.displayName} avatarUrl={data.other.avatarUrl} size={72} />
          </div>
          <div>
          <p className="eyebrow">Private by choice</p>
          <h2>{data.other.displayName}’s route is not shared.</h2>
          <p>
            Your route remains available to you. If @{data.other.handle} changes their Atlas to Friends-only, this globe updates automatically.
          </p>
          </div>
        </section>
      ) : null}
        <>
          <section className="paths-map-stage" id="paths-map">
            <div className="paths-map-heading">
              <div>
                <p className="eyebrow">
                  {fullRoutes || additionalFullRoute
                    ? "Permitted route comparison"
                    : "Permitted shared places"}
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
                {data.additional ? (
                  <span>
                    <i className="additional" />
                    {data.additional.profile.displayName}
                  </span>
                ) : null}
                <span>
                  <i className="shared" />
                  Shared place
                </span>
              </div>
            </div>
            <div className="paths-map-canvas">
              <Suspense fallback={<MapLoading />}>
                <SocialMapbox
                  mine={data.mineTrail ?? []}
                  theirs={fullRoutes ? data.theirTrail! : []}
                  additional={additionalFullRoute ? (data.additional?.trail ?? []) : []}
                  discoveries={data.discoveries}
                  additionalDiscoveries={
                    data.additional?.permissions.compareAllowed ? data.additional.discoveries : []
                  }
                  activeDiscovery={selectedDiscovery}
                  replayYear={activeYear}
                  onDiscovery={setSelectedDiscovery}
                />
              </Suspense>
            </div>
            {timelineRange && activeYear !== null && Boolean(data.mineTrail?.length) ? (
              <PathYearPanel
                min={timelineRange.min}
                max={timelineRange.max}
                year={activeYear}
                playing={playing}
                people={timelinePeople}
                overlapText={
                  activeOverlap
                    ? `Shared-city overlap recorded in ${activeOverlap.city}. This does not mean you met there.`
                    : null
                }
                onYear={(year) => {
                  setPlaying(false);
                  setTimelineYear(year);
                }}
                onToggle={() => {
                  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                    setTimelineYear(Math.min(activeYear + 1, timelineRange.max));
                    return;
                  }
                  setPlaying((value) => !value);
                }}
                onRestart={() => {
                  setTimelineYear(timelineRange.min);
                  setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
                }}
                onSkip={() => {
                  setPlaying(false);
                  setTimelineYear(Math.min(activeYear + 1, timelineRange.max));
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
            {data.additional?.permissions.compareAllowed ? (
              <div className="additional-discoveries">
                <p className="eyebrow">You + {data.additional.profile.displayName}</p>
                <h3>
                  {data.additional.discoveries.length
                    ? `${data.additional.discoveries.length} independently permitted shared ${data.additional.discoveries.length === 1 ? "place" : "places"}`
                    : "No shared city in the permitted dates"}
                </h3>
                {data.additional.discoveries.map((discovery) => (
                  <p
                    key={`${data.additional?.profile.handle}-${discovery.city}-${discovery.overlapFrom}`}
                  >
                    <i />
                    <strong>{discovery.city}</strong>
                    <span>
                      {!discovery.yearsComparable
                        ? "Dates not specified"
                        : discovery.sameCityDifferentTimes
                          ? "Different recorded years"
                          : `${discovery.overlapFrom}${discovery.overlapFrom !== discovery.overlapTo ? `–${discovery.overlapTo}` : ""}`}
                    </span>
                  </p>
                ))}
                <small>
                  These results compare only your Atlas with @{data.additional.profile.handle}; they
                  reveal nothing between your two friends.
                </small>
              </div>
            ) : null}
          </section>
        </>
      <SharedAtlasPanel data={data} />
      <ExternalSharingPanel data={data} onPermission={onPermission} />
    </main>
  );
}
