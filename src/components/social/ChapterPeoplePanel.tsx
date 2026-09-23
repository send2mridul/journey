import { useMemo, useState } from 'react';
import { Check, Search, UserPlus, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ProfileMark } from './SocialVisuals';

export type ChapterPerson = { id: string; name: string; handle: string | null; status: string; placeholder: boolean };

export function ChapterPeoplePanel({ city, people, friends, onAddFriend }: { city: string; people: ChapterPerson[]; friends: Array<{ displayName: string; handle: string }>; onAddFriend: (handle: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  const normalized = value.replace(/^@+/, '').trim().toLowerCase();
  const matches = useMemo(() => normalized ? friends.filter((friend) => friend.handle.toLowerCase() === normalized) : friends, [friends, normalized]);
  async function add(handle: string) {
    try { await onAddFriend(handle); setValue(''); setOpen(false); setMessage(`@${handle} can confirm this chapter association from Requests.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'This person could not be added.'); }
  }
  return <section className="chapter-people-panel"><div className="chapter-people-heading"><div><p>Friends in this chapter</p><span>Only accepted friends appear here. They must confirm before the association is shown.</span></div><button className="text-button" onClick={() => setOpen((current)=>!current)}>{open ? <><X/>Close</> : <><UserPlus/>Add a friend</>}</button></div>
    {people.length > 0 && <div className="chapter-people-list">{people.map((person)=><div key={person.id}><ProfileMark handle={person.handle ?? person.name} size={44}/><div><strong>{person.name}</strong><small>@{person.handle} · {person.status.toLowerCase()}</small></div>{person.status === 'CONFIRMED' && <Check/>}</div>)}</div>}
    {open && <div className="chapter-person-add"><label><Search/>Exact @username<input value={value} onChange={(event)=>setValue(event.target.value)} placeholder="@friend" autoCapitalize="none" autoCorrect="off"/></label>{friends.length ? <div className="chapter-friend-options">{matches.length ? matches.map((friend)=><button key={friend.handle} onClick={()=>void add(friend.handle)}><ProfileMark handle={friend.handle} size={38}/><span><strong>{friend.displayName}</strong><small>@{friend.handle}</small></span><UserPlus/></button>) : <p>No accepted friend matches that exact @username.</p>}</div> : <div className="chapter-people-empty"><p>You do not have any accepted friends yet.</p><Link to="/circle">Find Friends</Link></div>}</div>}
    {message && <p className="chapter-people-message" role="status">{message}</p>}
  </section>;
}
