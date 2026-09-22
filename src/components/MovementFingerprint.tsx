import { useId } from 'react';
import { type TrailStop } from '@/lib/atlas-data';
import { fingerprintArcPath, fingerprintArcs, fingerprintPoint } from '@/lib/fingerprint';

export function MovementFingerprint({ trail, className = '', label = 'Movement Fingerprint' }: { trail: TrailStop[]; className?: string; label?: string }) {
  const id = useId().replaceAll(':', '');
  const arcs = fingerprintArcs(trail);

  return <svg className={`movement-fingerprint ${className}`} viewBox="0 0 240 240" role="img" aria-label={`${label}: ${trail.map((stop) => stop.city).join(' to ')}`}>
    <defs>
      <radialGradient id={`paper-${id}`}><stop offset="0" stopColor="#fffaf0" stopOpacity=".96" /><stop offset="1" stopColor="#f2e4cf" stopOpacity=".72" /></radialGradient>
      <filter id={`soft-${id}`}><feGaussianBlur stdDeviation="1.8" /></filter>
    </defs>
    <circle cx="120" cy="120" r="112" fill={`url(#paper-${id})`} stroke="currentColor" strokeOpacity=".12" />
    <circle cx="120" cy="120" r="18" fill="none" stroke="currentColor" strokeOpacity=".25" strokeDasharray="2 5" />
    {arcs.map((arc) => <g key={arc.index}>
      <path d={fingerprintArcPath(120, 120, arc.radius, arc.start, arc.length)} fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth={9} strokeLinecap="round" filter={`url(#soft-${id})`} />
      <path d={fingerprintArcPath(120, 120, arc.radius, arc.start, arc.length)} fill="none" stroke="currentColor" strokeOpacity={arc.opacity} strokeWidth={arc.weight} strokeLinecap="round" />
      {(() => { const node = fingerprintPoint(120, 120, arc.radius, arc.start + arc.length); return <circle cx={node.x} cy={node.y} r={3.3} fill="currentColor" stroke="#fff8e8" strokeWidth="1.5" />; })()}
    </g>)}
    <circle cx="120" cy="120" r="5" fill="currentColor" />
    <circle cx="120" cy="120" r="9" fill="none" stroke="currentColor" strokeOpacity=".3" />
    <text x="120" y="226" textAnchor="middle" fill="currentColor" opacity=".58" fontSize="7" letterSpacing="2.2">LIFE ATLAS · {String(trail.length).padStart(2, '0')}</text>
  </svg>;
}
