import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { ArrowRight, Compass, LockKeyhole, Sparkles } from 'lucide-react';
import { ProfileMark } from '@/components/social/SocialVisuals';
import { authClient } from '@/lib/auth-client';
import { getAuthCapabilities } from '@/server/auth-capabilities';
import { claimSocialInvite, getSocialInvite, getSocialSession } from '@/server/social';

export const Route = createFileRoute('/invite/$token')({ component: InviteRoute });

type InviteData = { kind: 'CONNECTION'|'CHAPTER'|'COMPARE'; message: string|null; inviter: { displayName: string; handle: string }; context: string; expiresAt: string };

function InviteRoute(){
  const {token}=Route.useParams();
  const loadInvite=useServerFn(getSocialInvite);const loadSession=useServerFn(getSocialSession);const claim=useServerFn(claimSocialInvite);const capabilities=useServerFn(getAuthCapabilities);
  const [invite,setInvite]=useState<InviteData|null|undefined>(undefined);const [authenticated,setAuthenticated]=useState(false);const [hasProfile,setHasProfile]=useState(false);const [google,setGoogle]=useState(false);const [message,setMessage]=useState('');
  useEffect(()=>{void Promise.all([loadInvite({data:{token}}),loadSession(),capabilities()]).then(([result,session,auth])=>{setInvite(result.invite as InviteData|null);setAuthenticated(session.authenticated);setHasProfile(Boolean(session.profile));setGoogle(auth.google);}).catch(()=>setInvite(null));},[capabilities, loadInvite, loadSession, token]);
  async function googleSignIn(){if(!google)return;await authClient.signIn.social({provider:'google',callbackURL:window.location.href});}
  async function accept(){try{await claim({data:{token}});setMessage('Invitation connected to your Life Atlas.');window.setTimeout(()=>{window.location.href='/circle';},900);}catch(error){setMessage(error instanceof Error?error.message:'This invitation could not be claimed.');}}
  if(invite===undefined)return <div className="social-loading">Opening this invitation…</div>;
  if(!invite)return <main className="invite-page expired"><div><LockKeyhole/><h1>This invitation is no longer available.</h1><p>It may have expired, been revoked, or already been claimed.</p><Link to="/">Create your own Atlas <ArrowRight/></Link></div></main>;
  return <main className="invite-page"><header><Link to="/" className="circle-brand">Life Atlas</Link><span>Private invitation</span></header><section className="invite-card"><div className="invite-visual"><ProfileMark handle={invite.inviter.handle} size={180}/><span/><i/><Sparkles/></div><p className="eyebrow">A life is reaching yours</p><h1>{invite.context}</h1>{invite.message&&<blockquote>“{invite.message}”</blockquote>}<p>This invitation reveals no private route, city, memory, or photograph. You decide what—if anything—your Atlases share.</p><div className="invite-actions">{authenticated&&hasProfile?<button className="primary-button" onClick={()=>void accept()}>Join {invite.inviter.displayName}’s Life Circle <ArrowRight/></button>:<><Link to="/" className="primary-button"><Compass/>Create your Atlas first</Link><button className="outline-button" disabled={!google} onClick={()=>void googleSignIn()}><span className="google-g">G</span>{google?'Continue with Google':'Google sign-in needs credentials'}</button></>}</div><small><LockKeyhole/>Google is used only to establish the permanent relationship. Your email is never shared.</small>{message&&<p className="save-message">{message}</p>}</section></main>;
}
