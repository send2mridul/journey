import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { AtlasRoute, TrailStop } from '@/lib/atlas-data';

type MapProps = {
  routes: AtlasRoute[];
  trail?: TrailStop[];
  layer?: 'community' | 'world';
  year?: number;
  onCity?: (name: string) => void;
  cinematic?: boolean;
  activeRouteIndex?: number;
  revealKey?: number;
};

type RouteFeature = {
  type: 'Feature';
  properties: { routeIndex: number };
  geometry: { type: 'LineString'; coordinates: number[][] };
};

function shortestLongitude(from: number, to: number) {
  let target = to;
  while (target - from > 180) target -= 360;
  while (target - from < -180) target += 360;
  return target;
}

function arc(a: [number, number], b: [number, number]) {
  const targetLongitude = shortestLongitude(a[0], b[0]);
  const longitudeDistance = Math.abs(targetLongitude - a[0]);
  const latitudeDistance = Math.abs(b[1] - a[1]);
  const lift = Math.min(20, 2.8 + Math.hypot(longitudeDistance, latitudeDistance) * 0.12);
  return Array.from({ length: 121 }, (_, index) => {
    const t = index / 120;
    return [a[0] + (targetLongitude - a[0]) * t, a[1] + (b[1] - a[1]) * t + Math.sin(Math.PI * t) * lift];
  });
}

function routeFeatures(routes: AtlasRoute[], year: number): RouteFeature[] {
  return routes.flatMap((route, routeIndex) => route.year <= year ? [{
    type: 'Feature' as const,
    properties: { routeIndex },
    geometry: { type: 'LineString' as const, coordinates: arc([route.from.longitude, route.from.latitude], [route.to.longitude, route.to.latitude]) },
  }] : []);
}

function collection(features: RouteFeature[]) {
  return { type: 'FeatureCollection', features };
}

