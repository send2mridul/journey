import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChapterPeoplePanel, type ChapterPerson } from "@/components/social/ChapterPeoplePanel";
import { LifeCircleView, type CircleData } from "@/components/social/LifeCircleView";
import { OurPathsView, type OurPathsData } from "@/components/social/OurPathsView";
import { PlaceMapPreview } from "@/components/social/SocialVisuals";

type PreviewView =
  | "circle"
  | "chapter"
  | "paths-none"
  | "paths-one"
  | "paths-multiple"
  | "paths-full"
  | "paths-replay"
  | "paths-shared"
  | "paths-share-card";

export const Route = createFileRoute("/social-preview")({
  validateSearch: (search: Record<string, unknown>) => ({
    view: [
      "circle",
      "chapter",
      "paths-none",
      "paths-one",
      "paths-multiple",
      "paths-full",
      "paths-replay",
      "paths-shared",
      "paths-share-card",
    ].includes(String(search["view"]))
      ? (String(search["view"]) as PreviewView)
      : ("circle" as PreviewView),
    clean: String(search["clean"]) === "1" || String(search["clean"]) === "true",
  }),
  component: SocialPreviewRoute,
});

const circleData: CircleData = {
  profile: {
    displayName: "Mridul",
    handle: "mridul",
    discoverability: "LIMITED",
    friendListVisibility: "ONLY_ME",
  },
  incoming: [
    {
      requestId: "00000000-0000-4000-8000-000000000001",
      incoming: true,
      profile: {
        displayName: "Priya Shah",
        handle: "priya",
        avatarUrl: null,
        mutualConnections: 2,
        requestStatus: "INCOMING",
      },
      compare: { mine: false, theirs: false },
      atlas: { mine: false, theirs: false },
    },
  ],
  outgoing: [],
  blocked: [
    {
      displayName: "Aarav Kapoor",
      handle: "aarav",
      avatarUrl: null,
      mutualConnections: 0,
      requestStatus: "NONE",
    },
  ],
  friends: [
    {
      requestId: "00000000-0000-4000-8000-000000000002",
      incoming: false,
      profile: {
        displayName: "Rohan Mehta",
        handle: "rohan",
        avatarUrl: null,
        mutualConnections: 1,
        requestStatus: "CONNECTED",
      },
      compare: { mine: true, theirs: true },
      atlas: { mine: true, theirs: true },
    },
    {
      requestId: "00000000-0000-4000-8000-000000000003",
      incoming: false,
      profile: {
        displayName: "Ankit Rao",
        handle: "ankit",
        avatarUrl: null,
        mutualConnections: 2,
        requestStatus: "CONNECTED",
      },
      compare: { mine: false, theirs: false },
      atlas: { mine: false, theirs: false },
    },
  ],
  suggestions: [
    {
      displayName: "Aarohi Srinivasan",
      handle: "aarohi",
      avatarUrl: null,
      mutualConnections: 2,
      requestStatus: "NONE",
    },
  ],
  chapterRequests: [],
  momentRequests: [],
  activities: [
    {
      type: "SHARED_MOMENT_CONFIRMED",
      actorName: "Rohan Mehta",
      actorHandle: "rohan",
      createdAt: "2026-09-18T10:00:00.000Z",
    },
    {
      type: "CONNECTION_ACCEPTED",
      actorName: "Ankit Rao",
      actorHandle: "ankit",
      createdAt: "2026-09-12T10:00:00.000Z",
    },
  ],
};

