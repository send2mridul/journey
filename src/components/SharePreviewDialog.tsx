import * as Dialog from '@radix-ui/react-dialog';
import { Copy, Download, ImageOff, Share2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TrailStop } from '@/lib/atlas-data';
import type { ShareCardFormat } from '@/lib/share-card';

const formatOptions: Array<{ value: ShareCardFormat; label: string; dimensions: string }> = [
  { value: 'square', label: 'Post', dimensions: '1080 × 1080' },
  { value: 'story', label: 'Story', dimensions: '1080 × 1920' },
  { value: 'og', label: 'Link preview', dimensions: '1200 × 630' },
];

export function SharePreviewDialog({ open, onOpenChange, trail, shareUrl }: { open: boolean; onOpenChange: (open: boolean) => void; trail: TrailStop[]; shareUrl: string }) {
  const [format, setFormat] = useState<ShareCardFormat>('square');
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!open) return;
    let current = true;
    setPreview('');
    setStatus('');
    void import('@/lib/share-card')
      .then(({ renderAtlasCard }) => renderAtlasCard(trail, format))
      .then((dataUrl) => { if (current) setPreview(dataUrl); })
      .catch(() => { if (current) setStatus('This preview could not be prepared.'); });
    return () => { current = false; };
  }, [format, open, trail]);

  async function download() {
    if (!preview) return;
    const { atlasCardFilename } = await import('@/lib/share-card');
    const link = document.createElement('a');
    link.href = preview;
    link.download = atlasCardFilename(format);
    link.click();
    setStatus('Atlas Card downloaded.');
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setStatus('Private share link copied.');
  }

  async function share() {
    if (!preview) return;
    try {
      const { atlasCardFilename, dataUrlToFile } = await import('@/lib/share-card');
      const file = await dataUrlToFile(preview, atlasCardFilename(format));
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'My Life Atlas', text: 'A geographic biography of the places that became chapters of my life.', ...(shareUrl ? { url: shareUrl } : {}), files: [file] });
        setStatus('Atlas Card ready to share.');
        return;
      }
      if (shareUrl) {
        await copyLink();
        return;
      }
      await download();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('Sharing was unavailable. You can still download the Atlas Card.');
    }
  }

  const selected = formatOptions.find((option) => option.value === format)!;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="share-preview-overlay" />
      <Dialog.Content className="share-preview-dialog" aria-describedby="share-preview-description">
        <div className="share-preview-heading">
          <div><p className="eyebrow">Atlas Card</p><Dialog.Title>Share your Life Atlas</Dialog.Title><Dialog.Description id="share-preview-description">A collectible view of the places that became chapters of your life.</Dialog.Description></div>
          <Dialog.Close aria-label="Close share preview"><X /></Dialog.Close>
        </div>
        <div className="share-concept-tabs" aria-label="Share artifact type">
          <button className="active">Atlas Card <small>Complete journey</small></button>
          <button disabled title="Memory Cards become available when private chapter photography is connected.">Memory Card <small><ImageOff /> Photos required</small></button>
        </div>
        <div className="share-format-tabs" aria-label="Atlas Card format">
          {formatOptions.map((option) => <button key={option.value} className={format === option.value ? 'active' : ''} onClick={() => setFormat(option.value)}><span>{option.label}</span><small>{option.dimensions}</small></button>)}
        </div>
        <div className={`share-preview-frame is-${format}`}>
          {preview ? <img src={preview} alt={`${selected.label} Atlas Card preview showing ${trail.map((stop) => stop.city).join(' to ')}`} /> : <div className="share-preview-loading">Preparing your Atlas Card…</div>}
        </div>
        <div className="share-preview-actions">
          <button className="primary-button compact" disabled={!preview} onClick={() => void share()}><Share2 />Share</button>
          <button className="outline-button" disabled={!preview} onClick={() => void download()}><Download />Download</button>
          <button className="outline-button" disabled={!shareUrl} title={!shareUrl ? 'Choose Unlisted to create a share link.' : undefined} onClick={() => void copyLink()}><Copy />Copy link</button>
        </div>
        <p className="share-safety-note">Cards include cities and aggregate journey insights only. Memories and photos stay out of the Atlas Card.</p>
        {status && <p className="save-message" role="status">{status}</p>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