function distanceKm(a: TrailStop, b: TrailStop) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(shortestLongitude(a.longitude, b.longitude) - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function maxZoomForDistance(km: number) {
  if (km < 90) return 9.2;
  if (km < 350) return 7.4;
  if (km < 1200) return 5.9;
  if (km < 3500) return 4.8;
  if (km < 7500) return 3.8;
  return 2.8;
}

export default function AtlasMap({ routes, trail = [], layer = 'community', year = 2026, onCity, cinematic = false, activeRouteIndex, revealKey = 0 }: MapProps) {
  const publicToken = import.meta.env['VITE_MAPBOX_PUBLIC_TOKEN'] ?? import.meta.env['VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN'];
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const frameRef = useRef<number | null>(null);
  const loadedRef = useRef(false);
  const onCityRef = useRef(onCity);
  const propsRef = useRef({ routes, trail, layer, year, activeRouteIndex, revealKey });
  onCityRef.current = onCity;
  propsRef.current = { routes, trail, layer, year, activeRouteIndex, revealKey };

  const renderJourney = (animateReveal: boolean) => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    const current = propsRef.current;
    const features = routeFeatures(current.routes, current.year);
    const selectedIndex = current.activeRouteIndex ?? features.at(-1)?.properties.routeIndex ?? 0;
    const active = features.filter((feature) => feature.properties.routeIndex === selectedIndex);
    const history = features.filter((feature) => feature.properties.routeIndex !== selectedIndex);
    (map.getSource('history-routes') as mapboxgl.GeoJSONSource | undefined)?.setData(collection(history));
    (map.getSource('active-route') as mapboxgl.GeoJSONSource | undefined)?.setData(collection(active));

    const counts = new Map<string, { place: AtlasRoute['from']; count: number }>();
    current.routes.filter((route) => route.year <= current.year).forEach((route) => {
      [route.from, route.to].forEach((place) => counts.set(place.id, { place, count: (counts.get(place.id)?.count ?? 0) + route.volume }));
    });
    (map.getSource('cities') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [...counts.values()].map(({ place, count }) => ({ type: 'Feature', properties: { city: place.city, count }, geometry: { type: 'Point', coordinates: [place.longitude, place.latitude] } })) });

    const selectedRoute = current.routes[selectedIndex];
    (map.getSource('active-markers') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: selectedRoute ? [
      { type: 'Feature', properties: { role: 'origin' }, geometry: { type: 'Point', coordinates: [selectedRoute.from.longitude, selectedRoute.from.latitude] } },
      { type: 'Feature', properties: { role: 'destination' }, geometry: { type: 'Point', coordinates: [selectedRoute.to.longitude, selectedRoute.to.latitude] } },
    ] : [] });

    const routeColor = current.layer === 'community' ? '#b95432' : '#3f705d';
    const hazeColor = current.layer === 'community' ? '#d27046' : '#587c68';
    ['history-route', 'active-route-line'].forEach((id) => { if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', routeColor); });
    ['history-haze', 'active-haze'].forEach((id) => { if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', hazeColor); });

    if (current.trail.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      let previousLongitude = current.trail[0]?.longitude ?? 0;
      current.trail.forEach((place, index) => {
        const longitude = index === 0 ? place.longitude : shortestLongitude(previousLongitude, place.longitude);
        bounds.extend([longitude, place.latitude]);
        previousLongitude = longitude;
      });
      const mobile = window.innerWidth < 768;
      const activeStart = current.trail[Math.min(selectedIndex, current.trail.length - 2)];
      const activeEnd = current.trail[Math.min(selectedIndex + 1, current.trail.length - 1)];
      const routeDistance = activeStart && activeEnd ? distanceKm(activeStart, activeEnd) : 3000;
      const padding = mobile
        ? { top: 90, bottom: Math.min(430, window.innerHeight * 0.52), left: 50, right: 50 }
        : { top: 108, bottom: 108, left: 94, right: 400 };
      const camera = map.cameraForBounds(bounds, { padding, maxZoom: maxZoomForDistance(routeDistance) });
      if (camera?.center && typeof camera.zoom === 'number') map.easeTo({
        center: camera.center,
        zoom: Math.min(camera.zoom, maxZoomForDistance(routeDistance)),
        padding,
        duration: animateReveal ? 1700 : 1100,
        pitch: routeDistance > 3500 ? 8 : 18,
        bearing: routeDistance > 3500 ? 0 : -5,
        essential: true,
      });
    }

    let startTime = 0;
    const delay = animateReveal ? 900 : 0;
    const drawDuration = animateReveal ? 1750 : 1;
    const coordinates = active[0]?.geometry.coordinates ?? [];
    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.max(0, Math.min(1, (elapsed - delay) / drawDuration));
      const eased = 1 - (1 - progress) ** 3;
      if (map.getLayer('active-route-line')) map.setPaintProperty('active-route-line', 'line-trim-offset', [0, 1 - eased]);
      if (map.getLayer('active-haze')) map.setPaintProperty('active-haze', 'line-trim-offset', [0, 1 - eased]);
      const pointIndex = Math.min(coordinates.length - 1, Math.floor(eased * Math.max(0, coordinates.length - 1)));
      const particle = coordinates[pointIndex];
      (map.getSource('route-particle') as mapboxgl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: particle && progress > 0 && progress < 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: particle } }] : [] });

      const pulseWave = (Math.sin(timestamp / 280) + 1) / 2;
      const destinationActive = progress >= 0.96;
      if (map.getLayer('active-marker-halo')) {
        map.setPaintProperty('active-marker-halo', 'circle-radius', ['case', ['==', ['get', 'role'], 'destination'], destinationActive ? 18 + pulseWave * 8 : 4, 12 + pulseWave * 4]);
        map.setPaintProperty('active-marker-halo', 'circle-opacity', ['case', ['==', ['get', 'role'], 'destination'], destinationActive ? 0.42 : 0.08, elapsed > 450 ? 0.3 : 0.08]);
      }
      if (elapsed < delay + drawDuration + 3000 || !animateReveal) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (!ref.current) return;
    if (!publicToken) return;
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
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('style.load', () => {
      map.setConfigProperty('basemap', 'lightPreset', 'dawn');
      map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
      map.setConfigProperty('basemap', 'showTransitLabels', false);
      map.setConfigProperty('basemap', 'showRoadLabels', false);
      map.setFog({ color: '#f4ead9', 'high-color': '#ead8ba', 'space-color': '#d8c7a9', 'horizon-blend': 0.13, 'star-intensity': 0 });
    });
    map.on('load', () => {
      map.addSource('history-routes', { type: 'geojson', lineMetrics: true, data: collection([]) });
      map.addSource('active-route', { type: 'geojson', lineMetrics: true, data: collection([]) });
      map.addSource('route-particle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('cities', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('active-markers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'history-haze', type: 'line', slot: 'top', source: 'history-routes', paint: { 'line-color': '#d27046', 'line-width': cinematic ? 10 : 7, 'line-opacity': 0.12, 'line-blur': 8 } });
      map.addLayer({ id: 'history-route', type: 'line', slot: 'top', source: 'history-routes', paint: { 'line-color': '#b95432', 'line-width': cinematic ? 2.2 : 1.5, 'line-opacity': 0.42, 'line-dasharray': [1.2, 1.7] } });
      map.addLayer({ id: 'active-haze', type: 'line', slot: 'top', source: 'active-route', paint: { 'line-color': '#d27046', 'line-width': cinematic ? 18 : 12, 'line-opacity': 0.28, 'line-blur': 12, 'line-trim-offset': [0, 1] } });
      map.addLayer({ id: 'active-route-line', type: 'line', slot: 'top', source: 'active-route', paint: { 'line-color': '#b95432', 'line-width': cinematic ? 4.4 : 3.2, 'line-opacity': 0.96, 'line-trim-offset': [0, 1] } });
      map.addLayer({ id: 'city-halo', type: 'circle', slot: 'top', source: 'cities', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 0, cinematic ? 8 : 5, 1600, cinematic ? 22 : 15], 'circle-color': '#d46a42', 'circle-opacity': 0.11, 'circle-blur': 0.6 } });
      map.addLayer({ id: 'city-pulse', type: 'circle', slot: 'top', source: 'cities', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 0, 2.7, 1600, 6], 'circle-color': '#c65d37', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff8e8', 'circle-opacity': 0.88 } });
      map.addLayer({ id: 'active-marker-halo', type: 'circle', slot: 'top', source: 'active-markers', paint: { 'circle-radius': 4, 'circle-color': '#c65d37', 'circle-opacity': 0.08, 'circle-blur': 0.45 } });
      map.addLayer({ id: 'active-marker-core', type: 'circle', slot: 'top', source: 'active-markers', paint: { 'circle-radius': ['case', ['==', ['get', 'role'], 'destination'], 7, 6], 'circle-color': ['case', ['==', ['get', 'role'], 'destination'], '#a94529', '#c65d37'], 'circle-stroke-width': 3, 'circle-stroke-color': '#fff8e8', 'circle-opacity': 0.98 } });
      map.addLayer({ id: 'route-particle-glow', type: 'circle', slot: 'top', source: 'route-particle', paint: { 'circle-radius': 14, 'circle-color': '#fff1cf', 'circle-opacity': 0.28, 'circle-blur': 0.6 } });
      map.addLayer({ id: 'route-particle', type: 'circle', slot: 'top', source: 'route-particle', paint: { 'circle-radius': 4.2, 'circle-color': '#fff8dc', 'circle-stroke-width': 2, 'circle-stroke-color': '#b95432' } });

      map.on('mouseenter', 'city-pulse', (event) => {
        map.getCanvas().style.cursor = 'pointer';
        const feature = event.features?.[0] as { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> } | undefined;
        if (!feature?.geometry?.coordinates) return;
        const content = document.createElement('div');
        const name = document.createElement('strong');
        const count = document.createElement('span');
        name.textContent = String(feature.properties?.['city'] ?? '');
        count.textContent = `${Number(feature.properties?.['count'] ?? 0).toLocaleString()} community journeys`;
        content.append(name, count);
        new mapboxgl.Popup({ closeButton: false, offset: 16, className: 'atlas-popup' })
          .setLngLat(feature.geometry.coordinates.slice(0, 2) as [number, number])
          .setDOMContent(content)
          .addTo(map);
      });
      map.on('mouseleave', 'city-pulse', () => { map.getCanvas().style.cursor = ''; document.querySelectorAll('.atlas-popup').forEach((node) => node.remove()); });
      map.on('click', 'city-pulse', (event) => { const feature = event.features?.[0] as { properties?: Record<string, unknown> } | undefined; const city = feature?.properties?.['city']; if (typeof city === 'string') onCityRef.current?.(city); });
      loadedRef.current = true;
      renderJourney(Boolean(propsRef.current.trail.length));
    });
    return () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current); loadedRef.current = false; map.remove(); };
  }, []);

  useEffect(() => {
    renderJourney(trail.length > 1);
  }, [routes, trail, year, layer, activeRouteIndex, revealKey]);

  if (!publicToken) return <div className="map-unavailable absolute inset-0"><span>Map preview unavailable</span><small>Add a public Mapbox token to render the atlas.</small></div>;
  return <div ref={ref} className="absolute inset-0" aria-label="Interactive world map of human journeys" />;
}
