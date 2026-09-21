import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Globe2,
  LoaderCircle,
  LocateFixed,
  LockKeyhole,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import {
  distanceKm,
  fingerprintFor,
  formatDistance,
  routesFromTrail,
  type AtlasRoute,
  type Place,
  type TrailStop,
} from '@/lib/atlas-data';
import { getExploreRoutes, getMyLatestTrail, getRouteStats, saveTrail, searchPlaces } from '@/server/atlas';
import { getAuthCapabilities } from '@/server/auth-capabilities';

const AtlasMap = lazy(() => import('@/components/AtlasMap'));
const reasons = ['Career', 'Study', 'Family', 'Love', 'Adventure', 'Opportunity', 'Other'] as const;
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index);

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Life Atlas — A Living Map of Human Lives' },
      { name: 'description', content: 'Add where life took you and discover how your journey connects to the world.' },
      { property: 'og:title', content: 'Life Atlas — A Living Map of Human Lives' },
      { property: 'og:description', content: 'Add where life took you. Discover where everyone else went.' },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: Index,
});

function Index() {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [year, setYear] = useState(Math.min(2021, currentYear));
  const [reason, setReason] = useState<(typeof reasons)[number]>('Career');
  const [revealed, setRevealed] = useState(false);
  const [trail, setTrail] = useState<TrailStop[]>([]);
  const [draftId, setDraftId] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [persistence, setPersistence] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  const [activeChapter, setActiveChapter] = useState(0);
  const [revealRun, setRevealRun] = useState(0);
  const [formError, setFormError] = useState('');
  const [sharedCount, setSharedCount] = useState<number | null>(null);
  const [statsConfigured, setStatsConfigured] = useState(true);
  const [editor, setEditor] = useState<{ mode: 'before' | 'after' | 'move' | 'edit'; index?: number } | null>(null);
  const revealRef = useRef<HTMLElement>(null);
  const loadedOwnerRef = useRef<string | null>(null);
  const routeStats = useServerFn(getRouteStats);
  const loadMyLatestTrail = useServerFn(getMyLatestTrail);
  const saveCurrentTrail = useServerFn(saveTrail);
  const { data: accountSession, isPending: sessionPending } = authClient.useSession();

  const userRoutes = useMemo(() => routesFromTrail(trail), [trail]);
  const selectedRoute = userRoutes[activeChapter] ?? userRoutes[0];
  const fingerprint = useMemo(() => fingerprintFor(trail), [trail]);

  useEffect(() => {
    window.localStorage.removeItem('life-atlas-draft');
    window.localStorage.removeItem('life-atlas-save-pending');
    setDraftId(window.crypto.randomUUID());
    setDraftReady(true);
  }, []);

  useEffect(() => {
    const ownerKey = accountSession?.user?.id ?? 'anonymous';
    if (!draftReady || !draftId || sessionPending || loadedOwnerRef.current === ownerKey) return;
    let current = true;
    loadedOwnerRef.current = ownerKey;
    setPersistence('loading');
    void loadMyLatestTrail().then((response) => {
      const saved = response.trail;
      if (!current || !saved) return;
      const first = saved.stops[0];
      const second = saved.stops[1];
      if (!first || !second) return;
      setDraftId(saved.clientDraftId);
      setTrail(saved.stops);
      setOrigin(first);
      setDestination(second);
      setActiveChapter(0);
      setRevealed(true);
      setRevealRun((value) => value + 1);
      setPersistence('saved');
    }).catch(() => {
      if (current) {
        loadedOwnerRef.current = null;
        setPersistence('error');
      }
    }).finally(() => {
      if (current) {
        setHydrated(true);
        setPersistence((value) => value === 'loading' ? 'idle' : value);
      }
    });
    return () => { current = false; };
  }, [accountSession?.user?.id, draftId, draftReady, sessionPending]);

  useEffect(() => {
    if (!hydrated || !draftId || trail.length < 2 || !revealed) return;
    const timer = window.setTimeout(async () => {
      setPersistence('saving');
      try {
        await saveCurrentTrail({ data: {
          clientDraftId: draftId,
          title: 'My Life Trail',
          visibility: 'PRIVATE',
          stops: trail.map((stop) => ({ id: stop.id, arrivalYear: stop.arrivalYear, reason: stop.reason as (typeof reasons)[number] | undefined })),
        } });
        setPersistence('saved');
      } catch {
        setPersistence('error');
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draftId, hydrated, revealed, trail]);

  async function refreshRouteStats(from: Place, to: Place) {
    try {
      const result = await routeStats({ data: { fromCityId: from.id, toCityId: to.id } });
      setStatsConfigured(result.configured);
      setSharedCount(result.sharedCount);
    } catch {
      setSharedCount(null);
    }
  }

  function showJourney() {
    if (!origin || !destination) {
      setFormError('Choose an origin and destination from the search results.');
      return;
    }
    if (origin.id === destination.id) {
      setFormError('Choose two different cities for this chapter.');
      return;
    }
    const sectionTop = revealRef.current?.getBoundingClientRect().top ?? window.innerHeight;
    const nextTrail: TrailStop[] = [{ ...origin }, { ...destination, arrivalYear: year, reason }];
    setFormError('');
    setTrail(nextTrail);
    setActiveChapter(0);
    setRevealRun((value) => value + 1);
    setRevealed(true);
    void refreshRouteStats(origin, destination);
    window.scrollTo({ top: sectionTop + window.scrollY - 64, behavior: 'smooth' });
  }

  function openEditor(mode: 'before' | 'after' | 'move') {
    setEditor({ mode });
  }

  function editChapter(index: number) {
    setEditor({ mode: 'edit', index });
  }

  function deleteChapter(index: number) {
    setTrail((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setActiveChapter((value) => Math.max(0, Math.min(value, trail.length - 3)));
  }

  function moveChapter(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 1 || target >= trail.length) return;
    setTrail((current) => {
      const next = [...current];
      const currentStop = next[index];
      const targetStop = next[target];
      if (!currentStop || !targetStop) return current;
      next[index] = targetStop;
      next[target] = currentStop;
      return next;
    });
    setActiveChapter(Math.max(0, target - 1));
    setRevealRun((value) => value + 1);
  }

  function commitChapter(place: Place, chapterYear: number, chapterReason: string) {
    setTrail((current) => {
      if (!editor) return current;
      if (editor.mode === 'before') {
        const first = current[0];
        if (!first || place.id === first.id) return current;
        return [{ ...place }, { ...first, arrivalYear: chapterYear, reason: chapterReason }, ...current.slice(1)];
      }
      if (editor.mode === 'edit' && typeof editor.index === 'number') {
        return current.map((stop, index) => index === editor.index ? { ...place, arrivalYear: chapterYear, reason: chapterReason } : stop);
      }
      if (place.id === current.at(-1)?.id) return current;
      return [...current, { ...place, arrivalYear: chapterYear, reason: chapterReason }];
    });
    setActiveChapter(editor?.mode === 'before' ? 0 : Math.max(0, trail.length - 1));
    setRevealRun((value) => value + 1);
    setEditor(null);
  }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/50 bg-background/75 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-5 md:px-10">
        <a href="#top" className="flex items-center gap-2 font-semibold"><span className="brand-mark"><Globe2 className="size-4" /></span>Life Atlas</a>
        <nav className="hidden gap-7 text-sm text-muted-foreground md:flex"><a href="#explore">Explore</a><a href="#life-trail">Life Trails</a></nav>
        <a href="#journey" className="soft-button">Add your chapter</a>
      </div>
    </header>

    <section id="top" className="atlas-hero relative min-h-[100svh] overflow-hidden pt-16">
      <div className="absolute inset-0"><Suspense fallback={<MapLoading />}><AtlasMap routes={[]} year={currentYear} cinematic /></Suspense><div className="map-wash absolute inset-0" /></div>
      <div className="pointer-events-none relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] max-w-[1480px] flex-col justify-between px-5 pb-8 pt-[9vh] md:px-10">
        <div className="hero-copy max-w-3xl">
          <p className="eyebrow">A living atlas of human journeys</p>
          <h1 className="mt-5 font-editorial text-6xl leading-[.94] md:text-8xl lg:text-[7rem]">Where did life<br /><em>take you?</em></h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">Add one chapter of your story and see how your journey connects to the world.</p>
        </div>
        <div id="journey" className="journey-composer pointer-events-auto max-w-6xl">
          <div className="grid gap-2 lg:grid-cols-[1.25fr_1.25fr_.52fr_auto]">
            <PlaceSearch label="I was in" value={origin} onSelect={setOrigin} icon={<LocateFixed />} />
            <PlaceSearch label="Then I moved to" value={destination} onSelect={setDestination} icon={<MapPin />} />
            <label className="select-field"><span>When?</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown /></label>
            <button className="primary-button" onClick={showJourney}>Show My Journey <ArrowRight /></button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-muted-foreground">Why? <small>(optional)</small></span>{reasons.map((value) => <button key={value} onClick={() => setReason(value)} className={`reason-chip ${reason === value ? 'reason-chip-active' : ''}`}>{reason === value && <Check />}{value}</button>)}</div>
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </div>
      </div>
    </section>

    <section ref={revealRef} className={`reveal-stage ${revealed ? 'is-revealed' : ''}`}>
      {!revealed ? <div className="mx-auto max-w-lg py-28 text-center"><Sparkles className="mx-auto text-primary" /><h2 className="mt-5 font-editorial text-4xl">Your next chapter is waiting.</h2><p className="mt-3 text-muted-foreground">Choose two places above to see your movement fingerprint.</p></div> :
        <div className="relative min-h-[86svh] overflow-hidden">
          <div className="absolute inset-0"><Suspense fallback={<MapLoading />}><AtlasMap routes={userRoutes} trail={trail} cinematic activeRouteIndex={activeChapter} /></Suspense><div className="reveal-wash absolute inset-0" /></div>
          <div className="pointer-events-none relative z-10 mx-auto flex min-h-[86svh] max-w-[1480px] flex-col justify-end px-5 py-8 md:items-end md:px-10 md:py-12">
            <div key={revealRun} className="reveal-sheet pointer-events-auto max-w-[370px]">
              <p className="eyebrow">Your Movement Fingerprint</p>
              <h2 className="mt-3 font-editorial text-4xl md:text-5xl">{selectedRoute?.from.city} <span>→</span> {selectedRoute?.to.city}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{selectedRoute?.year} · {selectedRoute?.reason}</p>
              <div className="insight-row">
                <Insight value={selectedRoute ? formatDistance(distanceKm(selectedRoute.from, selectedRoute.to)) : '—'} label="this chapter" />
                <Insight value={`${fingerprint.timeSinceLatestMove} ${fingerprint.timeSinceLatestMove === 1 ? 'year' : 'years'}`} label="since latest move" />
                <Insight value={sharedCount === null ? 'Private' : sharedCount.toLocaleString()} label={sharedCount === null ? 'below public threshold' : 'shared this route'} />
              </div>
              <div className="fingerprint-summary"><span>{formatDistance(fingerprint.totalDistance)} total</span><span>{fingerprint.locations} {fingerprint.locations === 1 ? 'location' : 'locations'}</span><span>{fingerprint.countries} {fingerprint.countries === 1 ? 'country' : 'countries'}</span><span>{fingerprint.yearsRepresented} {fingerprint.yearsRepresented === 1 ? 'year' : 'years'} represented</span></div>
              {!statsConfigured && <p className="fingerprint-note">Community comparison will appear after the location database is connected.</p>}
            </div>
          </div>
        </div>}
    </section>

    {revealed && <section id="life-trail" className="story-section story-connected"><div className="mx-auto max-w-[1280px] px-5 py-16 md:px-10 md:py-20">
      <div className="grid gap-14 lg:grid-cols-[.72fr_1.28fr]">
        <div className="story-intro"><p className="eyebrow">Your Life Trail</p><h2 className="mt-4 font-editorial text-5xl leading-none md:text-6xl">A life is more than one line.</h2><p className="mt-5 max-w-md leading-7 text-muted-foreground">Each place becomes a chapter. Add them slowly — your story doesn’t need to be finished today.</p><div className="trail-total"><strong>{trail.length}</strong><span>places · {formatDistance(fingerprint.totalDistance)}</span></div></div>
        <div>
          <div className="trail-flow">{trail.map((stop, index) => <div className={`trail-place ${Math.max(0, index - 1) === activeChapter ? 'is-active' : ''}`} key={`${stop.id}-${index}`}>
            <button className="trail-main" onClick={() => setActiveChapter(Math.max(0, index - 1))}><span>{String(index + 1).padStart(2, '0')}</span><div><small>{index === 0 ? 'The beginning' : index === trail.length - 1 ? 'Current chapter' : 'A chapter between'}</small><strong>{stop.city}</strong><p>{stop.region ? `${stop.region}, ` : ''}{stop.country}{stop.arrivalYear ? ` · ${stop.arrivalYear}` : ''}</p></div></button>
            {index > 0 && <div className="trail-actions"><button aria-label={`Edit ${stop.city}`} onClick={() => editChapter(index)}><Pencil /></button><button aria-label={`Move ${stop.city} earlier`} disabled={index === 1} onClick={() => moveChapter(index, -1)}><ArrowUp /></button><button aria-label={`Move ${stop.city} later`} disabled={index === trail.length - 1} onClick={() => moveChapter(index, 1)}><ArrowDown /></button><button aria-label={`Delete ${stop.city}`} disabled={trail.length <= 2} onClick={() => deleteChapter(index)}><Trash2 /></button></div>}
          </div>)}</div>
          <h3 className="mt-9 font-editorial text-3xl">Was there another chapter?</h3>
          <div className="mt-5 flex flex-wrap gap-2"><button className="outline-button" onClick={() => openEditor('before')}><Plus /> Add a place before {trail[0]?.city}</button><button className="outline-button" onClick={() => openEditor('after')}><Plus /> Add where I went after {trail.at(-1)?.city}</button><button className="outline-button" onClick={() => openEditor('move')}><Plus /> Add another move</button></div>
          {editor && <ChapterEditor editor={editor} trail={trail} onClose={() => setEditor(null)} onSave={commitChapter} />}
        </div>
      </div>
      <SaveTrailPanel trail={trail} draftId={draftId} persistence={persistence} />
    </div></section>}

    <ExploreAtlas />
    <footer><span>Life Atlas · A living map of human lives.</span><span>Only privacy-safe community patterns are shown.</span></footer>
  </main>;
}

function PlaceSearch({ label, value, onSelect, icon }: { label: string; value: Place | null; onSelect: (place: Place) => void; icon: ReactNode }) {
  const [query, setQuery] = useState(value?.city ?? '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [results, setResults] = useState<Place[]>([]);
  const search = useServerFn(searchPlaces);

  useEffect(() => setQuery(value?.city ?? ''), [value]);
  useEffect(() => {
    if (!open || query.trim().length < 2 || query === value?.city) {
      setResults([]);
      return;
    }
    let current = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await search({ data: { query } });
        if (current) {
          setConfigured(response.configured);
          setResults(response.places);
        }
      } catch {
        if (current) setResults([]);
      } finally {
        if (current) setLoading(false);
      }
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [open, query, search, value?.city]);

  return <div className="place-field">
    <span>{label}</span>
    <div>{icon}<input value={query} placeholder="Search city…" autoComplete="off" onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} />{loading && <LoaderCircle className="search-spinner" />}</div>
    {open && query.trim().length >= 2 && <div className="place-menu">{!configured ? <p>Connect the location database to search cities.</p> : results.length ? results.map((place) => <button key={place.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(place); setQuery(place.city); setOpen(false); }}><MapPin /><span><strong>{place.city}</strong><small>{place.region ? `${place.region}, ` : ''}{place.country}</small></span>{value?.id === place.id && <Check />}</button>) : !loading && <p>No matching cities found.</p>}</div>}
  </div>;
}

function ChapterEditor({ editor, trail, onClose, onSave }: { editor: { mode: 'before' | 'after' | 'move' | 'edit'; index?: number }; trail: TrailStop[]; onClose: () => void; onSave: (place: Place, year: number, reason: string) => void }) {
  const existing = editor.mode === 'edit' && typeof editor.index === 'number' ? trail[editor.index] : null;
  const edgeYear = editor.mode === 'before' ? (trail[1]?.arrivalYear ?? currentYear) - 3 : (trail.at(-1)?.arrivalYear ?? currentYear) + 3;
  const [place, setPlace] = useState<Place | null>(existing ?? null);
  const [year, setYear] = useState(existing?.arrivalYear ?? Math.max(1900, Math.min(currentYear, edgeYear)));
  const [chapterReason, setChapterReason] = useState(existing?.reason ?? (editor.mode === 'before' ? 'Other' : 'Opportunity'));
  return <div className="add-place chapter-editor">
    <button aria-label="Close chapter editor" onClick={onClose}><X /></button>
    <div><p className="eyebrow">{editor.mode === 'edit' ? 'Edit chapter' : 'A new chapter'}</p><h4>{editor.mode === 'before' ? `Before ${trail[0]?.city}` : editor.mode === 'edit' ? existing?.city : `After ${trail.at(-1)?.city}`}</h4></div>
    <PlaceSearch label="City" value={place} onSelect={setPlace} icon={<Search />} />
    <label className="select-field"><span>Year</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown /></label>
    <label className="select-field"><span>Reason · optional</span><select value={chapterReason} onChange={(event) => setChapterReason(event.target.value)}>{reasons.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown /></label>
    <button className="primary-button" disabled={!place} onClick={() => place && onSave(place, year, chapterReason)}>Save chapter <ArrowRight /></button>
  </div>;
}

function SaveTrailPanel({ trail, draftId, persistence }: { trail: TrailStop[]; draftId: string; persistence: 'loading' | 'idle' | 'saving' | 'saved' | 'error' }) {
  const { data: session, isPending } = authClient.useSession();
  const save = useServerFn(saveTrail);
  const loadAuthCapabilities = useServerFn(getAuthCapabilities);
  const [message, setMessage] = useState('');
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true;
    void loadAuthCapabilities()
      .then((capabilities) => {
        if (current) setGoogleAvailable(capabilities.google);
      })
      .catch(() => {
        if (current) setGoogleAvailable(false);
      });
    return () => { current = false; };
  }, [loadAuthCapabilities]);

  async function google() {
    if (!googleAvailable) {
      setMessage('Google sign-in is waiting for production OAuth credentials. Your trail is still saved privately here.');
      return;
    }
    if (!draftId) return;
    try {
      await save({ data: {
        clientDraftId: draftId,
        title: 'My Life Trail',
        visibility: 'PRIVATE',
          stops: trail.map((stop) => ({ id: stop.id, arrivalYear: stop.arrivalYear, reason: stop.reason as (typeof reasons)[number] | undefined })),
      } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your Life Trail could not be saved.');
      return;
    }
    const result = await authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/#life-trail` });
    if (result.error) setMessage(result.error.message ?? 'Google sign-in is not configured yet.');
  }

  const persistenceCopy = persistence === 'saving' || persistence === 'loading'
    ? 'Saving privately…'
    : persistence === 'error'
      ? 'Could not save this change. We will retry when the trail changes.'
      : 'Saved privately in this browser.';

  return <div className="save-invite">
    <div><p className="eyebrow">Keep your story</p><h3 className="mt-3 font-editorial text-4xl">Keep your Life Atlas with you</h3><p className="mt-2 text-sm text-muted-foreground">Your journey is already saved here. Google adds cross-device access and recovery.</p></div>
    {isPending ? <LoaderCircle className="search-spinner" /> : session?.user ? <div className="save-account"><span><Check />Saved to {session.user.email}</span><button className="auth-button" onClick={() => void authClient.signOut()}><LogOut />Sign out</button></div> : <div className="google-only-auth">
      <p className={`persistence-state ${persistence === 'error' ? 'is-error' : ''}`}>{persistenceCopy}</p>
      <button onClick={() => void google()} className="primary-button" disabled={googleAvailable !== true}><span className="google-g">G</span>{googleAvailable === false ? 'Google sign-in needs credentials' : 'Continue with Google'}</button>
    </div>}
    {message && <p className="save-message" role="status">{message}</p>}
    <p className="col-span-full flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3" />Your Life Trail is private by default.</p>
  </div>;
}

function ExploreAtlas() {
  const [layer, setLayer] = useState<'community' | 'world'>('community');
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [yearFrom, setYearFrom] = useState(2000);
  const [yearTo, setYearTo] = useState(currentYear);
  const [filterReason, setFilterReason] = useState<string>('');
  const [routes, setRoutes] = useState<AtlasRoute[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const explore = useServerFn(getExploreRoutes);

  useEffect(() => {
    if (layer === 'world') return;
    let current = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await explore({ data: { fromCityId: from?.id ?? null, toCityId: to?.id ?? null, yearFrom, yearTo, reason: filterReason ? filterReason as (typeof reasons)[number] : null, countryCode: null } });
        if (current) { setRoutes(result.routes); setConfigured(result.configured); }
      } catch {
        if (current) setRoutes([]);
      } finally {
        if (current) setLoading(false);
      }
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [explore, filterReason, from?.id, layer, to?.id, yearFrom, yearTo]);

  const citySummary = useMemo(() => {
    if (!selectedCity) return null;
    const touching = routes.filter((route) => route.from.city === selectedCity || route.to.city === selectedCity);
    const volume = touching.reduce((sum, route) => sum + route.volume, 0);
    const reasonsByVolume = new Map<string, number>();
    touching.forEach((route) => reasonsByVolume.set(route.reason, (reasonsByVolume.get(route.reason) ?? 0) + route.volume));
    return { volume, reason: [...reasonsByVolume].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—' };
  }, [routes, selectedCity]);

  return <section id="explore" className="explore-stage">
    <div className="absolute inset-0"><Suspense fallback={<MapLoading />}><AtlasMap routes={layer === 'community' ? routes : []} layer={layer} year={yearTo} onCity={setSelectedCity} cinematic /></Suspense></div>
    <div className="pointer-events-none relative z-10 mx-auto flex min-h-[940px] max-w-[1480px] flex-col px-5 py-20 md:px-10">
      <div className="pointer-events-auto flex flex-col justify-between gap-5 md:flex-row"><div><p className="eyebrow">Explore the atlas</p><h2 className="mt-3 font-editorial text-5xl md:text-7xl">See how lives move.</h2></div><div className="layer-toggle"><button className={layer === 'community' ? 'active' : ''} onClick={() => setLayer('community')}>Community Journeys</button><button className={layer === 'world' ? 'active' : ''} onClick={() => setLayer('world')}>World Patterns</button></div></div>
      {layer === 'community' ? <div className="explore-filter-card pointer-events-auto">
        <PlaceSearch label="Origin city" value={from} onSelect={setFrom} icon={<LocateFixed />} />
        <PlaceSearch label="Destination city" value={to} onSelect={setTo} icon={<MapPin />} />
        <label className="select-field"><span>From year</span><select value={yearFrom} onChange={(event) => setYearFrom(Number(event.target.value))}>{years.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown /></label>
        <label className="select-field"><span>To year</span><select value={yearTo} onChange={(event) => setYearTo(Number(event.target.value))}>{years.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown /></label>
        <label className="select-field"><span>Reason</span><select value={filterReason} onChange={(event) => setFilterReason(event.target.value)}><option value="">All reasons</option>{reasons.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown /></label>
        {(from || to || filterReason) && <button className="outline-button clear-filters" onClick={() => { setFrom(null); setTo(null); setFilterReason(''); }}>Clear filters</button>}
      </div> : <div className="world-patterns-note pointer-events-auto"><p className="eyebrow">Prepared for public datasets</p><strong>World Patterns will appear when a source is connected.</strong><span>No sample statistics are shown as real data.</span></div>}
      <div className="mt-auto grid items-end gap-4 lg:grid-cols-[.55fr_1fr]">
        <div className="explore-status pointer-events-auto"><strong>{loading ? 'Reading the atlas…' : !configured ? 'Location database not connected' : routes.length ? `${routes.length} privacy-safe route groups` : 'No public patterns match these filters'}</strong><p>Routes appear only when at least five distinct Life Trails contribute to the group.</p></div>
        <div className="pointer-events-auto timeline"><div><span>Replay movement</span><strong>{yearTo}</strong></div><input aria-label="Map timeline year" type="range" min="1900" max={currentYear} value={yearTo} onChange={(event) => setYearTo(Number(event.target.value))} /><div><small>1900</small><small>{currentYear}</small></div></div>
      </div>
      {selectedCity && citySummary && <aside className="city-panel pointer-events-auto"><button aria-label="Close city details" onClick={() => setSelectedCity(null)}><X /></button><p className="eyebrow">City pulse</p><h3>{selectedCity}</h3><strong>{citySummary.volume.toLocaleString()}</strong><span>journeys across visible groups</span><hr /><small>Leading reason</small><p>{citySummary.reason}</p></aside>}
    </div>
  </section>;
}

function Insight({ value, label }: { value: string; label: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function MapLoading() {
  return <div className="map-loading"><Globe2 /><span>Drawing the world…</span></div>;
}
