import { createFileRoute } from '@tanstack/react-router';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { z } from 'zod';
import { accountTrailIdForChapter } from '@/server/trail-access';

const payloadSchema = z.object({ chapterId: z.string().uuid(), width: z.number().int().positive().max(12000).nullable(), height: z.number().int().positive().max(12000).nullable() });
const uploadTokenSchema = payloadSchema.extend({ trailId: z.string().uuid() });
const maxUploadBytes = 10 * 1024 * 1024;
const maxTrailBytes = 250 * 1024 * 1024;

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const responseHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
        if (!process.env['BLOB_READ_WRITE_TOKEN']) return Response.json({ message: 'Photo uploads are not configured yet.' }, { status: 503, headers: responseHeaders });
        try {
          const body = await request.json() as HandleUploadBody;
          const result = await handleUpload({
            request,
            body,
            onBeforeGenerateToken: async (pathname, clientPayload) => {
              const payload = payloadSchema.parse(JSON.parse(clientPayload ?? '{}'));
              const trailId = await accountTrailIdForChapter(payload.chapterId);
              if (!trailId) throw new Error('Sign in with Google to add photographs to a Life Chapter you own.');
              if (!pathname.startsWith(`life-atlas/${payload.chapterId}/`) || !pathname.endsWith('.webp')) throw new Error('Invalid photograph path.');
              const { sql } = await import('@/db');
              const [usage] = await sql<{ chapterCount: number; totalCount: number; recentCount: number; totalBytes: number }[]>`
                SELECT
                  count(media.id) FILTER (WHERE media.life_chapter_id = ${payload.chapterId}::uuid)::int AS "chapterCount",
                  count(media.id)::int AS "totalCount",
                  count(media.id) FILTER (WHERE media.created_at > now() - interval '1 hour')::int AS "recentCount",
                  COALESCE(sum(media.byte_size), 0)::int AS "totalBytes"
                FROM life_chapters chapter
                LEFT JOIN chapter_media media ON media.life_chapter_id = chapter.id
                WHERE chapter.trail_id = ${trailId}::uuid
              `;
              if ((usage?.chapterCount ?? 0) >= 5) throw new Error('A Life Chapter can have up to five photos.');
              if ((usage?.totalCount ?? 0) >= 100 || (usage?.totalBytes ?? 0) >= maxTrailBytes) throw new Error('This Life Atlas has reached its private photograph storage quota.');
              if ((usage?.recentCount ?? 0) >= 20) throw new Error('Photo upload limit reached. Try again in an hour.');
              return {
                allowedContentTypes: ['image/webp'],
                maximumSizeInBytes: maxUploadBytes,
                validUntil: Date.now() + 5 * 60 * 1000,
                addRandomSuffix: true,
                allowOverwrite: false,
                tokenPayload: JSON.stringify({ ...payload, trailId }),
              };
            },
            onUploadCompleted: async ({ blob, tokenPayload }) => {
              const payload = uploadTokenSchema.parse(JSON.parse(tokenPayload ?? '{}'));
              const inspection = await inspectUploadedWebp(blob.pathname);
              if (!inspection.valid || inspection.size > maxUploadBytes || inspection.contentType !== 'image/webp') {
                await deleteUploadedBlob(blob.pathname);
                throw new Error('The uploaded file was not a valid private WebP photograph.');
              }
              const { sql } = await import('@/db');
              const inserted = await sql.begin(async (transaction) => {
                // Serialize quota decisions for this trail so simultaneous upload
                // callbacks cannot all observe the same remaining capacity.
                await transaction`SELECT pg_advisory_xact_lock(hashtext(${payload.trailId}))`;
                const [row] = await transaction<{ id: string }[]>`
                  INSERT INTO chapter_media (life_chapter_id, storage_key, mime_type, byte_size, width, height, display_order, privacy_override)
                  SELECT chapter.id, ${blob.pathname}, 'image/webp', ${inspection.size}, ${payload.width}, ${payload.height}, COALESCE(max(media.display_order) + 1, 0), 'PRIVATE'
                  FROM life_chapters chapter
                  LEFT JOIN chapter_media media ON media.life_chapter_id = chapter.id
                  WHERE chapter.id = ${payload.chapterId}::uuid AND chapter.trail_id = ${payload.trailId}::uuid
                  GROUP BY chapter.id
                  HAVING count(media.id) < 5
                    AND (SELECT count(*) FROM chapter_media all_media JOIN life_chapters all_chapters ON all_chapters.id = all_media.life_chapter_id WHERE all_chapters.trail_id = ${payload.trailId}::uuid) < 100
                    AND (SELECT COALESCE(sum(all_media.byte_size), 0) FROM chapter_media all_media JOIN life_chapters all_chapters ON all_chapters.id = all_media.life_chapter_id WHERE all_chapters.trail_id = ${payload.trailId}::uuid) + ${inspection.size} <= ${maxTrailBytes}
                    AND (SELECT count(*) FROM chapter_media recent_media JOIN life_chapters recent_chapters ON recent_chapters.id = recent_media.life_chapter_id WHERE recent_chapters.trail_id = ${payload.trailId}::uuid AND recent_media.created_at > now() - interval '1 hour') < 20
                  ON CONFLICT (storage_key) DO NOTHING
                  RETURNING id::text AS id
                `;
                return row;
              });
              if (!inserted) {
                const [existing] = await sql<{ id: string }[]>`SELECT id::text AS id FROM chapter_media WHERE storage_key = ${blob.pathname} LIMIT 1`;
                if (!existing) {
                  await deleteUploadedBlob(blob.pathname);
                  throw new Error('This Life Atlas has reached its photograph limit.');
                }
              }
            },
          });
          return Response.json(result, { headers: responseHeaders });
        } catch (error) {
          return Response.json({ message: error instanceof Error ? error.message : 'Upload could not be authorized.' }, { status: 400, headers: responseHeaders });
        }
      },
    },
  },
});

async function inspectUploadedWebp(pathname: string) {
  const { get } = await import('@vercel/blob');
  const result = await get(pathname, { access: 'private', useCache: false });
  if (!result || result.statusCode !== 200) return { valid: false, size: 0, contentType: '' };
  const reader = result.stream.getReader();
  let signature = new Uint8Array(0);
  try {
    while (signature.length < 12) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const next = new Uint8Array(signature.length + value.length);
      next.set(signature);
      next.set(value, signature.length);
      signature = next;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const text = (start: number, end: number) => String.fromCharCode(...signature.slice(start, end));
  return {
    valid: signature.length >= 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP',
    size: result.blob.size,
    contentType: result.blob.contentType,
  };
}

async function deleteUploadedBlob(pathname: string) {
  const { del } = await import('@vercel/blob');
  await del(pathname).catch(() => undefined);
}
