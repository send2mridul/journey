import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Shield } from 'lucide-react';
import { saveSocialProfile } from '@/server/social';

export type SocialProfileValues = {
  displayName: string | null;
  handle: string;
  discoverability: 'DISCOVERABLE' | 'LIMITED' | 'HIDDEN';
  friendListVisibility: 'ONLY_ME' | 'FRIENDS';
};

export function SocialProfileForm({ initial, onSaved }: { initial?: SocialProfileValues | null; onSaved: () => void }) {
  const save = useServerFn(saveSocialProfile);
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [discoverability, setDiscoverability] = useState<SocialProfileValues['discoverability']>(initial?.discoverability ?? 'LIMITED');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const choices = [
    ['LIMITED', 'Exact username', 'Friends can find you only when they enter your complete @username.'],
    ['DISCOVERABLE', 'Discoverable', 'Your username may appear in direct username search.'],
    ['HIDDEN', 'Hidden', 'Only existing friends can reach your profile.'],
  ] as const;

  async function submit() {
    setSaving(true);
    setMessage('');
    try {
      const result = await save({ data: { handle, displayName, discoverability, friendListVisibility: 'ONLY_ME' } });
      setHandle(result.profile.handle);
      setMessage(initial ? 'Profile updated.' : `@${result.profile.handle} is ready.`);
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="handle-setup-card">
    <p className="eyebrow">{initial ? 'Life Atlas profile' : 'One last detail'}</p>
    <h1>{initial ? 'Your @username.' : 'Choose your @username.'}</h1>
    <p>Friends use this username to find you. It is never a login credential, and your Google email stays private.</p>
    <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" maxLength={80}/></label>
    <label>Life Atlas username<div className="handle-input"><span>@</span><input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="yourname" maxLength={24} autoCapitalize="none" autoCorrect="off"/></div></label>
    <fieldset>
      <legend>Who can find me?</legend>
      {choices.map(([value, title, copy]) => <button key={value} type="button" className={discoverability === value ? 'active' : ''} onClick={() => setDiscoverability(value)}>
        <i />
        <span><strong>{title}</strong><small>{copy}</small></span>
        {discoverability === value && <Shield />}
      </button>)}
    </fieldset>
    <button className="primary-button" disabled={saving || !handle.trim() || !displayName.trim()} onClick={() => void submit()}>{saving ? 'Saving…' : initial ? 'Save profile' : 'Create my @username'}</button>
    {message && <p className="save-message" role="status">{message}</p>}
  </div>;
}
