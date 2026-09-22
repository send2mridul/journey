import { useState } from 'react';
import { Check, Copy, Link2, Search, Send, UserPlus, X } from 'lucide-react';
import { ProfileMark } from './SocialVisuals';

export type ChapterPerson = { id: string; name: string; handle: string | null; status: string; placeholder: boolean };

export function ChapterPeoplePanel({ city, people, onAddHandle, onAddPlaceholder, onInvite }: { city: string; people: ChapterPerson[]; onAddHandle: (handle: string) => Promise<void>; onAddPlaceholder: (name: string) => Promise<void>; onInvite: (person: ChapterPerson) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'HANDLE' | 'PLACEHOLDER'>('HANDLE');
  const [value, setValue] = useState('');
  const [message, setMessage] = useState('');
  async function add() {
    if (!value.trim()) return;
    try { if (mode === 'HANDLE') await onAddHandle(value); else await onAddPlaceholder(value); setValue(''); setOpen(false); setMessage(mode === 'HANDLE' ? 'Association request sent privately.' : 'Private placeholder added.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'This person could not be added.'); }
  }
  async function invite(person: ChapterPerson) {
    try { const url=await onInvite(person); if (navigator.share) await navigator.share({ title: 'A chapter of my Life Atlas', text: `I added you to a chapter of my Life Atlas in ${city}.`, url }); else { await navigator.clipboard.writeText(url); setMessage('Invitation link copied.'); } }
    catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; setMessage(error instanceof Error ? error.message : 'Invitation unavailable.'); }
  }
  return <section className="chapter-people-panel"><div className="chapter-people-heading"><div><p>People in this chapter</p><span>Associations stay private until the other person confirms.</span></div><button className="text-button" onClick={() => setOpen((value)=>!value)}>{open ? <><X/>Close</> : <><UserPlus/>Add someone</>}</button></div>
    {people.length > 0 && <div className="chapter-people-list">{people.map((person)=><div key={person.id}>{person.handle ? <ProfileMark handle={person.handle} size={44}/> : <span className="placeholder-mark">{person.name.charAt(0).toUpperCase()}</span>}<div><strong>{person.name}</strong><small>{person.handle ? `@${person.handle}` : 'Private placeholder'} · {person.status.toLowerCase()}</small></div>{person.placeholder && <button aria-label={`Invite ${person.name}`} onClick={() => void invite(person)}><Send/></button>}{person.status === 'CONFIRMED' && <Check/>}</div>)}</div>}
    {open && <div className="chapter-person-add"><div className="chapter-person-modes"><button className={mode==='HANDLE'?'active':''} onClick={()=>setMode('HANDLE')}><Search/>Life Atlas person</button><button className={mode==='PLACEHOLDER'?'active':''} onClick={()=>setMode('PLACEHOLDER')}><Link2/>Private placeholder</button></div><label>{mode==='HANDLE'?'Search exact handle':'Their name, visible only to you'}<input value={value} onChange={(event)=>setValue(event.target.value)} placeholder={mode==='HANDLE'?'@priya':'Priya'}/></label><button className="primary-button compact" onClick={() => void add()}>{mode==='HANDLE'?'Request association':'Add privately'}</button></div>}
    {message && <p className="chapter-people-message" role="status">{message}{message.includes('copied')&&<Copy/>}</p>}
  </section>;
}
