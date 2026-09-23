import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Globe2,
  ImagePlus,
  LoaderCircle,
  LocateFixed,
  LockKeyhole,
  LogOut,
  MapPin,
  Pencil,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Shield,
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
  type StoryVisibility,
  type TrailStop,
  memoryPrompt,
} from '@/lib/atlas-data';
import { claimGuestSaveHandoff, createGuestSaveHandoff, deleteChapterPhoto, getExploreRoutes, getMediaCapabilities, getMyLatestTrail, getRouteStats, getWorldPatternMeta, getWorldPatterns, saveTrail, searchPlaces } from '@/server/atlas';
import { getAuthCapabilities } from '@/server/auth-capabilities';
import { AtlasSelect } from '@/components/AtlasSelect';
import { MovementFingerprint } from '@/components/MovementFingerprint';
import { SharePreviewDialog } from '@/components/SharePreviewDialog';
import { ChapterPeoplePanel, type ChapterPerson } from '@/components/social/ChapterPeoplePanel';
import { ChapterAtlasFallback } from '@/components/social/SocialVisuals';
import { addChapterPerson, getChapterFriendOptions, getChapterPeople, getSocialSession } from '@/server/social';

const AtlasMap = lazy(() => import('@/components/AtlasMap'));
const reasons = ['Career', 'Study', 'Family', 'Love', 'Opportunity', 'A new start', 'Other'] as const;
type ChapterEditorSection = 'details' | 'memory' | 'photos';
const currentYear = new Date().getFullYear();
const years = Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index);
const yearOptions = years.map((value) => ({ value: String(value), label: String(value) }));

const demoTrail: TrailStop[] = [
  { id: 'demo-patna', city: 'Patna', region: 'Bihar', country: 'India', countryCode: 'IN', latitude: 25.5941, longitude: 85.1376 },
  { id: 'demo-bengaluru', city: 'Bengaluru', region: 'Karnataka', country: 'India', countryCode: 'IN', latitude: 12.9716, longitude: 77.5946, arrivalYear: 2012, reason: 'Career' },
  { id: 'demo-london', city: 'London', region: 'England', country: 'United Kingdom', countryCode: 'GB', latitude: 51.5072, longitude: -0.1276, arrivalYear: 2018, reason: 'Opportunity' },
  { id: 'demo-toronto', city: 'Toronto', region: 'Ontario', country: 'Canada', countryCode: 'CA', latitude: 43.6532, longitude: -79.3832, arrivalYear: 2024, reason: 'Family' },
];
const demoRoutes = routesFromTrail(demoTrail);

