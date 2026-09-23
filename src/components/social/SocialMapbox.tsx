import { useCallback, useEffect, useMemo, useRef } from "react";
import { LocateFixed } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { greatCircleArc, shortestLongitude } from "@/lib/atlas-data";
import type { PathDiscovery, SocialTrailStop } from "./SocialVisuals";

type SocialMapboxProps = {
  mine?: SocialTrailStop[];
  theirs?: SocialTrailStop[];
  additional?: SocialTrailStop[];
  discoveries?: PathDiscovery[];
  additionalDiscoveries?: PathDiscovery[];
  activeDiscovery?: number | null;
  replayYear?: number | null;
  onDiscovery?: (index: number) => void;
  place?: { city: string; country: string; latitude: number; longitude: number };
  compact?: boolean;
};

type MapState = {
  mine: SocialTrailStop[];
  theirs: SocialTrailStop[];
  additional: SocialTrailStop[];
  discoveries: PathDiscovery[];
  additionalDiscoveries: PathDiscovery[];
  activeDiscovery: number | null;
  replayYear: number | null;
  place: SocialMapboxProps["place"] | undefined;
};

const MINE = "#b65335";
const THEIRS = "#315d70";
const ADDITIONAL = "#78637f";
const SHARED = "#d19a43";

function collection(features: unknown[]) {
  return { type: "FeatureCollection" as const, features };
}

function visibleTrail(trail: SocialTrailStop[], replayYear?: number | null) {
  if (!replayYear) return trail;
  return trail.filter((stop) => stop.arrivalYear !== undefined && stop.arrivalYear <= replayYear);
}

function currentNode(trail: SocialTrailStop[], replayYear?: number | null) {
  if (!replayYear) return [];
  const current = trail
    .filter(
      (stop) =>
        stop.arrivalYear !== undefined &&
        stop.arrivalYear <= replayYear &&
        (stop.endYear === undefined || stop.endYear >= replayYear),
    )
    .at(-1);
  return current
    ? [
        {
          type: "Feature" as const,
          properties: { city: current.city },
          geometry: { type: "Point" as const, coordinates: [current.longitude, current.latitude] },
        },
      ]
    : [];
}

function routeFeatures(trail: SocialTrailStop[], replayYear?: number | null) {
  const visible = visibleTrail(trail, replayYear);
  return visible.slice(1).map((stop, index) => ({
    type: "Feature" as const,
    properties: { index, year: stop.arrivalYear ?? null },
    geometry: {
      type: "LineString" as const,
      coordinates: greatCircleArc(
        [visible[index]!.longitude, visible[index]!.latitude],
        [stop.longitude, stop.latitude],
        110,
      ),
    },
  }));
}

function trailNodes(trail: SocialTrailStop[], replayYear?: number | null) {
  return visibleTrail(trail, replayYear).map((stop, index) => ({
    type: "Feature" as const,
    properties: { city: stop.city, index: index + 1 },
    geometry: { type: "Point" as const, coordinates: [stop.longitude, stop.latitude] },
  }));
}

function discoveryNodes(discoveries: PathDiscovery[], replayYear?: number | null) {
  return discoveries.flatMap((discovery, index) => {
    if (replayYear && discovery.overlapFrom && discovery.overlapFrom > replayYear) return [];
    return [
      {
        type: "Feature" as const,
        properties: { index, number: String(index + 1).padStart(2, "0"), city: discovery.city },
        geometry: {
          type: "Point" as const,
          coordinates: [discovery.longitude, discovery.latitude],
        },
      },
    ];
  });
}

