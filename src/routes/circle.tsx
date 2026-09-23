import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, LockKeyhole, Sparkles } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { getAuthCapabilities } from '@/server/auth-capabilities';
import { changeConnection, getLifeCircle, getSocialSession, respondChapterTag, respondConnection, respondSharedMoment, searchPeople, sendConnectionRequest, unblockAccount } from '@/server/social';
import { LifeCircleView, type CircleData, type CirclePerson } from '@/components/social/LifeCircleView';
import { SocialProfileForm } from '@/components/social/SocialProfileForm';

export const Route = createFileRoute('/circle')({ component: LifeCircleRoute });

function SocialGate({ googleAvailable, onGoogle }: { googleAvailable: boolean | null; onGoogle: () => void }) {
  return <main className="social-gate"><Link to="/" className="circle-brand">Life Atlas</Link><div className="social-gate-visual"><i/><i/><Sparkles/><span/></div><p className="eyebrow">My Life Circle</p><h1>Your Atlas can remain private and still become part of someone’s story.</h1><p>Google establishes one permanent person. Your Life Atlas handle is what friends use to find you—your email is never public.</p><button className="primary-button" disabled={googleAvailable !== true} onClick={onGoogle}><span className="google-g">G</span>{googleAvailable === false ? 'Google sign-in needs credentials' : 'Continue with Google'}</button><small><LockKeyhole/>No passwords, phone numbers, or contact access.</small><Link to="/"><ArrowLeft/>Return to my Atlas</Link></main>;
}

function LifeCircleRoute() {
  const getSession = useServerFn(getSocialSession);
  const getCircle = useServerFn(getLifeCircle);
  const findPeople = useServerFn(searchPeople);
  const sendRequest = useServerFn(sendConnectionRequest);
  const respond = useServerFn(respondConnection);
  const changeRelationship = useServerFn(changeConnection);
  const respondTag = useServerFn(respondChapterTag);
  const respondMoment = useServerFn(respondSharedMoment);
  const unblock = useServerFn(unblockAccount);
  const capabilities = useServerFn(getAuthCapabilities);
  const [sessionState, setSessionState] = useState<Awaited<ReturnType<typeof getSession>> | null>(null);
  const [circle, setCircle] = useState<CircleData | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CirclePerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const state = await getSession(); setSessionState(state);
    if (state.authenticated && state.profile) setCircle(await getCircle() as CircleData);
  }, [getCircle, getSession]);
  useEffect(()=>{ void load(); void capabilities().then((value)=>setGoogleAvailable(value.google)).catch(()=>setGoogleAvailable(false)); }, [capabilities, load]);
  useEffect(()=>{ if(query.trim().length<2){setResults([]);return;} let current=true;const timer=window.setTimeout(()=>{setSearching(true);void findPeople({data:{query}}).then((value)=>current&&setResults(value.people as CirclePerson[])).catch((error)=>current&&setMessage(error instanceof Error?error.message:'Search unavailable.')).finally(()=>current&&setSearching(false));},280);return()=>{current=false;window.clearTimeout(timer);};},[findPeople, query]);
  async function google(){if(!googleAvailable)return;await authClient.signIn.social({provider:'google',callbackURL:`${window.location.origin}/circle`});}
  async function connect(handle:string){try{await sendRequest({data:{handle}});setMessage(`Request sent to @${handle}.`);await load();if(query) { const refreshed=await findPeople({data:{query}});setResults(refreshed.people as CirclePerson[]); }}catch(error){setMessage(error instanceof Error?error.message:'Request unavailable.');}}
  async function respondTo(requestId:string,action:'ACCEPT'|'IGNORE'|'BLOCK'){try{await respond({data:{requestId,action}});setMessage(action==='ACCEPT'?'Connection accepted.':'Request updated.');await load();}catch(error){setMessage(error instanceof Error?error.message:'Request unavailable.');}}
  async function change(handle:string,action:'REMOVE'|'BLOCK'){try{await changeRelationship({data:{handle,action}});setMessage(action==='BLOCK'?`@${handle} is blocked and pair access is revoked.`:`@${handle} was removed from your Life Circle.`);await load();}catch(error){setMessage(error instanceof Error?error.message:'Connection could not be updated.');}}
  async function answerTag(tagId:string,action:'CONFIRM'|'DECLINE'){try{await respondTag({data:{tagId,action}});setMessage(action==='CONFIRM'?'Chapter association confirmed.':'Chapter association declined.');await load();}catch(error){setMessage(error instanceof Error?error.message:'Chapter request could not be updated.');}}
  async function answerMoment(momentId:string,action:'CONFIRM'|'DECLINE'){try{await respondMoment({data:{momentId,action,showOnMyAtlas:false}});setMessage(action==='CONFIRM'?'Shared moment confirmed privately.':'Shared moment declined.');await load();}catch(error){setMessage(error instanceof Error?error.message:'Shared moment could not be updated.');}}
  async function unblockHandle(handle:string){try{await unblock({data:{handle}});setMessage(`@${handle} is unblocked. Pair permissions remain off.`);await load();}catch(error){setMessage(error instanceof Error?error.message:'Account could not be unblocked.');}}

  if (!sessionState) return <div className="social-loading">Drawing your Life Circle…</div>;
  if (!sessionState.authenticated) return <SocialGate googleAvailable={googleAvailable} onGoogle={()=>void google()}/>;
  if (!sessionState.profile) return <main className="handle-setup"><Link to="/" className="circle-brand">Life Atlas</Link><SocialProfileForm onSaved={()=>void load()}/></main>;
  if (!circle) return <div className="social-loading">Finding the people in your story…</div>;
  return <><LifeCircleView data={circle} searchQuery={query} searchResults={results} searching={searching} onSearchQuery={setQuery} onConnect={(handle)=>void connect(handle)} onRespond={(id,action)=>void respondTo(id,action)} onChangeConnection={(handle,action)=>void change(handle,action)} onUnblock={(handle)=>void unblockHandle(handle)} onRespondTag={(id,action)=>void answerTag(id,action)} onRespondMoment={(id,action)=>void answerMoment(id,action)}/>{message&&<div className="circle-toast" role="status">{message}</div>}</>;
}
