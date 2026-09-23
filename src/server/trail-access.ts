import { getRequestHeaders } from '@tanstack/react-start/server';

export async function ownedTrailIdForChapter(chapterId: string) {
  const { auth, authConfigured } = await import('@/lib/auth');
  const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
  const { getAnonymousOwnerHash } = await import('@/server/anonymous-owner');
  const anonymousOwnerHash = getAnonymousOwnerHash();
  const { databaseConfigured, sql } = await import('@/db');
  if (!databaseConfigured) return null;
  const userId = session?.user?.id ?? null;
  const [row] = await sql<{ trailId: string }[]>`
    SELECT trail.id::text AS "trailId"
    FROM life_chapters chapter
    JOIN life_trails trail ON trail.id = chapter.trail_id
    LEFT JOIN profiles profile ON profile.id = trail.profile_id
    WHERE chapter.id = ${chapterId}::uuid
      AND (
        (${userId}::text IS NOT NULL AND profile.user_id = ${userId})
        OR (${anonymousOwnerHash}::text IS NOT NULL AND trail.anonymous_owner_hash = ${anonymousOwnerHash})
      )
    LIMIT 1
  `;
  return row?.trailId ?? null;
}

export async function accountTrailIdForChapter(chapterId: string) {
  const { auth, authConfigured } = await import('@/lib/auth');
  const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
  if (!session?.user) return null;
  const { databaseConfigured, sql } = await import('@/db');
  if (!databaseConfigured) return null;
  const [row] = await sql<{ trailId: string }[]>`
    SELECT trail.id::text AS "trailId"
    FROM life_chapters chapter
    JOIN life_trails trail ON trail.id = chapter.trail_id
    JOIN profiles profile ON profile.id = trail.profile_id
    WHERE chapter.id = ${chapterId}::uuid AND profile.user_id = ${session.user.id}
    LIMIT 1
  `;
  return row?.trailId ?? null;
}

export async function canReadMedia(mediaId: string) {
  const { auth, authConfigured } = await import('@/lib/auth');
  const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
  const { getAnonymousOwnerHash } = await import('@/server/anonymous-owner');
  const anonymousOwnerHash = getAnonymousOwnerHash();
  const { databaseConfigured, sql } = await import('@/db');
  if (!databaseConfigured) return null;
  const userId = session?.user?.id ?? null;
  const [row] = await sql<{ storageKey: string; mimeType: string; shared: boolean }[]>`
    SELECT media.storage_key AS "storageKey", media.mime_type AS "mimeType", false AS shared
    FROM chapter_media media
    JOIN life_chapters chapter ON chapter.id = media.life_chapter_id
    JOIN life_trails trail ON trail.id = chapter.trail_id
    LEFT JOIN profiles profile ON profile.id = trail.profile_id
    WHERE media.id = ${mediaId}::uuid
      AND (
        (${userId}::text IS NOT NULL AND profile.user_id = ${userId})
        OR (${anonymousOwnerHash}::text IS NOT NULL AND trail.anonymous_owner_hash = ${anonymousOwnerHash})
      )
    LIMIT 1
  `;
  return row ?? null;
}
