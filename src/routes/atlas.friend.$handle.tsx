import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeft, Globe2, LockKeyhole, Play } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { MovementFingerprint } from '@/components/MovementFingerprint';
import { fingerprintFor, formatDistance, routesFromTrail, type TrailStop } from '@/lib/atlas-data';
import { getFriendAtlas } from '@/server/social';

const AtlasMap = lazy(() => import('@/components/AtlasMap'));

export const Route = createFileRoute('/atlas/friend/$handle')({
  head: () => ({ meta: [{ title: 'Friend Atlas — Life Atlas' }, { name: 'robots', content: 'noindex, nofollow, noarchive' }] }),
  component: FriendAtlasRoute,
});

function FriendAtlasRoute() {
  const { handle } = Route.useParams();
  const load = useServerFn(getFriendAtlas);
  const [data, setData] = useState<{ profile: { displayName: string; handle: string }; stops: TrailStop[] } | null | undefined>();
  const [error, setError] = useState('');
  const [replaying, setReplaying] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => { let current = true; void load({ data: { handle } }).then((value) => { if (current) setData(value); }).catch((reason) => { if (current) { setData(null); setError(reason instanceof Error ? reason.message : 'This Atlas is unavailable.'); } }); return () => { current = false; }; }, [handle, load]);
  const routes = useMemo(() => routesFromTrail(data?.stops ?? []), [data?.stops]);
  const fingerprint = useMemo(() => fingerprintFor(data?.stops ?? []), [data?.stops]);
  useEffect(() => { if (!replaying || !routes.length) return; const timer = window.setTimeout(() => setActive((value) => { if (value >= routes.length - 1) { setReplaying(false); return value; } return value + 1; }), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 700 : 2800); return () => window.clearTimeout(timer); }, [active, replaying, routes.length]);

  if (data === undefined) return <main className="shared-loading"><Globe2/><span>Opening your friend’s Atlas…</span></main>;
  if (!data) return <main className="shared-missing"><LockKeyhole/><h1>This Atlas remains private.</h1><p>{error}</p><Link className="outline-button" to="/circle"><ArrowLeft/>Return to Life Circle</Link></main>;
  const activeStop = data.stops[active + 1] ?? data.stops[0];
  return <main className="shared-atlas friend-atlas-page">
    <header className="shared-header"><Link to="/circle" className="flex items-center gap-2 font-semibold"><ArrowLeft/>Life Circle</Link><span>Friends-only · memories and photographs remain private</span></header>
    <section className="shared-hero"><div><p className="eyebrow">@{data.profile.handle} · Friends-only Atlas</p><h1>{data.profile.displayName}</h1><div className="shared-stats"><span><strong>{fingerprint.locations}</strong> places</span><span><strong>{fingerprint.countries}</strong> countries</span><span><strong>{formatDistance(fingerprint.totalDistance)}</strong> across life</span></div></div><MovementFingerprint trail={data.stops}/></section>
    <section className="shared-map"><Suspense fallback={<div className="shared-loading"><Globe2/></div>}><AtlasMap routes={routes} trail={data.stops} cinematic activeRouteIndex={active} playback={replaying}/></Suspense><div className="shared-replay-card"><p className="eyebrow">{replaying ? 'Active chapter' : 'Friend Atlas'}</p><h2>{activeStop?.city}</h2><p>{activeStop?.arrivalYear}{activeStop?.endYear ? `–${activeStop.endYear}` : ''}</p><button className="outline-button" onClick={() => { setActive(0); setReplaying(true); }}><Play/>Replay route</button></div></section>
    <section className="shared-timeline"><p className="eyebrow">Permitted chapters</p>{data.stops.map((stop, index) => <article key={`${stop.id}-${index}`}><span>{index === 0 ? 'Beginning' : stop.arrivalYear}</span><div><h2>{stop.city}</h2><p className="chapter-place">{stop.country}{stop.reason && stop.reason !== 'Other' ? ` · ${stop.reason}` : ''}</p></div></article>)}</section>
  </main>;
}