export default function SocialMapbox({
  mine = [],
  theirs = [],
  additional = [],
  discoveries = [],
  additionalDiscoveries = [],
  activeDiscovery = null,
  replayYear = null,
  onDiscovery,
  place,
  compact = false,
}: SocialMapboxProps) {
  const token =
    import.meta.env["VITE_MAPBOX_PUBLIC_TOKEN"] ??
    import.meta.env["VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN"];
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const onDiscoveryRef = useRef(onDiscovery);
  const stateRef = useRef<MapState>({
    mine,
    theirs,
    additional,
    discoveries,
    additionalDiscoveries,
    activeDiscovery,
    replayYear,
    place,
  });
  const signature = useMemo(
    () =>
      [
        ...mine.map((stop) => `m:${stop.id}:${stop.longitude}:${stop.latitude}`),
        ...theirs.map((stop) => `t:${stop.id}:${stop.longitude}:${stop.latitude}`),
        ...additional.map((stop) => `a:${stop.id}:${stop.longitude}:${stop.latitude}`),
        ...discoveries.map((item) => `s:${item.city}:${item.longitude}:${item.latitude}`),
        ...additionalDiscoveries.map(
          (item) => `as:${item.city}:${item.longitude}:${item.latitude}`,
        ),
        place ? `p:${place.longitude}:${place.latitude}` : "",
      ].join("|"),
    [additional, additionalDiscoveries, discoveries, mine, place, theirs],
  );
  onDiscoveryRef.current = onDiscovery;
  stateRef.current = {
    mine,
    theirs,
    additional,
    discoveries,
    additionalDiscoveries,
    activeDiscovery,
    replayYear,
    place,
  };

  function updateSources() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const current = stateRef.current;
    const mineFeatures = routeFeatures(current.mine ?? [], current.replayYear);
    const theirFeatures = routeFeatures(current.theirs ?? [], current.replayYear);
    const additionalFeatures = routeFeatures(current.additional ?? [], current.replayYear);
    const sharedFeatures = discoveryNodes(current.discoveries ?? [], current.replayYear);
    const additionalSharedFeatures = discoveryNodes(
      current.additionalDiscoveries ?? [],
      current.replayYear,
    );
    (map.getSource("social-mine-route") as mapboxgl.GeoJSONSource)?.setData(
      collection(mineFeatures),
    );
    (map.getSource("social-their-route") as mapboxgl.GeoJSONSource)?.setData(
      collection(theirFeatures),
    );
    (map.getSource("social-additional-route") as mapboxgl.GeoJSONSource)?.setData(
      collection(additionalFeatures),
    );
    (map.getSource("social-mine-nodes") as mapboxgl.GeoJSONSource)?.setData(
      collection(trailNodes(current.mine ?? [], current.replayYear)),
    );
    (map.getSource("social-their-nodes") as mapboxgl.GeoJSONSource)?.setData(
      collection(trailNodes(current.theirs ?? [], current.replayYear)),
    );
    (map.getSource("social-additional-nodes") as mapboxgl.GeoJSONSource)?.setData(
      collection(trailNodes(current.additional ?? [], current.replayYear)),
    );
    (map.getSource("social-mine-current") as mapboxgl.GeoJSONSource)?.setData(
      collection(currentNode(current.mine ?? [], current.replayYear)),
    );
    (map.getSource("social-their-current") as mapboxgl.GeoJSONSource)?.setData(
      collection(currentNode(current.theirs ?? [], current.replayYear)),
    );
    (map.getSource("social-additional-current") as mapboxgl.GeoJSONSource)?.setData(
      collection(currentNode(current.additional ?? [], current.replayYear)),
    );
    (map.getSource("social-shared") as mapboxgl.GeoJSONSource)?.setData(collection(sharedFeatures));
    (map.getSource("social-additional-shared") as mapboxgl.GeoJSONSource)?.setData(
      collection(additionalSharedFeatures),
    );
    (map.getSource("social-place") as mapboxgl.GeoJSONSource)?.setData(
      collection(
        current.place
          ? [
              {
                type: "Feature",
                properties: { city: current.place.city },
                geometry: {
                  type: "Point",
                  coordinates: [current.place.longitude, current.place.latitude],
                },
              },
            ]
          : [],
      ),
    );
  }

  const frameAll = useCallback(
    (force = false) => {
      const map = mapRef.current;
      if (!map || !loadedRef.current) return;
      const current = stateRef.current;
      if (current.place) {
        map.easeTo({
          center: [current.place.longitude, current.place.latitude],
          zoom: compact ? 5.4 : 4.8,
          pitch: 0,
          bearing: 0,
          duration: force ? 700 : 0,
          essential: false,
        });
        return;
      }
      const coordinates = [
        ...(current.mine ?? []).map((stop) => [stop.longitude, stop.latitude] as [number, number]),
        ...(current.theirs ?? []).map(
          (stop) => [stop.longitude, stop.latitude] as [number, number],
        ),
        ...(current.additional ?? []).map(
          (stop) => [stop.longitude, stop.latitude] as [number, number],
        ),
        ...(current.discoveries ?? []).map(
          (item) => [item.longitude, item.latitude] as [number, number],
        ),
        ...(current.additionalDiscoveries ?? []).map(
          (item) => [item.longitude, item.latitude] as [number, number],
        ),
      ];
      if (!coordinates.length) return;
      if (coordinates.length === 1) {
        const [onlyCoordinate] = coordinates;
        if (!onlyCoordinate) return;
        map.easeTo({
          center: onlyCoordinate,
          zoom: 4.5,
          pitch: 12,
          duration: force ? 900 : 0,
          essential: false,
        });
        return;
      }
      const bounds = new mapboxgl.LngLatBounds();
      let previousLongitude = coordinates[0]![0];
      coordinates.forEach(([longitude, latitude], index) => {
        const adjusted = index ? shortestLongitude(previousLongitude, longitude) : longitude;
        previousLongitude = adjusted;
        bounds.extend([adjusted, latitude]);
      });
      const mobile = window.innerWidth < 700;
      map.fitBounds(bounds, {
        padding: mobile
          ? { top: 70, bottom: 150, left: 44, right: 44 }
          : { top: 80, bottom: 90, left: 80, right: 80 },
        maxZoom: 5.1,
        duration: force ? 1000 : 0,
        pitch: 12,
        bearing: 0,
        essential: false,
      });
    },
    [compact],
  );

  useEffect(() => {
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;
    const current = stateRef.current;
    const initialCenter: [number, number] = current.place
      ? [current.place.longitude, current.place.latitude]
      : current.discoveries?.[0]
        ? [current.discoveries[0].longitude, current.discoveries[0].latitude]
        : [48, 20];
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: initialCenter,
      zoom: current.place ? 5.4 : 1.6,
      pitch: current.place ? 0 : 12,
      bearing: 0,
      projection: compact ? "mercator" : "globe",
      attributionControl: true,
      antialias: true,
      scrollZoom: false,
      dragPan: true,
      dragRotate: !compact,
      touchZoomRotate: true,
      touchPitch: false,
      cooperativeGestures: window.matchMedia("(pointer: coarse)").matches,
    });
    mapRef.current = map;
    map.scrollZoom.disable();
    if (!compact)
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("style.load", () => {
      map.setConfigProperty("basemap", "lightPreset", "dawn");
      map.setConfigProperty("basemap", "showPointOfInterestLabels", false);
      map.setConfigProperty("basemap", "showTransitLabels", false);
      map.setConfigProperty("basemap", "showRoadLabels", false);
      map.setFog({
        color: "#e9edf0",
        "high-color": "#f5eee3",
        "space-color": "#d9e0e3",
        "horizon-blend": 0.12,
        "star-intensity": 0,
      });
    });
    map.on("load", () => {
      [
        "social-mine-route",
        "social-their-route",
        "social-additional-route",
        "social-mine-nodes",
        "social-their-nodes",
        "social-additional-nodes",
        "social-mine-current",
        "social-their-current",
        "social-additional-current",
        "social-shared",
        "social-additional-shared",
        "social-place",
      ].forEach((id) =>
        map.addSource(id, {
          type: "geojson",
          lineMetrics: id.includes("route"),
          data: collection([]),
        }),
      );
      map.addLayer({
        id: "social-mine-glow",
        type: "line",
        slot: "top",
        source: "social-mine-route",
        paint: {
          "line-color": MINE,
          "line-width": 13,
          "line-opacity": 0.16,
          "line-blur": 8,
          "line-offset": -2,
        },
      });
      map.addLayer({
        id: "social-their-glow",
        type: "line",
        slot: "top",
        source: "social-their-route",
        paint: {
          "line-color": THEIRS,
          "line-width": 13,
          "line-opacity": 0.16,
          "line-blur": 8,
          "line-offset": 2,
        },
      });
      map.addLayer({
        id: "social-additional-glow",
        type: "line",
        slot: "top",
        source: "social-additional-route",
        paint: {
          "line-color": ADDITIONAL,
          "line-width": 12,
          "line-opacity": 0.14,
          "line-blur": 8,
          "line-offset": 4,
        },
      });
      map.addLayer({
        id: "social-mine-line",
        type: "line",
        slot: "top",
        source: "social-mine-route",
        paint: { "line-color": MINE, "line-width": 4, "line-opacity": 0.96, "line-offset": -2 },
      });
      map.addLayer({
        id: "social-their-line",
        type: "line",
        slot: "top",
        source: "social-their-route",
        paint: { "line-color": THEIRS, "line-width": 4, "line-opacity": 0.96, "line-offset": 2 },
      });
      map.addLayer({
        id: "social-additional-line",
        type: "line",
        slot: "top",
        source: "social-additional-route",
        paint: {
          "line-color": ADDITIONAL,
          "line-width": 4,
          "line-opacity": 0.92,
          "line-offset": 4,
        },
      });
      map.addLayer({
        id: "social-mine-node",
        type: "circle",
        slot: "top",
        source: "social-mine-nodes",
        paint: {
          "circle-radius": 5,
          "circle-color": "#fffaf0",
          "circle-stroke-width": 3,
          "circle-stroke-color": MINE,
        },
      });
      map.addLayer({
        id: "social-their-node",
        type: "circle",
        slot: "top",
        source: "social-their-nodes",
        paint: {
          "circle-radius": 5,
          "circle-color": "#f7fbfc",
          "circle-stroke-width": 3,
          "circle-stroke-color": THEIRS,
        },
      });
      map.addLayer({
        id: "social-additional-node",
        type: "circle",
        slot: "top",
        source: "social-additional-nodes",
        paint: {
          "circle-radius": 5,
          "circle-color": "#fbf8fc",
          "circle-stroke-width": 3,
          "circle-stroke-color": ADDITIONAL,
        },
      });
      [
        ["mine", MINE],
        ["their", THEIRS],
        ["additional", ADDITIONAL],
      ].forEach(([owner, color]) => {
        map.addLayer({
          id: `social-${owner}-current-halo`,
          type: "circle",
          slot: "top",
          source: `social-${owner}-current`,
          paint: {
            "circle-radius": 21,
            "circle-color": color!,
            "circle-opacity": 0.2,
            "circle-blur": 0.35,
          },
        });
        map.addLayer({
          id: `social-${owner}-current-node`,
          type: "circle",
          slot: "top",
          source: `social-${owner}-current`,
          paint: {
            "circle-radius": 8,
            "circle-color": color!,
            "circle-stroke-width": 3,
            "circle-stroke-color": "#fffaf0",
          },
        });
      });
      map.addLayer({
        id: "social-shared-halo",
        type: "circle",
        slot: "top",
        source: "social-shared",
        paint: {
          "circle-radius": 26,
          "circle-color": SHARED,
          "circle-opacity": 0.2,
          "circle-blur": 0.45,
        },
      });
      map.addLayer({
        id: "social-shared-node",
        type: "circle",
        slot: "top",
        source: "social-shared",
        paint: {
          "circle-radius": 10,
          "circle-color": SHARED,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fffaf0",
        },
      });
      map.addLayer({
        id: "social-shared-label",
        type: "symbol",
        slot: "top",
        source: "social-shared",
        layout: {
          "text-field": ["concat", ["get", "number"], "  ", ["get", "city"]],
          "text-size": 12,
          "text-offset": [0, -1.7],
          "text-anchor": "bottom",
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#17252b", "text-halo-color": "#fffaf0", "text-halo-width": 2 },
      });
      map.addLayer({
        id: "social-additional-shared-node",
        type: "circle",
        slot: "top",
        source: "social-additional-shared",
        paint: {
          "circle-radius": 8,
          "circle-color": ADDITIONAL,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fffaf0",
        },
      });
      map.addLayer({
        id: "social-place-halo",
        type: "circle",
        slot: "top",
        source: "social-place",
        paint: {
          "circle-radius": 27,
          "circle-color": MINE,
          "circle-opacity": 0.2,
          "circle-blur": 0.5,
        },
      });
      map.addLayer({
        id: "social-place-node",
        type: "circle",
        slot: "top",
        source: "social-place",
        paint: {
          "circle-radius": 8,
          "circle-color": MINE,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fffaf0",
        },
      });
      map.addLayer({
        id: "social-place-label",
        type: "symbol",
        slot: "top",
        source: "social-place",
        layout: {
          "text-field": ["get", "city"],
          "text-size": 13,
          "text-offset": [0, -1.5],
          "text-anchor": "bottom",
        },
        paint: { "text-color": "#17252b", "text-halo-color": "#fffaf0", "text-halo-width": 2 },
      });
      map.on("mouseenter", "social-shared-node", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "social-shared-node", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "social-shared-node", (event) => {
        const feature = event.features?.[0] as { properties?: Record<string, unknown> } | undefined;
        const index = Number(feature?.properties?.["index"]);
        if (Number.isInteger(index)) onDiscoveryRef.current?.(index);
      });
      loadedRef.current = true;
      containerRef.current?.setAttribute("data-map-ready", "true");
      containerRef.current?.setAttribute("data-scroll-zoom", String(map.scrollZoom.isEnabled()));
      updateSources();
      frameAll();
    });
    return () => {
      loadedRef.current = false;
      map.remove();
    };
  }, [compact, frameAll, token]);

  useEffect(() => {
    updateSources();
  }, [activeDiscovery, replayYear, signature]);

  useEffect(() => {
    const map = mapRef.current;
    const discovery = activeDiscovery === null ? null : discoveries[activeDiscovery];
    if (!map || !loadedRef.current || !discovery) return;
    map.easeTo({
      center: [discovery.longitude, discovery.latitude],
      zoom: Math.max(map.getZoom(), 4.8),
      pitch: 16,
      duration: 900,
      essential: false,
    });
  }, [activeDiscovery, discoveries]);

  if (!token)
    return (
      <div className="social-map-unavailable">
        <span>Real map preview unavailable</span>
        <small>Add the existing public Mapbox token to render geography.</small>
      </div>
    );
  return (
    <div className={`social-mapbox ${compact ? "compact" : ""}`}>
      <div
        ref={containerRef}
        className="social-mapbox-canvas"
        aria-label={
          place
            ? `Map of ${place.city}, ${place.country}`
            : "Rotatable map comparing permitted Life Atlas paths"
        }
      />
      {!compact ? (
        <button type="button" className="social-map-recenter" onClick={() => frameAll(true)}>
          <LocateFixed />
          Recenter
        </button>
      ) : null}
    </div>
  );
}