const mineTrail = [
  {
    id: "patna",
    city: "Patna",
    country: "India",
    countryCode: "IN",
    latitude: 25.5941,
    longitude: 85.1376,
    arrivalYear: 2000,
    endYear: 2021,
  },
  {
    id: "bengaluru",
    city: "Bengaluru",
    country: "India",
    countryCode: "IN",
    latitude: 12.9716,
    longitude: 77.5946,
    arrivalYear: 2021,
    endYear: 2025,
    reason: "Career",
  },
  {
    id: "london",
    city: "London",
    country: "United Kingdom",
    countryCode: "GB",
    latitude: 51.5072,
    longitude: -0.1276,
    arrivalYear: 2025,
    endYear: null,
    reason: "Career",
  },
];
const theirTrail = [
  {
    id: "jaipur",
    city: "Jaipur",
    country: "India",
    countryCode: "IN",
    latitude: 26.9124,
    longitude: 75.7873,
    arrivalYear: 2000,
    endYear: 2018,
  },
  {
    id: "delhi",
    city: "Delhi",
    country: "India",
    countryCode: "IN",
    latitude: 28.6139,
    longitude: 77.209,
    arrivalYear: 2018,
    endYear: 2022,
    reason: "Study",
  },
  {
    id: "bengaluru-rohan",
    city: "Bengaluru",
    country: "India",
    countryCode: "IN",
    latitude: 12.9716,
    longitude: 77.5946,
    arrivalYear: 2022,
    endYear: 2024,
    reason: "Career",
  },
  {
    id: "singapore",
    city: "Singapore",
    country: "Singapore",
    countryCode: "SG",
    latitude: 1.3521,
    longitude: 103.8198,
    arrivalYear: 2024,
    endYear: null,
    reason: "Opportunity",
  },
];
const bengaluru = {
  city: "Bengaluru",
  country: "India",
  countryCode: "IN",
  latitude: 12.9716,
  longitude: 77.5946,
  overlapFrom: 2022,
  overlapTo: 2024,
  approximateYears: 3,
  yearsComparable: true,
  sameCityDifferentTimes: false,
};
const delhi = {
  city: "Delhi",
  country: "India",
  countryCode: "IN",
  latitude: 28.6139,
  longitude: 77.209,
  overlapFrom: null,
  overlapTo: null,
  approximateYears: 0,
  yearsComparable: true,
  sameCityDifferentTimes: true,
};

function pathsData(view: PreviewView): OurPathsData {
  const full = view === "paths-full" || view === "paths-replay" || view === "paths-none";
  const multiple = view === "paths-multiple" || view === "paths-full" || view === "paths-replay";
  const sharedMoment = view === "paths-shared" || multiple;
  const discoveries = view === "paths-none" ? [] : multiple ? [bengaluru, delhi] : [bengaluru];
  return {
    me: { displayName: "Mridul", handle: "mridul" },
    other: {
      displayName: "Rohan",
      handle: "rohan",
      avatarUrl: null,
      mutualConnections: 2,
      requestStatus: "CONNECTED",
    },
    permissions: {
      compareMine: true,
      compareTheirs: true,
      atlasMine: full,
      atlasTheirs: full,
      externalMine: false,
      externalTheirs: false,
      compareAllowed: true,
      fullComparisonAllowed: full,
      canViewOtherFullAtlas: full,
      externalShareAllowed: false,
    },
    discoveries,
    mineTrail: full ? mineTrail : null,
    theirTrail: full ? theirTrail : null,
    moments: sharedMoment
      ? [
          {
            id: "moment-one",
            city: "Bengaluru",
            yearFrom: 2022,
            yearTo: 2024,
            title: "Where our paths crossed",
            memory: null,
            status: "CONFIRMED",
            mineVisible: true,
            theirVisible: true,
          },
        ]
      : [],
  } as OurPathsData;
}

const chapterPeople: ChapterPerson[] = [
  { id: "one", name: "Rohan Mehta", handle: "rohan", status: "CONFIRMED", placeholder: false },
  { id: "two", name: "Priya Shah", handle: "priya", status: "PENDING", placeholder: false },
  { id: "three", name: "Ananya", handle: null, status: "PLACEHOLDER", placeholder: true },
];

