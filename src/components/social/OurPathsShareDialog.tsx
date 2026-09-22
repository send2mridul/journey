import * as Dialog from '@radix-ui/react-dialog';
import { Download, Share2, X } from 'lucide-react';
import { useState } from 'react';
import { dataUrlToFile } from '@/lib/share-card';

export function OurPathsShareDialog({ open, onOpenChange, preview }: { open: boolean; onOpenChange: (open: boolean) => void; preview: string }) {
  const [status, setStatus] = useState('');
  function download() {
    if (!preview) return;
    const link = document.createElement('a'); link.href = preview; link.download = 'life-atlas-our-paths.png'; link.click();
    setStatus('Our Paths card downloaded.');
  }
  async function share() {
    if (!preview) return;
    try {
      const file = await dataUrlToFile(preview, 'life-atlas-our-paths.png');
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'Our Paths · Life Atlas', text: 'Two geographic biographies, seen together.', files: [file] });
        setStatus('Our Paths card ready to share.'); return;
      }
      download();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('Sharing is unavailable here. You can still download the card.');
    }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="share-preview-overlay" />
    <Dialog.Content className="share-preview-dialog" aria-describedby="our-paths-share-description">
      <div className="share-preview-heading"><div><p className="eyebrow">Our Paths card</p><Dialog.Title>Share two lives, with permission.</Dialog.Title><Dialog.Description id="our-paths-share-description">A single editorial artifact made only after both people allow external sharing.</Dialog.Description></div><Dialog.Close aria-label="Close share preview"><X /></Dialog.Close></div>
      <div className="share-preview-frame is-og">{preview ? <img src={preview} alt="Our Paths Life Atlas card preview" /> : <div className="share-preview-loading">Preparing the permitted geography…</div>}</div>
      <div className="share-preview-actions"><button className="primary-button compact" disabled={!preview} onClick={() => void share()}><Share2/>Share</button><button className="outline-button" disabled={!preview} onClick={download}><Download/>Download</button></div>
      <p className="share-safety-note">No photographs, private memories, email addresses, or exact addresses are included.</p>
      {status && <p className="save-message" role="status">{status}</p>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
