import { useEffect, useMemo, useRef } from 'react';
import { LocateFixed } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { distanceKm, routeCoordinates, shortestLongitude, type AtlasRoute, type TrailStop } from '@/lib/atlas-data';

type MapProps = {
  routes: AtlasRoute[];
  trail?: TrailStop[];
  layer?: 'community' | 'world';
  year?: number;
  onCity?: (name: string) => void;
  cinematic?: boolean;
  activeRouteIndex?: number;
  onInteraction?: () => void;
  playback?: boolean;
};

type RouteFeature = {
  type: 'Feature';
  properties: { routeIndex: number; active: boolean };
  geometry: { type: 'LineString'; coordinates: number[][] };
};

function routeFeatures(routes: AtlasRoute[], year: number, selectedIndex: number): RouteFeature[] {
  return routes.flatMap((route, routeIndex) => route.year <= year ? [{
    type: 'Feature' as const,
    properties: { routeIndex, active: routeIndex === selectedIndex },
    geometry: { type: 'LineString' as const, coordinates: routeCoordinates(route) },
  }] : []);
}

function collection(features: unknown[]) {
  return { type: 'FeatureCollection' as const, features };
}

function maxZoomForDistance(km: number) {
  if (km < 90) return 5.2;
  if (km < 350) return 5;
  if (km < 1200) return 4.7;
  if (km < 3500) return 4.2;
  if (km < 7500) return 3.5;
  return 2.7;
}