function trailPersistenceKey(stops: TrailStop[], visibility: StoryVisibility) {
  return JSON.stringify({
    visibility,
    stops: stops.map((stop) => ({
      id: stop.id,
      chapterId: stop.chapterId,
      arrivalYear: stop.arrivalYear,
      endYear: stop.endYear,
      reason: stop.reason,
      title: stop.title,
      memory: stop.memory,
      privacy: stop.privacy,
    })),
  });
}

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
  const [reason, setReason] = useState<(typeof reasons)[number] | ''>('');
  const [revealed, setRevealed] = useState(false);
  const [trail, setTrail] = useState<TrailStop[]>([]);
  const [trailVisibility, setTrailVisibility] = useState<StoryVisibility>('PRIVATE');
  const [demoStopped, setDemoStopped] = useState(false);
  const [draftId, setDraftId] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [persistence, setPersistence] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  const [ownershipMode, setOwnershipMode] = useState<'guest' | 'legacy' | 'account'>('guest');
  const [activeChapter, setActiveChapter] = useState(0);
  const [revealRun, setRevealRun] = useState(0);
  const [revealPlaying, setRevealPlaying] = useState(false);
  const [revealStep, setRevealStep] = useState(0);
  const [replayState, setReplayState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [chapterEditor, setChapterEditor] = useState<{ index: number; section: ChapterEditorSection } | null>(null);
  const [formError, setFormError] = useState('');
  const [sharedCount, setSharedCount] = useState<number | null>(null);
  const [statsConfigured, setStatsConfigured] = useState(true);
  const [editor, setEditor] = useState<{ mode: 'before' | 'after' | 'move' } | null>(null);
  const revealRef = useRef<HTMLElement>(null);
  const loadedOwnerRef = useRef<string | null>(null);
  const lastPersistedStateRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveRevisionRef = useRef(0);
  const routeStats = useServerFn(getRouteStats);
  const loadMyLatestTrail = useServerFn(getMyLatestTrail);
  const claimGuestDraft = useServerFn(claimGuestSaveHandoff);
  const saveCurrentTrail = useServerFn(saveTrail);
  const prepareGuestSave = useServerFn(createGuestSaveHandoff);
  const loadAuthCapabilities = useServerFn(getAuthCapabilities);
  const loadSocialSession = useServerFn(getSocialSession);
  const { data: accountSession, isPending: sessionPending } = authClient.useSession();
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  const [socialProfile, setSocialProfile] = useState<{ handle: string } | null>(null);
  const [authMessage, setAuthMessage] = useState('');

  const userRoutes = useMemo(() => routesFromTrail(trail), [trail]);
  const selectedRoute = userRoutes[activeChapter] ?? userRoutes[0];
  const fingerprint = useMemo(() => fingerprintFor(trail), [trail]);

  useEffect(() => {
    let current = true;
    void loadAuthCapabilities().then((value) => { if (current) setGoogleAvailable(value.google); }).catch(() => { if (current) setGoogleAvailable(false); });
    return () => { current = false; };
  }, [loadAuthCapabilities]);

  useEffect(() => {
    if (sessionPending || !accountSession?.user) { setSocialProfile(null); return; }
    let current = true;
    void loadSocialSession().then((value) => { if (current) setSocialProfile(value.profile ? { handle: value.profile.handle } : null); }).catch(() => { if (current) setSocialProfile(null); });
    return () => { current = false; };
  }, [accountSession?.user, loadSocialSession, sessionPending]);

  useEffect(() => {
    window.localStorage.removeItem('life-atlas-draft');
    window.localStorage.removeItem('life-atlas-save-pending');
    setDraftId(window.crypto.randomUUID());
    setDraftReady(true);
  }, []);

  useEffect(() => {
    const ownerKey = accountSession?.user?.id ?? 'anonymous';
    const loadKey = `${ownerKey}:${draftId}`;
    if (!draftReady || !draftId || sessionPending || loadedOwnerRef.current === loadKey) return;
    let current = true;
    loadedOwnerRef.current = loadKey;
    setPersistence('loading');
    const claimBeforeLoad = accountSession?.user ? claimGuestDraft().catch(() => null) : Promise.resolve(null);
    void claimBeforeLoad.then(() => loadMyLatestTrail()).then((response) => {
      const saved = response.trail;
      if (!current) return;
      setOwnershipMode(response.authenticated ? 'account' : saved && response.ownership === 'anonymous' ? 'legacy' : 'guest');
      if (!saved) {
        if (response.authenticated) setTrailVisibility('FRIENDS');
        return;
      }
      const first = saved.stops[0];
      const second = saved.stops[1];
      if (!first || !second) return;
      loadedOwnerRef.current = `${ownerKey}:${saved.clientDraftId}`;
      const restoredVisibility: StoryVisibility = saved.visibility === 'PRIVATE' ? 'PRIVATE' : 'FRIENDS';
      lastPersistedStateRef.current = trailPersistenceKey(saved.stops, restoredVisibility);
      setTrail(saved.stops);
      setTrailVisibility(restoredVisibility);
      setOrigin(first);
      setDestination(second);
      setActiveChapter(0);
      setRevealed(true);
      setPersistence('saved');
      setDraftId(saved.clientDraftId);
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
    return () => {
      current = false;
      if (loadedOwnerRef.current === loadKey) loadedOwnerRef.current = null;
    };
  }, [accountSession?.user?.id, claimGuestDraft, draftId, draftReady, loadMyLatestTrail, sessionPending]);

  useEffect(() => {
    if (!hydrated || !draftId || trail.length < 2 || !revealed) return;
    if (!accountSession?.user && ownershipMode !== 'legacy') {
      setPersistence('idle');
      return;
    }
    const persistenceKey = trailPersistenceKey(trail, trailVisibility);
    if (lastPersistedStateRef.current === persistenceKey) return;
    const revision = ++saveRevisionRef.current;
    const requestedTrail = trail;
    const requestedVisibility = trailVisibility;
    const timer = window.setTimeout(() => {
      setPersistence('saving');
      const operation = saveQueueRef.current.then(async () => {
        const response = await saveCurrentTrail({ data: {
          clientDraftId: draftId,
          title: 'My Life Trail',
          visibility: requestedVisibility,
          stops: requestedTrail.map((stop) => ({ id: stop.id, chapterId: stop.chapterId, arrivalYear: stop.arrivalYear, endYear: stop.endYear, reason: stop.reason as (typeof reasons)[number] | undefined, title: stop.title, memory: stop.memory, privacy: stop.privacy })),
        } });
        const persistedTrail = requestedTrail.map((stop, index) => {
          const chapterId = response.chapterIds[index];
          return !chapterId || stop.chapterId === chapterId ? stop : { ...stop, chapterId };
        });
        lastPersistedStateRef.current = trailPersistenceKey(persistedTrail, requestedVisibility);
        setTrail((current) => {
          const next = current.map((stop, index) => {
            const chapterId = response.chapterIds[index];
            const requestedStop = requestedTrail[index];
            return !chapterId || stop.chapterId === chapterId || requestedStop?.id !== stop.id ? stop : { ...stop, chapterId };
          });
          return next;
        });
        if (revision === saveRevisionRef.current) setPersistence('saved');
      });
      saveQueueRef.current = operation.catch(() => {
        if (revision === saveRevisionRef.current) setPersistence('error');
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [accountSession?.user, draftId, hydrated, ownershipMode, revealed, saveCurrentTrail, trail, trailVisibility]);

  useEffect(() => {
    if (!revealPlaying) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setRevealStep(3); setRevealPlaying(false); return; }
    const timers = [
      window.setTimeout(() => setRevealStep(1), 2200),
      window.setTimeout(() => setRevealStep(2), 5200),
      window.setTimeout(() => { setRevealStep(3); setRevealPlaying(false); }, 8500),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [revealPlaying, revealRun]);

  useEffect(() => {
    if (replayState !== 'playing' || !userRoutes.length) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setActiveChapter((current) => {
      if (current >= userRoutes.length - 1) { setReplayState('idle'); return current; }
      return current + 1;
    }), reduced ? 800 : 3200);
    return () => window.clearTimeout(timer);
  }, [activeChapter, replayState, userRoutes.length]);

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
    const nextTrail: TrailStop[] = [{ ...origin }, { ...destination, arrivalYear: year, reason: reason || 'Other' }];
    setFormError('');
    setTrail(nextTrail);
    setActiveChapter(0);
    setRevealRun((value) => value + 1);
    setRevealStep(0);
    setRevealPlaying(true);
    setDemoStopped(true);
    setRevealed(true);
    void refreshRouteStats(origin, destination);
    window.scrollTo({ top: sectionTop + window.scrollY - 64, behavior: 'smooth' });
  }

  function startReplay() {
    setRevealPlaying(false);
    setActiveChapter(0);
    setReplayState('playing');
    revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function beginGoogleSignIn() {
    if (!googleAvailable) {
      setAuthMessage('Google sign-in is unavailable right now. This preview is not saved and will be discarded if you refresh.');
      return;
    }
    if (draftId && trail.length >= 2) {
      const payload = {
        clientDraftId: draftId,
        title: 'My Life Trail',
        visibility: accountSession?.user && trailVisibility === 'PRIVATE' ? 'PRIVATE' : 'FRIENDS' as const,
        stops: trail.map((stop) => ({ id: stop.id, chapterId: stop.chapterId, arrivalYear: stop.arrivalYear, endYear: stop.endYear, reason: stop.reason as (typeof reasons)[number] | undefined, title: stop.title, memory: stop.memory, privacy: stop.privacy })),
      };
      try {
        if (ownershipMode === 'legacy') await saveCurrentTrail({ data: payload });
        else if (!accountSession?.user) await prepareGuestSave({ data: payload });
      } catch (error) {
        setAuthMessage(error instanceof Error ? error.message : 'Your Life Atlas could not be prepared for sign-in.');
        return;
      }
    }
    const result = await authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/#life-trail` });
    if (result.error) setAuthMessage(result.error.message ?? 'Google sign-in could not start.');
  }

  function openEditor(mode: 'before' | 'after' | 'move') {
    setEditor({ mode });
  }

  function editChapter(index: number, section: ChapterEditorSection = 'details') {
    setChapterEditor({ index, section });
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
      if (place.id === current.at(-1)?.id) return current;
      return [...current, { ...place, arrivalYear: chapterYear, reason: chapterReason }];
    });
    setActiveChapter(editor?.mode === 'before' ? 0 : Math.max(0, trail.length - 1));
    setRevealRun((value) => value + 1);
    setEditor(null);
  }

  return <main className="min-h-screen bg-background text-foreground">
    <header className="global-header fixed inset-x-0 top-0 z-50 border-b border-border/50 bg-background/75 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-3 px-5 md:px-10">
        <a href="#top" className="flex items-center gap-2 font-semibold"><span className="brand-mark"><Globe2 className="size-4" /></span>Life Atlas</a>
        <nav className="global-nav"><a href="#life-trail">My Atlas</a><a href="#explore">Explore</a><Link to="/circle">Find Friends</Link></nav>
        <div className="header-account">{sessionPending ? <LoaderCircle className="search-spinner" /> : accountSession?.user ? <><span className={`save-status save-status-${persistence}`}>{persistence === 'saving' || persistence === 'loading' ? 'Saving…' : persistence === 'error' ? 'Save issue' : 'Saved'}</span><Link to={socialProfile ? '/profile' : '/circle'} className={socialProfile ? 'profile-link' : 'username-needed'}>{socialProfile ? `@${socialProfile.handle}` : 'Create @username'}</Link></> : <button className="header-google" disabled={googleAvailable !== true} onClick={() => void beginGoogleSignIn()}><span className="google-g">G</span>Continue with Google</button>}</div>
      </div>
      {authMessage && <p className="header-auth-message" role="status">{authMessage}</p>}
    </header>

    <section id="top" className="atlas-hero relative min-h-[100svh] overflow-hidden pt-16">
      <div className="absolute inset-0"><Suspense fallback={<MapLoading />}><AtlasMap routes={hydrated && !revealed && !demoStopped ? demoRoutes : []} trail={hydrated && !revealed && !demoStopped ? demoTrail : []} year={currentYear} cinematic onInteraction={() => setDemoStopped(true)} /></Suspense><div className="map-wash absolute inset-0" /></div>
      <div className="pointer-events-none relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] max-w-[1480px] flex-col justify-between px-5 pb-8 pt-[9vh] md:px-10">
        <div className="hero-copy max-w-3xl">
          <p className="eyebrow">A geographic biography</p>
          <h1 className="mt-5 font-editorial text-6xl leading-[.94] md:text-8xl lg:text-[7rem]">Map where life<br /><em>has taken you.</em></h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">The places that became chapters of your life, seen together.</p>
          {hydrated && !revealed && !demoStopped && <p className="demo-label">Example Life Trail · Patna → Bengaluru → London → Toronto</p>}
        </div>
        {!revealed && <div id="journey" className="journey-composer progressive-composer pointer-events-auto max-w-6xl" onFocus={() => setDemoStopped(true)}>
          <div className="grid gap-2 lg:grid-cols-[1.2fr_1.2fr_.62fr_auto]">
            <PlaceSearch label="1 · Where did your story begin?" value={origin} onSelect={(place) => { setOrigin(place); setDemoStopped(true); }} icon={<LocateFixed />} />
            <div className={origin ? '' : 'progressive-pending'}><PlaceSearch label="2 · Where did life take you next?" value={destination} onSelect={(place) => { setDestination(place); setDemoStopped(true); }} icon={<MapPin />} /></div>
            <div className={destination ? '' : 'progressive-pending'}><AtlasSelect label="3 · When did this chapter begin?" value={String(year)} options={yearOptions} onChange={(value) => setYear(Number(value))} /></div>
            <button className="primary-button" disabled={!origin || !destination} onClick={showJourney}>Reveal My Atlas <ArrowRight /></button>
          </div>
          {destination && <div className="mt-3 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs text-muted-foreground">4 · What brought you there? <small>(optional)</small></span>{reasons.map((value) => <button key={value} onClick={() => setReason(reason === value ? '' : value)} className={`reason-chip ${reason === value ? 'reason-chip-active' : ''}`}>{reason === value && <Check />}{value}</button>)}</div>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
        </div>}
      </div>
    </section>

    <section ref={revealRef} className={`reveal-stage ${revealed ? 'is-revealed' : ''}`}>
      {!revealed ? <div className="mx-auto max-w-lg py-28 text-center"><Sparkles className="mx-auto text-primary" /><h2 className="mt-5 font-editorial text-4xl">Your Life Atlas begins with a place.</h2><p className="mt-3 text-muted-foreground">Choose where your story began, then add the first place life took you.</p></div> :
        <div className="relative min-h-[86svh] overflow-hidden">
          <div className="absolute inset-0"><Suspense fallback={<MapLoading />}><AtlasMap routes={userRoutes} trail={trail} cinematic activeRouteIndex={activeChapter} playback={revealPlaying || replayState === 'playing'} /></Suspense><div className="reveal-wash absolute inset-0" /></div>
          <div className="pointer-events-none relative z-10 mx-auto flex min-h-[86svh] max-w-[1480px] flex-col justify-end px-5 py-8 md:items-end md:px-10 md:py-12">
            <div key={revealRun} className="reveal-sheet pointer-events-auto max-w-[370px]">
                {revealPlaying && revealStep < 3 ? <div className="reveal-narration">
                <p className="eyebrow">Your Life Atlas</p>
                <h2 className="mt-3 font-editorial text-4xl">{revealStep === 0 ? 'Your story began here.' : revealStep === 1 ? `In ${selectedRoute?.year}, life took you to ${selectedRoute?.to.city}.` : 'Two places. One chapter of a much larger story.'}</h2>
                <button className="text-button" onClick={() => { setRevealPlaying(false); setRevealStep(3); }}>Skip reveal</button>
                </div> : replayState !== 'idle' ? <ReplayCard route={selectedRoute} chapter={trail[activeChapter + 1]} state={replayState} onPause={() => setReplayState(replayState === 'playing' ? 'paused' : 'playing')} onRestart={startReplay} onExit={() => setReplayState('idle')} /> : <>
                <div className="fingerprint-lockup"><MovementFingerprint trail={trail} /><div><p className="eyebrow">Your Movement Fingerprint</p><h2 className="mt-3 font-editorial text-4xl">{trail.map((stop) => stop.city).join(' · ')}</h2></div></div>
                <div className="insight-row">
                  <Insight value={`${fingerprint.locations}`} label="places called home" />
                  <Insight value={`${fingerprint.countries}`} label="countries" />
                  <Insight value={formatDistance(fingerprint.totalDistance)} label="moved across life" />
                </div>
                {fingerprint.longestMove && <p className="biggest-leap"><span>Biggest leap</span>{fingerprint.longestMove.from.city} → {fingerprint.longestMove.to.city} · {formatDistance(distanceKm(fingerprint.longestMove.from, fingerprint.longestMove.to))}</p>}
                <div className="reveal-actions"><button className="outline-button" onClick={startReplay}><Play />Replay my life</button><button className="text-button" onClick={() => { setRevealRun((value) => value + 1); setRevealStep(0); setRevealPlaying(true); }}>Replay reveal</button></div>
                {!statsConfigured && <p className="fingerprint-note">Your personal insights are calculated from your chapters.</p>}
              </>}
            </div>
          </div>
        </div>}
    </section>

    {revealed && <section id="life-trail" className="story-section story-connected"><div className="mx-auto max-w-[1280px] px-5 py-16 md:px-10 md:py-20">
      <div className="grid gap-14 lg:grid-cols-[.72fr_1.28fr]">
        <div className="story-intro"><p className="eyebrow">Your Life Trail</p><h2 className="mt-4 font-editorial text-5xl leading-none md:text-6xl">A life is more than one line.</h2><p className="mt-5 max-w-md leading-7 text-muted-foreground">Each place becomes a chapter. Add them slowly — your story doesn’t need to be finished today.</p><MovementFingerprint trail={trail} className="story-fingerprint" /><div className="trail-total"><strong>{trail.length}</strong><span>places · {formatDistance(fingerprint.totalDistance)}</span></div></div>
        <div>
          <div className="trail-flow">{trail.map((stop, index) => <div className={`trail-place ${Math.max(0, index - 1) === activeChapter ? 'is-active' : ''}`} key={`${stop.id}-${index}`}>
            <button className="trail-main" onClick={() => setActiveChapter(Math.max(0, index - 1))}><span>{String(index + 1).padStart(2, '0')}</span><div><small>{index === 0 ? 'The beginning' : index === trail.length - 1 ? 'Current chapter' : 'A chapter between'}</small><strong>{stop.city}</strong><p>{stop.region ? `${stop.region}, ` : ''}{stop.country}{stop.arrivalYear ? ` · ${stop.arrivalYear}${stop.endYear ? `–${stop.endYear}` : ''}` : ''}{stop.reason && stop.reason !== 'Other' ? ` · ${stop.reason}` : ''}</p>{stop.title && <b>{stop.title}</b>}{stop.memory && <blockquote>{stop.memory}</blockquote>}{stop.photos?.length ? <div className={`trail-photo-grid count-${Math.min(3, stop.photos.length)}`}>{stop.photos.slice(0, 3).map((photo) => <img key={photo.id} src={photo.url} alt={photo.caption || `Memory from ${stop.city}`} loading="lazy" />)}{stop.photos.length > 3 && <span>+{stop.photos.length - 3}</span>}</div> : <ChapterAtlasFallback city={stop.city} country={stop.country} latitude={stop.latitude} longitude={stop.longitude}/>}</div></button>
            <div className="trail-actions"><button className="edit-action" aria-label={`Edit ${stop.city}`} onClick={() => editChapter(index)}><Pencil /><span>Edit</span></button>{index > 0 && <><button className="manage-action" aria-label={`Move ${stop.city} earlier`} disabled={index === 1} onClick={() => moveChapter(index, -1)}><ArrowUp /></button><button className="manage-action" aria-label={`Move ${stop.city} later`} disabled={index === trail.length - 1} onClick={() => moveChapter(index, 1)}><ArrowDown /></button><button className="manage-action" aria-label={`Delete ${stop.city}`} disabled={trail.length <= 2} onClick={() => deleteChapter(index)}><Trash2 /></button></>}</div>
            <div className="chapter-story-actions">
              <button className="memory-action" onClick={() => editChapter(index, 'memory')}>{stop.memory || stop.title ? 'Edit memory' : 'Add memory'}</button>
              <button className="memory-action photo-action" onClick={() => editChapter(index, 'photos')}>{stop.photos?.length ? 'Manage photos' : 'Add photos'}</button>
            </div>
            {stop.chapterId && accountSession?.user && (socialProfile ? <ChapterPeopleConnected chapterId={stop.chapterId} city={stop.city}/> : <div className="chapter-username-needed"><strong>Create your Life Atlas @username to add friends.</strong><span>Your email stays private; friends find you by exact username.</span><Link to="/circle">Create @username</Link></div>)}
            {chapterEditor?.index === index && <MemoryEditor stop={stop} index={index} total={trail.length} section={chapterEditor.section} onClose={() => setChapterEditor(null)} onSave={(changes) => { setTrail((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item)); setChapterEditor(null); }} onPhotosChanged={() => void loadMyLatestTrail().then((response) => response.trail && setTrail(response.trail.stops))} />}
          </div>)}</div>
          <h3 className="mt-9 font-editorial text-3xl">Where did life take you next?</h3>
          <div className="mt-5 flex flex-wrap gap-2"><button className="primary-button compact" onClick={() => openEditor('after')}><Plus /> Add the next chapter</button><button className="outline-button" onClick={() => openEditor('before')}><Plus /> Add an earlier beginning</button><button className="outline-button" onClick={() => openEditor('move')}><Plus /> Add a chapter between</button></div>
          {editor && <ChapterEditor editor={editor} trail={trail} onClose={() => setEditor(null)} onSave={commitChapter} />}
        </div>
      </div>
      <SaveTrailPanel trail={trail} ownershipMode={ownershipMode} persistence={persistence} visibility={trailVisibility} googleAvailable={googleAvailable} onGoogle={beginGoogleSignIn} onVisibility={setTrailVisibility} onReplay={startReplay} />
    </div></section>}

    <ExploreAtlas />
    <footer><span>Life Atlas · A living map of human lives.</span><span>Private by default · World patterns sourced from UN DESA.</span></footer>
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

function ChapterEditor({ editor, trail, onClose, onSave }: { editor: { mode: 'before' | 'after' | 'move' }; trail: TrailStop[]; onClose: () => void; onSave: (place: Place, year: number, reason: string) => void }) {
  const edgeYear = editor.mode === 'before' ? (trail[1]?.arrivalYear ?? currentYear) - 3 : (trail.at(-1)?.arrivalYear ?? currentYear) + 3;
  const [place, setPlace] = useState<Place | null>(null);
  const [year, setYear] = useState(Math.max(1900, Math.min(currentYear, edgeYear)));
  const [chapterReason, setChapterReason] = useState(editor.mode === 'before' ? 'Other' : 'Opportunity');
  return <div className="add-place chapter-editor">
    <button aria-label="Close chapter editor" onClick={onClose}><X /></button>
    <div><p className="eyebrow">A new chapter</p><h4>{editor.mode === 'before' ? `Before ${trail[0]?.city}` : `After ${trail.at(-1)?.city}`}</h4></div>
    <PlaceSearch label="City" value={place} onSelect={setPlace} icon={<Search />} />
    <AtlasSelect label="Year" value={String(year)} options={yearOptions} onChange={(value) => setYear(Number(value))} />
    <AtlasSelect label="Reason · optional" value={chapterReason} options={reasons.map((value) => ({ value, label: value }))} onChange={setChapterReason} />
    <button className="primary-button" disabled={!place} onClick={() => place && onSave(place, year, chapterReason)}>Save chapter <ArrowRight /></button>
  </div>;
}

function ReplayCard({ route, chapter, state, onPause, onRestart, onExit }: { route: AtlasRoute | undefined; chapter: TrailStop | undefined; state: 'playing' | 'paused'; onPause: () => void; onRestart: () => void; onExit: () => void }) {
  return <div className="replay-card">
    <p className="eyebrow">Replay my life</p>
    <h2 className="mt-3 font-editorial text-4xl">{route?.to.city}</h2>
    <p>{route?.year}{route?.reason && route.reason !== 'Other' ? ` · ${route.reason}` : ''}</p>
    {chapter?.title && <strong className="replay-chapter-title">{chapter.title}</strong>}
    {chapter?.memory && <blockquote className="replay-memory">{chapter.memory}</blockquote>}
    {chapter?.photos?.length ? <div className="replay-photo-strip">{chapter.photos.slice(0, 2).map((photo) => <img className="replay-photo" key={photo.id} src={photo.url} alt={photo.caption || `Memory from ${chapter.city}`} />)}</div> : null}
    <small>{route ? `${route.from.city} → ${route.to.city}` : ''}</small>
    <div className="replay-controls"><button className="outline-button" onClick={onPause}>{state === 'playing' ? <><Pause />Pause</> : <><Play />Continue</>}</button><button className="outline-button" onClick={onRestart}><RotateCcw />Restart</button><button className="text-button" onClick={onExit}>Exit</button></div>
  </div>;
}

function MemoryEditor({ stop, index, total, section, onClose, onSave, onPhotosChanged }: { stop: TrailStop; index: number; total: number; section: ChapterEditorSection; onClose: () => void; onSave: (changes: Partial<TrailStop>) => void; onPhotosChanged: () => void }) {
  const [place, setPlace] = useState<Place>(stop);
  const [startYear, setStartYear] = useState(stop.arrivalYear ? String(stop.arrivalYear) : '');
  const [chapterReason, setChapterReason] = useState(stop.reason ?? 'Other');
  const [title, setTitle] = useState(stop.title ?? '');
  const [memory, setMemory] = useState(stop.memory ?? '');
  const [endYear, setEndYear] = useState(stop.endYear ? String(stop.endYear) : '');
  const [privacy, setPrivacy] = useState<StoryVisibility | 'INHERIT'>(stop.privacy ?? 'INHERIT');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [mediaState, setMediaState] = useState<'loading' | 'ready' | 'signin' | 'storage'>('loading');
  const [message, setMessage] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const memoryRef = useRef<HTMLLabelElement>(null);
  const photosRef = useRef<HTMLDivElement>(null);
  const mediaCapabilities = useServerFn(getMediaCapabilities);
  const removePhoto = useServerFn(deleteChapterPhoto);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const target = section === 'memory' ? memoryRef.current : section === 'photos' ? photosRef.current : editorRef.current;
      target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [section]);

  useEffect(() => {
    let current = true;
    void mediaCapabilities().then((capabilities) => {
      if (current) setMediaState(capabilities.uploads ? 'ready' : capabilities.storageConfigured ? 'signin' : 'storage');
    }).catch(() => { if (current) setMediaState('storage'); });
    return () => { current = false; };
  }, [mediaCapabilities]);

  async function addPhoto(file: File) {
    if (!stop.chapterId) { setMessage('Save this chapter first, then add a photo.'); return; }
    const capabilities = await mediaCapabilities();
    if (!capabilities.authenticated) { setMessage('Sign in with Google to add private photographs.'); return; }
    if (!capabilities.storageConfigured) { setMessage('Photo storage is ready in the app, but the private Vercel Blob store has not been connected yet.'); return; }
    const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif']);
    if (!acceptedTypes.has(file.type) || file.size > capabilities.maxSourceBytes) { setMessage('Choose a JPG, PNG, WebP, AVIF, HEIC, or HEIF image under 25 MB.'); return; }
    setUploading(true);
    setUploadProgress(0);
    setMessage('Preparing photo…');
    try {
      const prepared = await prepareImage(file);
      if (prepared.file.size > capabilities.maxBytes) throw new Error('The prepared photo is still too large. Choose a smaller image.');
      const { upload } = await import('@vercel/blob/client');
      await upload(`life-atlas/${stop.chapterId}/${crypto.randomUUID()}.webp`, prepared.file, {
        access: 'private',
        handleUploadUrl: '/api/upload',
        clientPayload: JSON.stringify({ chapterId: stop.chapterId, width: prepared.width, height: prepared.height }),
        onUploadProgress: ({ percentage }) => { setUploadProgress(Math.round(percentage)); setMessage(`Uploading photograph… ${Math.round(percentage)}%`); },
      });
      setMessage('Photo added.');
      onPhotosChanged();
      window.setTimeout(onPhotosChanged, 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This photo could not be uploaded.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function deletePhoto(mediaId: string) {
    try { await removePhoto({ data: { mediaId } }); onPhotosChanged(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'This photo could not be removed.'); }
  }

  const startIsValid = index === 0 || Boolean(startYear);
  return <div ref={editorRef} className="memory-editor chapter-detail-editor" role="region" aria-labelledby={`chapter-editor-${index}`}>
    <button className="memory-close" aria-label="Close chapter editor" onClick={onClose}><X /></button>
    <p className="eyebrow">Edit chapter · {String(index + 1).padStart(2, '0')}</p>
    <h4 ref={headingRef} id={`chapter-editor-${index}`} tabIndex={-1}>{memoryPrompt(stop, index, total)}</h4>
    <div className="chapter-edit-basics">
      <PlaceSearch label="City" value={place} onSelect={setPlace} icon={<Search />} />
      <label><span>Start year{index === 0 ? ' · optional' : ''}</span><input type="number" min="1900" max={currentYear + 10} value={startYear} placeholder={index === 0 ? 'When this chapter began' : 'Required'} onChange={(event) => setStartYear(event.target.value)} /></label>
      <AtlasSelect label="Reason · optional" value={chapterReason} options={reasons.map((value) => ({ value, label: value }))} onChange={setChapterReason} />
      <label><span>End year · optional</span><input type="number" min={startYear ? Number(startYear) : 1900} max={currentYear + 10} value={endYear} placeholder="Present" onChange={(event) => setEndYear(event.target.value)} /></label>
    </div>
    <label><span>Short title · optional</span><input value={title} maxLength={120} placeholder="The city where my career really started" onChange={(event) => setTitle(event.target.value)} /></label>
    <label ref={memoryRef} className="chapter-editor-target"><span>Your memory · optional</span><textarea value={memory} maxLength={5000} rows={5} placeholder={`What do you remember about your first days in ${stop.city}?`} onChange={(event) => setMemory(event.target.value)} /></label>
    <div className="memory-meta"><AtlasSelect label="Chapter privacy" value={privacy} options={[{ value: 'INHERIT', label: 'Same as Life Atlas' }, { value: 'PRIVATE', label: 'Private' }]} onChange={(value) => setPrivacy(value as StoryVisibility | 'INHERIT')} /></div>
    <div ref={photosRef} className="photo-heading chapter-editor-target"><div><strong>Photographs</strong><small>Up to five private chapter photos.</small></div>{mediaState === 'signin' && <span>Google sign-in required</span>}{mediaState === 'storage' && <span>Private storage not connected</span>}</div>
    <div className="memory-photos">
      {stop.photos?.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.caption || `Memory from ${stop.city}`} loading="lazy" /><button aria-label="Remove photo" onClick={() => void deletePhoto(photo.id)}><Trash2 /></button></figure>)}
      {(stop.photos?.length ?? 0) < 5 && <label className={`photo-picker ${mediaState !== 'ready' ? 'is-disabled' : ''}`}><ImagePlus /><span>{uploading ? `Uploading ${uploadProgress ?? 0}%` : mediaState === 'signin' ? 'Sign in to add photos' : mediaState === 'storage' ? 'Photos unavailable' : 'Add photo'}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,.heic,.heif" disabled={uploading || mediaState !== 'ready'} onChange={(event) => { const file = event.target.files?.[0]; if (file) void addPhoto(file); event.target.value = ''; }} /></label>}
    </div>
    {mediaState === 'signin' && <p className="memory-message">Your preview stays in memory until you save with Google. Sign in before adding private photographs.</p>}
    {mediaState === 'storage' && <p className="memory-message">Written memories are ready. Photo uploads will unlock when the private Vercel Blob store is connected.</p>}
    {message && <p className="memory-message" role="status">{message}</p>}
    <div className="memory-buttons"><button className="outline-button" onClick={onClose}>Cancel</button><button className="primary-button compact" disabled={!startIsValid} onClick={() => onSave({
      ...place,
      arrivalYear: startYear ? Number(startYear) : undefined,
      endYear: endYear ? Number(endYear) : undefined,
      reason: chapterReason,
      title: title.trim(),
      memory: memory.trim(),
      privacy: privacy === 'INHERIT' ? undefined : privacy,
    })}>Save chapter <ArrowRight /></button></div>
  </div>;
}

async function prepareImage(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not prepare this image.')), 'image/webp', .84));
  return { file: new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'memory'}.webp`, { type: 'image/webp' }), width, height };
}

function SaveTrailPanel({ trail, ownershipMode, persistence, visibility, googleAvailable, onGoogle, onVisibility, onReplay }: { trail: TrailStop[]; ownershipMode: 'guest' | 'legacy' | 'account'; persistence: 'loading' | 'idle' | 'saving' | 'saved' | 'error'; visibility: StoryVisibility; googleAvailable: boolean | null; onGoogle: () => Promise<void>; onVisibility: (value: StoryVisibility) => void; onReplay: () => void }) {
  const { data: session, isPending } = authClient.useSession();
  const [message, setMessage] = useState('');
  const [sharePreviewOpen, setSharePreviewOpen] = useState(false);

  const persistenceCopy = ownershipMode === 'guest'
    ? 'Preview only — not saved. Refreshing or leaving this page will discard it.'
    : persistence === 'saving' || persistence === 'loading'
      ? 'Saving privately…'
      : persistence === 'error'
        ? 'Could not save this change. We will retry when the trail changes.'
        : 'Legacy Atlas saved in this browser. Sign in to claim it permanently.';

  return <div className="save-invite">
    <div><p className="eyebrow">Keep your story</p><h3 className="mt-3 font-editorial text-4xl">{ownershipMode === 'guest' ? 'Save your Atlas' : 'Your Atlas belongs to you'}</h3><p className="mt-2 text-sm text-muted-foreground">{ownershipMode === 'guest' ? 'You are exploring a private preview. Google sign-in is required to keep it.' : 'Friends-only by default. Only mutually accepted friends can open the Atlas you permit.'}</p></div>
    <div className="privacy-panel">
      {session?.user && <div className="privacy-options" role="radiogroup" aria-label="Life Atlas visibility">
        <button className={visibility === 'FRIENDS' ? 'active' : ''} onClick={() => onVisibility('FRIENDS')}><Shield /><span><strong>Friends-only</strong><small>Mutually accepted friends</small></span></button>
        <button className={visibility === 'PRIVATE' ? 'active' : ''} onClick={() => onVisibility('PRIVATE')}><LockKeyhole /><span><strong>Private</strong><small>Only you</small></span></button>
      </div>}
      {session?.user && visibility !== 'PRIVATE' && <p className="privacy-reminder">Friends see your route and chapter details, but private memories and photographs remain private.</p>}
      <div className="share-artifacts"><button className="outline-button" onClick={() => setSharePreviewOpen(true)}><Share2 />Create an Atlas Card</button><button className="outline-button" onClick={onReplay}><Play />Replay my life</button></div>
    </div>
    {isPending ? <LoaderCircle className="search-spinner" /> : session?.user ? <div className="save-account"><span><Check />Saved to your Google account</span><button className="auth-button" onClick={() => void authClient.signOut()}><LogOut />Sign out</button></div> : <div className="google-only-auth">
      <p className={`persistence-state ${persistence === 'error' ? 'is-error' : ''}`}>{persistenceCopy}</p>
      <button onClick={() => void onGoogle()} className="primary-button" disabled={googleAvailable !== true}><span className="google-g">G</span>{googleAvailable === false ? 'Google sign-in needs credentials' : ownershipMode === 'guest' ? 'Save My Atlas with Google' : 'Claim with Google'}</button>
    </div>}
    {message && <p className="save-message" role="status">{message}</p>}
    <p className="col-span-full flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3" />New previews stay only in memory until Google sign-in. Existing anonymous Atlases can still be safely claimed by their original browser.</p>
    <SharePreviewDialog open={sharePreviewOpen} onOpenChange={setSharePreviewOpen} trail={trail} shareUrl="" />
  </div>;
}

function ChapterPeopleConnected({ chapterId, city }: { chapterId: string; city: string }) {
  const loadPeople = useServerFn(getChapterPeople);
  const loadFriends = useServerFn(getChapterFriendOptions);
  const addPerson = useServerFn(addChapterPerson);
  const [people, setPeople] = useState<ChapterPerson[]>([]);
  const [friends, setFriends] = useState<Array<{ displayName: string; handle: string }>>([]);

  async function refresh() {
    const result = await loadPeople({ data: { chapterId } });
    setPeople(result.people as ChapterPerson[]);
  }

  useEffect(() => {
    let current = true;
    void Promise.all([loadPeople({ data: { chapterId } }), loadFriends({ data: { chapterId } })])
      .then(([peopleResult, friendResult]) => { if (current) { setPeople(peopleResult.people as ChapterPerson[]); setFriends(friendResult.friends); } })
      .catch(() => { if (current) { setPeople([]); setFriends([]); } });
    return () => { current = false; };
  }, [chapterId, loadFriends, loadPeople]);

  async function addHandle(handle: string) {
    await addPerson({ data: { chapterId, handle: handle.replace(/^@+/, '') } });
    await refresh();
  }

  return <ChapterPeoplePanel city={city} people={people} friends={friends} onAddFriend={addHandle} />;
}

function CountrySearch({ countries, value, onSelect }: { countries: Array<{ code: string; name: string }>; value: { code: string; name: string } | null; onSelect: (country: { code: string; name: string }) => void }) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  useEffect(() => setQuery(value?.name ?? ''), [value]);
  const results = useMemo(() => countries.filter((country) => country.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 10), [countries, query]);
  function choose(country: { code: string; name: string }) { onSelect(country); setQuery(country.name); setOpen(false); }
  return <div className="country-search">
    <span>Search one country</span><div><Search /><input role="combobox" aria-expanded={open} aria-autocomplete="list" value={query} placeholder="India, Canada, Fiji…" onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} onChange={(event) => { setQuery(event.target.value); setOpen(true); setHighlight(0); }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setHighlight((index) => Math.min(results.length - 1, index + 1)); } if (event.key === 'ArrowUp') { event.preventDefault(); setHighlight((index) => Math.max(0, index - 1)); } if (event.key === 'Enter' && results[highlight]) { event.preventDefault(); choose(results[highlight]); } if (event.key === 'Escape') setOpen(false); }} /></div>
    {open && query && <div className="country-menu" role="listbox">{results.length ? results.map((country, index) => <button role="option" aria-selected={value?.code === country.code} className={highlight === index ? 'highlighted' : ''} key={country.code} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(country)}><span>{country.name}</span><small>{country.code}</small>{value?.code === country.code && <Check />}</button>) : <p>No matching country.</p>}</div>}
  </div>;
}

function ExploreAtlas() {
  const [focus, setFocus] = useState<Place | null>(null);
  const [perspective, setPerspective] = useState<'from' | 'to'>('from');
  const [yearTo, setYearTo] = useState(currentYear);
  const [routes, setRoutes] = useState<AtlasRoute[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [worldMeta, setWorldMeta] = useState<{ available: boolean; source: { provider: string; datasetName: string; version: string; sourceUrl: string } | null; years: number[]; countries: Array<{ code: string; name: string }> } | null>(null);
  const [worldRoutes, setWorldRoutes] = useState<AtlasRoute[]>([]);
  const [worldCountry, setWorldCountry] = useState<{ code: string; name: string } | null>(null);
  const explore = useServerFn(getExploreRoutes);
  const loadWorldMeta = useServerFn(getWorldPatternMeta);
  const loadWorldPatterns = useServerFn(getWorldPatterns);

  useEffect(() => { let current = true; void loadWorldMeta().then((meta) => { if (!current) return; setWorldMeta(meta); if (meta.years.length) setYearTo(meta.years.at(-1)!); }).catch(() => current && setWorldMeta({ available: false, source: null, years: [], countries: [] })); return () => { current = false; }; }, [loadWorldMeta]);

  useEffect(() => {
    if (!worldMeta?.available || !worldMeta.years.includes(yearTo)) return;
    let current = true; setLoading(true);
    void loadWorldPatterns({ data: { countryCode: worldCountry?.code ?? null, perspective, year: yearTo } }).then((result) => current && setWorldRoutes(result.routes)).catch(() => current && setWorldRoutes([])).finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [loadWorldPatterns, perspective, worldCountry?.code, worldMeta, yearTo]);

  useEffect(() => {
    let current = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await explore({ data: { fromCityId: perspective === 'from' ? focus?.id ?? null : null, toCityId: perspective === 'to' ? focus?.id ?? null : null, yearFrom: 1900, yearTo, reason: null, countryCode: null } });
        if (current) { setRoutes(result.routes); setConfigured(result.configured); }
      } catch {
        if (current) setRoutes([]);
      } finally {
        if (current) { setLoading(false); setLoaded(true); }
      }
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [explore, focus?.id, perspective, yearTo]);

  const citySummary = useMemo(() => {
    if (!selectedCity) return null;
    const touching = routes.filter((route) => route.from.city === selectedCity || route.to.city === selectedCity);
    const volume = touching.reduce((sum, route) => sum + route.volume, 0);
    const reasonsByVolume = new Map<string, number>();
    touching.forEach((route) => reasonsByVolume.set(route.reason, (reasonsByVolume.get(route.reason) ?? 0) + route.volume));
    return { volume, reason: [...reasonsByVolume].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—' };
  }, [routes, selectedCity]);

  if (!worldMeta) return null;
  if (worldMeta.available) {
    const source = worldMeta.source!;
    return <section id="explore" className="explore-stage world-patterns-stage">
      <div className="absolute inset-0"><Suspense fallback={<MapLoading />}><AtlasMap routes={worldRoutes} layer="world" year={yearTo} cinematic /></Suspense></div>
      <div className="pointer-events-none relative z-10 mx-auto flex min-h-[940px] max-w-[1480px] flex-col px-5 py-20 md:px-10">
        <div className="pointer-events-auto"><p className="eyebrow">World patterns · {yearTo}</p><h2 className="mt-3 font-editorial text-5xl md:text-7xl">World in motion.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Explore where international migrants from a country live—or where people living there came from. These are migrant stock estimates, not annual moves.</p></div>
        <div className="world-controls pointer-events-auto">
          <CountrySearch countries={worldMeta.countries} value={worldCountry} onSelect={setWorldCountry} />
          <div className="perspective-toggle"><button className={perspective === 'from' ? 'active' : ''} onClick={() => setPerspective('from')}>From this place</button><button className={perspective === 'to' ? 'active' : ''} onClick={() => setPerspective('to')}>To this place</button></div>
          {worldCountry && <button className="text-button" onClick={() => setWorldCountry(null)}>Show global view</button>}
        </div>
        <div className="world-ranking pointer-events-auto"><p className="eyebrow">{worldCountry ? perspective === 'from' ? `Leading destinations from ${worldCountry.name}` : `Leading origins into ${worldCountry.name}` : 'Largest country connections'}</p>{worldRoutes.slice(0, 5).map((route, index) => <div key={`${route.from.id}-${route.to.id}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{perspective === 'to' && worldCountry ? route.from.city : route.to.city}</strong><b>{route.volume.toLocaleString()}</b></div>)}</div>
        <div className="mt-auto grid items-end gap-4 lg:grid-cols-[.75fr_1fr]">
          <div className="world-source pointer-events-auto"><strong>{source.provider}</strong><span>{source.datasetName}</span><small>{source.version}</small><a href={source.sourceUrl} target="_blank" rel="noreferrer">Source & methodology</a></div>
          <div className="pointer-events-auto timeline"><div><span>Change through time</span><strong>{yearTo}</strong></div><input aria-label="International migrant stock year" type="range" min="0" max={worldMeta.years.length - 1} value={Math.max(0, worldMeta.years.indexOf(yearTo))} onChange={(event) => setYearTo(worldMeta.years[Number(event.target.value)] ?? yearTo)} /><div><small>{worldMeta.years[0]}</small><small>{worldMeta.years.at(-1)}</small></div></div>
        </div>
      </div>
    </section>;
  }

  if (loaded && (!configured || (!routes.length && !focus))) return null;

  return <section id="explore" className="explore-stage">
    <div className="absolute inset-0"><Suspense fallback={<MapLoading />}><AtlasMap routes={routes} layer="community" year={yearTo} onCity={setSelectedCity} cinematic /></Suspense></div>
    <div className="pointer-events-none relative z-10 mx-auto flex min-h-[940px] max-w-[1480px] flex-col px-5 py-20 md:px-10">
      <div className="pointer-events-auto"><p className="eyebrow">Life Atlas community</p><h2 className="mt-3 font-editorial text-5xl md:text-7xl">Real paths, safely combined.</h2><p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">Only anonymous aggregate patterns supported by at least five separately opted-in Atlases appear here. No personal journey is exposed.</p></div>
      <div className="community-explore-control pointer-events-auto">
        <PlaceSearch label="Search one city" value={focus} onSelect={setFocus} icon={<Search />} />
        <div className="perspective-toggle"><button className={perspective === 'from' ? 'active' : ''} onClick={() => setPerspective('from')}>From this place</button><button className={perspective === 'to' ? 'active' : ''} onClick={() => setPerspective('to')}>To this place</button></div>
        {focus && <button className="text-button" onClick={() => setFocus(null)}>Clear</button>}
      </div>
      <div className="mt-auto grid items-end gap-4 lg:grid-cols-[.55fr_1fr]">
        <div className="explore-status pointer-events-auto"><strong>{loading ? 'Reading the atlas…' : `${routes.length} privacy-safe route groups`}</strong><p>Private and unlisted Life Atlases are never included.</p></div>
        <div className="pointer-events-auto timeline"><div><span>Change through time</span><strong>{yearTo}</strong></div><input aria-label="Community patterns through year" type="range" min="1900" max={currentYear} value={yearTo} onChange={(event) => setYearTo(Number(event.target.value))} /><div><small>1900</small><small>{currentYear}</small></div></div>
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
