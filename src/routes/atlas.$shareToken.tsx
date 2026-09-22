import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { ArrowRight, Globe2, Pause, Play, RotateCcw } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { MovementFingerprint } from '@/components/MovementFingerprint';
import { fingerprintFor, formatDistance, routesFromTrail, type StoryVisibility, type TrailStop } from '@/lib/atlas-data';
import { getSharedTrail } from '@/server/atlas';

const AtlasMap = lazy(() => import('@/components/AtlasMap'));

export const Route = createFileRoute('/atlas/$shareToken')({
  head: () => ({ meta: [
    { title: 'A Life Atlas — Geographic Biography' },
    { name: 'description', content: 'A geographic biography of the places that became chapters of a life.' },
    { name: 'robots', content: 'noindex, nofollow' },
    { property: 'og:title', content: 'A Life Atlas' },
    { property: 'og:description', content: 'The places that became chapters of a life, seen together.' },
  ] }),
  component: SharedAtlas,
});

function SharedAtlas() {
  const { shareToken } = Route.useParams();
  const load = useServerFn(getSharedTrail);
  const [trail, setTrail] = useState<{ title: string; displayName: string | null; visibility: StoryVisibility; stops: TrailStop[] } | null | undefined>(undefined);
  const [replay, setReplay] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [active, setActive] = useState(0);

  useEffect(() => { let current = true; void load({ data: { token: shareToken } }).then((response) => current && setTrail(response.trail)).catch(() => current && setTrail(null)); return () => { current = false; }; }, [load, shareToken]);
  const routes = useMemo(() => routesFromTrail(trail?.stops ?? []), [trail?.stops]);
  const stats = useMemo(() => fingerprintFor(trail?.stops ?? []), [trail?.stops]);
  useEffect(() => {
    if (replay !== 'playing' || !routes.length) return;
    const timer = window.setTimeout(() => setActive((index) => {
      if (index >= routes.length - 1) { setReplay('idle'); return index; }
      return index + 1;
    }), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 800 : 3200);
    return () => window.clearTimeout(timer);
  }, [active, replay, routes.length]);

  if (trail === undefined) return <main className="shared-loading"><Globe2 /><span>Opening this Life Atlas…</span></main>;
  if (!trail) return <main className="shared-missing"><p className="eyebrow">Life Atlas</p><h1>This story is private.</h1><p>The link may have changed, or its author may have made the Atlas private again.</p><a className="primary-button compact" href="/">Create your Life Atlas <ArrowRight /></a></main>;
  const activeStop = trail.stops[active + 1];

  return <main className="shared-atlas">
    <header className="shared-header"><a href="/" className="flex items-center gap-2 font-semibold"><span className="brand-mark"><Globe2 /></span>Life Atlas</a><span>Life Trails are created by their authors.</span></header>
    <section className="shared-hero">
      <div><p className="eyebrow">{trail.displayName ? `${trail.displayName}’s Life Atlas` : trail.title}</p><h1>{trail.stops.map((stop) => stop.city).join(' · ')}</h1><div className="shared-stats"><span><strong>{stats.locations}</strong> places called home</span><span><strong>{stats.countries}</strong> countries</span><span><strong>{formatDistance(stats.totalDistance)}</strong> across life</span></div></div>
      <MovementFingerprint trail={trail.stops} />
    </section>
    <section className="shared-map">
      <Suspense fallback={<div className="shared-loading"><Globe2 /></div>}><AtlasMap routes={routes} trail={trail.stops} cinematic activeRouteIndex={active} playback={replay === 'playing'} /></Suspense>
      <div className="shared-replay-card"><p className="eyebrow">{replay === 'idle' ? 'See the journey unfold' : 'Now in this chapter'}</p><h2>{replay === 'idle' ? 'Replay this life' : activeStop?.city}</h2>{replay !== 'idle' && <><p>{activeStop?.arrivalYear}{activeStop?.endYear ? `–${activeStop.endYear}` : ''}{activeStop?.reason && activeStop.reason !== 'Other' ? ` · ${activeStop.reason}` : ''}</p>{activeStop?.title && <strong className="replay-chapter-title">{activeStop.title}</strong>}{activeStop?.memory && <blockquote className="replay-memory">{activeStop.memory}</blockquote>}{activeStop?.photos?.[0] && <img className="replay-photo" src={activeStop.photos[0].url} alt={activeStop.photos[0].caption || `Memory from ${activeStop.city}`} />}</>}<div><button className="outline-button" onClick={() => { if (replay === 'idle') setActive(0); setReplay(replay === 'playing' ? 'paused' : 'playing'); }}>{replay === 'playing' ? <><Pause />Pause</> : <><Play />{replay === 'paused' ? 'Continue' : 'Replay this life'}</>}</button>{replay !== 'idle' && <button className="outline-button" onClick={() => { setActive(0); setReplay('playing'); }}><RotateCcw />Restart</button>}</div></div>
    </section>
    <section className="shared-timeline"><p className="eyebrow">The chapters</p>{trail.stops.map((stop, index) => <article key={`${stop.id}-${index}`}>
      <span>{index === 0 ? 'The beginning' : stop.arrivalYear}{stop.endYear ? `–${stop.endYear}` : index > 0 && index === trail.stops.length - 1 ? '–Present' : ''}</span>
      <div><h2>{stop.city}</h2><p className="chapter-place">{stop.country}{stop.reason && stop.reason !== 'Other' ? ` · ${stop.reason}` : ''}</p>{index === 0 && <h3>Where the story began.</h3>}{stop.title && <h3>{stop.title}</h3>}{stop.memory && <p className="chapter-memory">{stop.memory}</p>}{stop.photos?.length ? <div className="shared-photos">{stop.photos.map((photo) => <img key={photo.id} src={photo.url} alt={photo.caption || `Memory from ${stop.city}`} loading="lazy" />)}</div> : null}</div>
    </article>)}</section>
    <section className="shared-cta"><p className="eyebrow">Life Atlas</p><h2>Map where life has taken you.</h2><a className="primary-button compact" href="/">Create your Life Atlas <ArrowRight /></a></section>
  </main>;
}