export default function AtlasMap({ routes, trail = [], layer = 'community', year = 2026, onCity, cinematic = false, activeRouteIndex, onInteraction, playback = false }: MapProps) {
  const publicToken = import.meta.env['VITE_MAPBOX_PUBLIC_TOKEN'] ?? import.meta.env['VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN'];
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const animationRef = useRef<number | null>(null);
  const loadedRef = useRef(false);
  const lastFramedTrailRef = useRef('');
  const onCityRef = useRef(onCity);
  const onInteractionRef = useRef(onInteraction);
  const propsRef = useRef({ routes, trail, layer, year, activeRouteIndex });
  const trailSignature = useMemo(() => trail.map((place) => `${place.id}:${place.latitude}:${place.longitude}`).join('|'), [trail]);
  onCityRef.current = onCity;
  onInteractionRef.current = onInteraction;
  propsRef.current = { routes, trail, layer, year, activeRouteIndex };

  const renderJourney = (animateSegment: boolean) => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);

    const current = propsRef.current;
    const selectedIndex = Math.max(0, Math.min(current.activeRouteIndex ?? current.routes.length - 1, current.routes.length - 1));
    const features = routeFeatures(current.routes, current.year, selectedIndex);
    (map.getSource('journey-routes') as mapboxgl.GeoJSONSource | undefined)?.setData(collection(features));

    const counts = new Map<string, { place: AtlasRoute['from']; count: number }>();
    if (current.trail.length < 2) {
      current.routes.filter((route) => route.year <= current.year).forEach((route) => {
        [route.from, route.to].forEach((place) => counts.set(place.id, { place, count: (counts.get(place.id)?.count ?? 0) + route.volume }));
      });
    }
    (map.getSource('cities') as mapboxgl.GeoJSONSource | undefined)?.setData(collection([...counts.values()].map(({ place, count }) => ({
      type: 'Feature', properties: { city: place.city, count }, geometry: { type: 'Point', coordinates: [place.longitude, place.latitude] },
    }))));

    (map.getSource('trail-nodes') as mapboxgl.GeoJSONSource | undefined)?.setData(collection(current.trail.map((place, index) => ({
      type: 'Feature',
      properties: { city: place.city, chapter: index + 1, role: index === 0 ? 'start' : index === current.trail.length - 1 ? 'end' : 'middle' },
      geometry: { type: 'Point', coordinates: [place.longitude, place.latitude] },
    }))));

    const selectedRoute = current.routes[selectedIndex];
    (map.getSource('active-markers') as mapboxgl.GeoJSONSource | undefined)?.setData(collection(selectedRoute ? [
      { type: 'Feature', properties: { role: 'origin' }, geometry: { type: 'Point', coordinates: [selectedRoute.from.longitude, selectedRoute.from.latitude] } },
      { type: 'Feature', properties: { role: 'destination' }, geometry: { type: 'Point', coordinates: [selectedRoute.to.longitude, selectedRoute.to.latitude] } },
    ] : []));

    const routeColor = current.layer === 'community' ? '#b95432' : '#3f705d';
    const glowColor = current.layer === 'community' ? '#d27046' : '#587c68';
    if (map.getLayer('journey-route')) map.setPaintProperty('journey-route', 'line-color', routeColor);
    if (map.getLayer('journey-glow')) map.setPaintProperty('journey-glow', 'line-color', glowColor);

    const coordinates = features.find((feature) => feature.properties.routeIndex === selectedIndex)?.geometry.coordinates ?? [];
    (map.getSource('route-particle') as mapboxgl.GeoJSONSource | undefined)?.setData(collection([]));
    if (!animateSegment || !coordinates.length) return;

    let startTime = 0;
    const drawDuration = 1500;
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.max(0, Math.min(1, (timestamp - startTime) / drawDuration));
      const eased = 1 - (1 - progress) ** 3;
      const particle = coordinates[Math.min(coordinates.length - 1, Math.floor(eased * (coordinates.length - 1)))];
      (map.getSource('route-particle') as mapboxgl.GeoJSONSource | undefined)?.setData(collection(particle ? [{ type: 'Feature', properties: { progress }, geometry: { type: 'Point', coordinates: particle } }] : []));
      if (map.getLayer('active-marker-halo')) {
        const pulse = (Math.sin(timestamp / 260) + 1) / 2;
        map.setPaintProperty('active-marker-halo', 'circle-radius', ['case', ['==', ['get', 'role'], 'destination'], 17 + pulse * 6, 10 + pulse * 3]);
      }
      if (progress < 1) animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
  };

  const frameJourney = (force = false) => {
    const map = mapRef.current;
    const current = propsRef.current;
    const signature = current.trail.map((place) => `${place.id}:${place.latitude}:${place.longitude}`).join('|');
    if (!map || !loadedRef.current || current.trail.length < 2 || (!force && signature === lastFramedTrailRef.current)) return;

    const bounds = new mapboxgl.LngLatBounds();
    const framedRoutes = current.routes.length ? current.routes : current.trail.slice(1).map((to, index) => ({ from: current.trail[index]!, to, year: to.arrivalYear ?? 1900, reason: to.reason ?? 'Other', volume: 1 }));
    let longitudeOffset = 0;
    let previousLongitude = current.trail[0]!.longitude;
    framedRoutes.forEach((route) => {
      const coordinates = routeCoordinates(route).map(([longitude, latitude]) => {
        const adjusted = shortestLongitude(previousLongitude, longitude + longitudeOffset);
        previousLongitude = adjusted;
        longitudeOffset = adjusted - longitude;
        return [adjusted, latitude] as [number, number];
      });
      coordinates.forEach((coordinate) => bounds.extend(coordinate));
    });
    const longestSegment = current.trail.slice(1).reduce((longest, place, index) => Math.max(longest, distanceKm(current.trail[index]!, place)), 0);
    const mobile = window.innerWidth < 768;
    const padding = mobile
      ? { top: 86, bottom: Math.min(360, window.innerHeight * 0.44), left: 38, right: 38 }
      : { top: 100, bottom: 100, left: 90, right: 390 };
    const maxZoom = maxZoomForDistance(longestSegment);
    const camera = map.cameraForBounds(bounds, { padding, maxZoom });
    if (!camera?.center || typeof camera.zoom !== 'number') return;
    lastFramedTrailRef.current = signature;
    map.stop();
    map.easeTo({ center: camera.center, zoom: Math.min(camera.zoom, maxZoom), padding, duration: force ? 950 : 1500, pitch: longestSegment > 3500 ? 7 : 14, bearing: 0, essential: true });
  };

  const frameActiveRoute = () => {
    const map = mapRef.current;
    const current = propsRef.current;
    const route = current.routes[current.activeRouteIndex ?? -1];
    if (!map || !loadedRef.current || !route) return;
    const bounds = new mapboxgl.LngLatBounds();
    routeCoordinates(route).forEach((coordinate) => bounds.extend(coordinate));
    const mobile = window.innerWidth < 768;
    const camera = map.cameraForBounds(bounds, { padding: mobile ? { top: 100, bottom: 250, left: 40, right: 40 } : { top: 100, bottom: 100, left: 90, right: 390 }, maxZoom: maxZoomForDistance(distanceKm(route.from, route.to)) });
    if (camera?.center && typeof camera.zoom === 'number') map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 1450, pitch: 12, bearing: 0, essential: false });
  };

  useEffect(() => {
    if (!ref.current || !publicToken) return;
    mapboxgl.accessToken = publicToken;
    const map = new mapboxgl.Map({
      container: ref.current,
      style: 'mapbox://styles/mapbox/standard',
      center: cinematic ? [58, 17] : [30, 20],
      zoom: cinematic ? 1.65 : 1.25,
      pitch: cinematic ? 19 : 0,
      bearing: cinematic ? -9 : 0,
      attributionControl: false,
      projection: 'globe',
      antialias: true,
      scrollZoom: false,
      dragPan: true,
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: false,
      cooperativeGestures: window.matchMedia('(pointer: coarse)').matches,
    });
    mapRef.current = map;
    map.scrollZoom.disable();
    map.dragPan.enable();
    map.dragRotate.enable();
    map.touchZoomRotate.enable();
    map.on('dragstart', (event) => { if ('originalEvent' in event && event.originalEvent) onInteractionRef.current?.(); });
    map.on('zoomstart', (event) => { if ('originalEvent' in event && event.originalEvent) onInteractionRef.current?.(); });
    map.on('rotatestart', (event) => { if ('originalEvent' in event && event.originalEvent) onInteractionRef.current?.(); });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('style.load', () => {
      map.setConfigProperty('basemap', 'lightPreset', 'dawn');
      map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
      map.setConfigProperty('basemap', 'showTransitLabels', false);
      map.setConfigProperty('basemap', 'showRoadLabels', false);
      map.setFog({ color: '#f4ead9', 'high-color': '#ead8ba', 'space-color': '#d8c7a9', 'horizon-blend': 0.13, 'star-intensity': 0 });
    });
    map.on('load', () => {
      map.addSource('journey-routes', { type: 'geojson', lineMetrics: true, data: collection([]) });
      map.addSource('route-particle', { type: 'geojson', data: collection([]) });
      map.addSource('cities', { type: 'geojson', data: collection([]) });
      map.addSource('trail-nodes', { type: 'geojson', data: collection([]) });
      map.addSource('active-markers', { type: 'geojson', data: collection([]) });
      map.addLayer({ id: 'journey-glow', type: 'line', slot: 'top', source: 'journey-routes', paint: { 'line-color': '#d27046', 'line-width': ['case', ['boolean', ['get', 'active'], false], cinematic ? 17 : 12, cinematic ? 12 : 8], 'line-opacity': ['case', ['boolean', ['get', 'active'], false], 0.28, 0.18], 'line-blur': 10 } });
      map.addLayer({ id: 'journey-route', type: 'line', slot: 'top', source: 'journey-routes', paint: { 'line-color': '#b95432', 'line-width': ['case', ['boolean', ['get', 'active'], false], cinematic ? 4.2 : 3.2, cinematic ? 3.2 : 2.4], 'line-opacity': ['case', ['boolean', ['get', 'active'], false], 0.98, 0.82] } });
      map.addLayer({ id: 'city-halo', type: 'circle', slot: 'top', source: 'cities', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 0, cinematic ? 8 : 5, 1600, cinematic ? 22 : 15], 'circle-color': '#d46a42', 'circle-opacity': 0.11, 'circle-blur': 0.6 } });
      map.addLayer({ id: 'city-pulse', type: 'circle', slot: 'top', source: 'cities', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 0, 2.7, 1600, 6], 'circle-color': '#c65d37', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff8e8', 'circle-opacity': 0.88 } });
      map.addLayer({ id: 'trail-node-halo', type: 'circle', slot: 'top', source: 'trail-nodes', paint: { 'circle-radius': ['match', ['get', 'role'], 'end', 15, 'start', 12, 10], 'circle-color': '#d27046', 'circle-opacity': 0.24, 'circle-blur': 0.55 } });
      map.addLayer({ id: 'trail-node', type: 'circle', slot: 'top', source: 'trail-nodes', paint: { 'circle-radius': ['match', ['get', 'role'], 'end', 8, 'start', 7, 6], 'circle-color': ['match', ['get', 'role'], 'end', '#a94529', 'start', '#8d5138', '#c65d37'], 'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff8e8', 'circle-opacity': 1 } });
      map.addLayer({ id: 'trail-node-label', type: 'symbol', slot: 'top', source: 'trail-nodes', layout: { 'text-field': ['to-string', ['get', 'chapter']], 'text-size': 9, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#fff8e8', 'text-halo-color': '#8f422a', 'text-halo-width': 0.25 } });
      map.addLayer({ id: 'active-marker-halo', type: 'circle', slot: 'top', source: 'active-markers', paint: { 'circle-radius': 10, 'circle-color': '#c65d37', 'circle-opacity': ['case', ['==', ['get', 'role'], 'destination'], 0.24, 0.1], 'circle-blur': 0.45 } });
      map.addLayer({ id: 'active-marker-core', type: 'circle', slot: 'top', source: 'active-markers', paint: { 'circle-radius': ['case', ['==', ['get', 'role'], 'destination'], 7, 4], 'circle-color': ['case', ['==', ['get', 'role'], 'destination'], '#b95432', '#7f533f'], 'circle-stroke-width': 2.5, 'circle-stroke-color': '#fff8e8', 'circle-opacity': 1 } });
      map.addLayer({ id: 'route-particle-glow', type: 'circle', slot: 'top', source: 'route-particle', paint: { 'circle-radius': 13, 'circle-color': '#fff1cf', 'circle-opacity': 0.24, 'circle-blur': 0.6 } });
      map.addLayer({ id: 'route-particle', type: 'circle', slot: 'top', source: 'route-particle', paint: { 'circle-radius': 5.5, 'circle-color': '#fff8dc', 'circle-stroke-width': 3, 'circle-stroke-color': '#b95432' } });

      map.on('mouseenter', 'city-pulse', (event) => {
        map.getCanvas().style.cursor = 'pointer';
        const feature = event.features?.[0] as { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> } | undefined;
        if (!feature?.geometry?.coordinates) return;
        const content = document.createElement('div');
        const name = document.createElement('strong');
        const count = document.createElement('span');
        name.textContent = String(feature.properties?.['city'] ?? '');
        count.textContent = propsRef.current.layer === 'world'
          ? `${Number(feature.properties?.['count'] ?? 0).toLocaleString()} people in migrant stock estimates`
          : `${Number(feature.properties?.['count'] ?? 0).toLocaleString()} community journeys`;
        content.append(name, count);
        new mapboxgl.Popup({ closeButton: false, offset: 16, className: 'atlas-popup' }).setLngLat(feature.geometry.coordinates.slice(0, 2) as [number, number]).setDOMContent(content).addTo(map);
      });
      map.on('mouseleave', 'city-pulse', () => { map.getCanvas().style.cursor = ''; document.querySelectorAll('.atlas-popup').forEach((node) => node.remove()); });
      map.on('click', 'city-pulse', (event) => { const feature = event.features?.[0] as { properties?: Record<string, unknown> } | undefined; const city = feature?.properties?.['city']; if (typeof city === 'string') onCityRef.current?.(city); });
      map.on('moveend', () => {
        const center = map.getCenter();
        ref.current?.setAttribute('data-camera', `${center.lng.toFixed(4)},${center.lat.toFixed(4)},${map.getZoom().toFixed(3)}`);
      });
      loadedRef.current = true;
      ref.current?.setAttribute('data-map-ready', 'true');
      ref.current?.setAttribute('data-scroll-zoom', String(map.scrollZoom.isEnabled()));
      renderJourney(Boolean(propsRef.current.trail.length));
      frameJourney();
    });
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      loadedRef.current = false;
      map.remove();
    };
  }, []);

  useEffect(() => {
    renderJourney(trail.length > 1);
  }, [routes, year, layer, activeRouteIndex]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (playback) {
      map.dragPan.disable();
      map.dragRotate.disable();
      map.touchZoomRotate.disable();
      frameActiveRoute();
    } else {
      map.dragPan.enable();
      map.dragRotate.enable();
      map.touchZoomRotate.enable();
    }
  }, [activeRouteIndex, playback]);

  useEffect(() => {
    frameJourney();
  }, [trailSignature]);

  if (!publicToken) return <div className="map-unavailable absolute inset-0"><span>Map preview unavailable</span><small>Add a public Mapbox token to render the atlas.</small></div>;
  return <div className="absolute inset-0">
    <div ref={ref} className="absolute inset-0" aria-label="Interactive world map of human journeys" />
    {trail.length > 1 && <button type="button" className="map-recenter" onClick={() => frameJourney(true)}><LocateFixed />Recenter journey</button>}
  </div>;
}