function PreviewNavigation({ view }: { view: PreviewView }) {
  const items: Array<[PreviewView, string]> = [
    ["circle", "Life Circle"],
    ["chapter", "Chapter"],
    ["paths-none", "No shared city"],
    ["paths-one", "One shared city"],
    ["paths-multiple", "Multiple cities"],
    ["paths-full", "Full comparison"],
    ["paths-replay", "Replay"],
    ["paths-shared", "Shared moment"],
    ["paths-share-card", "Share card"],
  ];
  return (
    <nav className="social-preview-nav" aria-label="Social preview states">
      {items.map(([value, label]) => (
        <a
          key={value}
          className={view === value ? "active" : ""}
          href={`/social-preview?view=${value}`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

function SocialPreviewRoute() {
  const { view, clean } = Route.useSearch();
  if (!import.meta.env.DEV)
    return (
      <main className="shared-missing">
        <p className="eyebrow">Life Atlas</p>
        <h1>Preview unavailable</h1>
        <p>This fixture gallery is available only during local visual review.</p>
      </main>
    );
  if (view === "circle")
    return (
      <div className="social-preview-shell">
        {!clean && <PreviewNavigation view={view} />}
        <LifeCircleView
          data={circleData}
          searchQuery=""
          searchResults={[]}
          searching={false}
          onSearchQuery={() => {}}
          onConnect={() => {}}
          onRespond={() => {}}
          onChangeConnection={() => {}}
          onUnblock={() => {}}
          onRespondTag={() => {}}
          onRespondMoment={() => {}}
        />
      </div>
    );
  if (view === "chapter")
    return (
      <div className="social-preview-shell">
        {!clean && <PreviewNavigation view={view} />}
        <main className="chapter-preview-page">
          <header>
            <p className="eyebrow">Chapter 02</p>
            <h1>Bengaluru</h1>
            <p>2021–2025 · Career</p>
          </header>
          <PlaceMapPreview
            city="Bengaluru"
            country="India"
            latitude={12.9716}
            longitude={77.5946}
          />
          <ChapterPeoplePanel
            city="Bengaluru"
            people={chapterPeople}
            friends={[{ displayName: 'Rohan Mehta', handle: 'rohanmoves' }]}
            onAddFriend={async () => {}}
          />
        </main>
      </div>
    );
  if (view === "paths-share-card") return <OurPathsCardFixture />;
  return (
    <div className="social-preview-shell">
      {!clean && <PreviewNavigation view={view} />}
      <OurPathsView
        data={pathsData(view)}
        previewReplay={view === "paths-replay"}
        onPermission={() => {}}
        onConfirmMoment={() => {}}
      />
    </div>
  );
}

function OurPathsCardFixture() {
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const fixture = pathsData("paths-full");
    void import("@/lib/share-card").then(({ renderOurPathsCard }) => renderOurPathsCard({
      mineName: fixture.me.displayName,
      otherName: fixture.other.displayName,
      mineTrail: fixture.mineTrail ?? [],
      theirTrail: fixture.theirTrail ?? [],
      sharedPlaces: fixture.discoveries.map((place) => ({ city: place.city, country: place.country, latitude: place.latitude, longitude: place.longitude, overlapFrom: place.overlapFrom, overlapTo: place.overlapTo })),
    })).then(setPreview);
  }, []);
  async function save() {
    if (!preview) return;
    const blob = await (await fetch(preview)).blob();
    const response = await fetch("http://127.0.0.1:3999/?name=our-paths-mridul-rohan-1200x630.png", { method: "POST", body: blob });
    setStatus(response.ok ? "Fixture PNG saved." : "Fixture receiver unavailable.");
  }
  return <main className="social-preview-shell"><PreviewNavigation view="paths-share-card"/><section className="mx-auto max-w-[1280px] px-8 py-24"><p className="eyebrow">Our Paths card · fixture</p><h1 className="mt-3 font-editorial text-5xl">Real 1200 × 630 output</h1><div className="share-preview-frame is-og mt-8">{preview ? <img src={preview} alt="Our Paths fixture card"/> : <div className="share-preview-loading">Rendering card…</div>}</div><button className="primary-button mt-6" disabled={!preview} onClick={() => void save()}>Save fixture PNG</button>{status && <p role="status" className="save-message">{status}</p>}</section></main>;
}
