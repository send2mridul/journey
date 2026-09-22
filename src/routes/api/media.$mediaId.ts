import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { readPrivateMedia } from '@/lib/media-storage';
import { canReadMedia } from '@/server/trail-access';

export const Route = createFileRoute('/api/media/$mediaId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = z.string().uuid().safeParse(params.mediaId);
        if (!parsed.success) return new Response('Not found', { status: 404 });
        const media = await canReadMedia(parsed.data);
        if (!media) return new Response('Not found', { status: 404 });
        const blob = await readPrivateMedia(media.storageKey);
        if (!blob) return new Response('Not found', { status: 404 });
        const headers = new Headers(blob.headers);
        headers.set('Content-Type', media.mimeType);
        headers.set('Cache-Control', 'private, no-store');
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(blob.stream, { headers });
      },
    },
  },
});
