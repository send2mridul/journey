import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { ArrowLeft, LockKeyhole, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SocialProfileForm, type SocialProfileValues } from '@/components/social/SocialProfileForm';
import { authClient } from '@/lib/auth-client';
import { getAuthCapabilities } from '@/server/auth-capabilities';
import { getSocialSession } from '@/server/social';

export const Route = createFileRoute('/profile')({ component: ProfileRoute });

function ProfileRoute() {
  const loadSession = useServerFn(getSocialSession);
  const loadCapabilities = useServerFn(getAuthCapabilities);
  const [state, setState] = useState<{ authenticated: boolean; profile: SocialProfileValues | null } | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    const result = await loadSession();
    setState({ authenticated: result.authenticated, profile: result.profile });
  }, [loadSession]);

  useEffect(() => {
    void refresh();
    void loadCapabilities().then((value) => setGoogleAvailable(value.google)).catch(() => setGoogleAvailable(false));
  }, [loadCapabilities, refresh]);

  async function signIn() {
    if (!googleAvailable) return;
    await authClient.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/profile` });
  }

  if (!state) return <div className="social-loading">Opening your profile…</div>;
  if (!state.authenticated) return <main className="social-gate"><Link to="/" className="circle-brand">Life Atlas</Link><div className="social-gate-visual"><i/><i/><Sparkles/><span/></div><p className="eyebrow">Your profile</p><h1>Sign in to create or edit your Life Atlas username.</h1><p>Your Google email remains private. Friends use your exact @username to find you.</p><button className="primary-button" disabled={googleAvailable !== true} onClick={() => void signIn()}><span className="google-g">G</span>Continue with Google</button><small><LockKeyhole/>One permanent profile across your devices.</small><Link to="/"><ArrowLeft/>Return to my Atlas</Link></main>;

  return <main className="handle-setup profile-page">
    <header className="profile-page-header"><Link to="/" className="circle-brand">Life Atlas</Link><nav><Link to="/">My Atlas</Link><Link to="/circle">Life Circle</Link></nav></header>
    <SocialProfileForm initial={state.profile} onSaved={() => void refresh()}/>
  </main>;
}
