import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { AtlasRoute, Place, StoryVisibility, TrailStop } from '@/lib/atlas-data';

const privacyThreshold = 5;
const placeId = z.string().regex(/^\d+$/);
const reason = z.enum(['Career', 'Study', 'Family', 'Love', 'Adventure', 'Opportunity', 'A new start', 'Other']);
const storyVisibility = z.enum(['PRIVATE', 'UNLISTED', 'PUBLIC']);

const searchInput = z.object({ query: z.string().trim().min(2).max(80) });

export const searchPlaces = createServerFn({ method: 'GET' })
  .validator((value: unknown) => searchInput.parse(value))
  .handler(async ({ data }) => {
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) return { configured: false, places: [] as Place[] };
    const rows = await sql<Place[]>`
      SELECT
        city.id::text AS id,
        city.name AS city,
        state.name AS region,
        country.name AS country,
        country.code AS "countryCode",
        city.latitude,
        city.longitude
      FROM cities city
      JOIN countries country ON country.code = city.country_code
      LEFT JOIN states state ON state.id = city.state_id
      WHERE city.population > 0
        AND (
          lower(city.name) LIKE lower(${data.query}) || '%'
          OR (
            lower(city.name) % lower(${data.query})
            AND similarity(lower(city.name), lower(${data.query})) >= 0.34
          )
        )
      ORDER BY
        (lower(city.name) = lower(${data.query})) DESC,
        (lower(city.name) LIKE lower(${data.query}) || '%') DESC,
        similarity(lower(city.name), lower(${data.query})) DESC,
        city.population DESC,
        country.name,
        state.name NULLS LAST
      LIMIT 8
    `;
    return { configured: true, places: rows };
  });

const routeStatsInput = z.object({ fromCityId: placeId, toCityId: placeId });

export const getRouteStats = createServerFn({ method: 'GET' })
  .validator((value: unknown) => routeStatsInput.parse(value))
  .handler(async ({ data }) => {
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) return { configured: false, sharedCount: null as number | null };
    const [row] = await sql<{ count: number }[]>`
      SELECT count(DISTINCT trail_id)::int AS count
      FROM movement_chapters
      WHERE from_city_id = ${data.fromCityId}::integer
        AND to_city_id = ${data.toCityId}::integer
        AND visibility IN ('PUBLIC', 'ANONYMOUS')
    `;
    const count = row?.count ?? 0;
    return { configured: true, sharedCount: count >= privacyThreshold ? count : null };
  });

const exploreInput = z.object({
  fromCityId: placeId.nullable().optional(),
  toCityId: placeId.nullable().optional(),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
  reason: reason.nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
});

export const getExploreRoutes = createServerFn({ method: 'GET' })
  .validator((value: unknown) => exploreInput.parse(value))
  .handler(async ({ data }) => {
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) return { configured: false, routes: [] as AtlasRoute[] };
    const fromCityId = data.fromCityId ?? null;
    const toCityId = data.toCityId ?? null;
    const selectedReason = data.reason ?? null;
    const selectedCountry = data.countryCode?.toUpperCase() ?? null;
    const yearFrom = data.yearFrom ?? 1900;
    const yearTo = data.yearTo ?? 2100;
    const rows = await sql<Array<{
      fromId: string; fromCity: string; fromRegion: string | null; fromCountry: string; fromCountryCode: string; fromLatitude: number; fromLongitude: number;
      toId: string; toCity: string; toRegion: string | null; toCountry: string; toCountryCode: string; toLatitude: number; toLongitude: number;
      year: number; reason: string; volume: number;
    }>>`
      SELECT
        origin.id::text AS "fromId", origin.name AS "fromCity", origin_state.name AS "fromRegion",
        origin_country.name AS "fromCountry", origin_country.code AS "fromCountryCode",
        origin.latitude AS "fromLatitude", origin.longitude AS "fromLongitude",
        destination.id::text AS "toId", destination.name AS "toCity", destination_state.name AS "toRegion",
        destination_country.name AS "toCountry", destination_country.code AS "toCountryCode",
        destination.latitude AS "toLatitude", destination.longitude AS "toLongitude",
        chapter.move_year AS year, chapter.reason, count(DISTINCT chapter.trail_id)::int AS volume
      FROM movement_chapters chapter
      JOIN cities origin ON origin.id = chapter.from_city_id
      JOIN countries origin_country ON origin_country.code = origin.country_code
      LEFT JOIN states origin_state ON origin_state.id = origin.state_id
      JOIN cities destination ON destination.id = chapter.to_city_id
      JOIN countries destination_country ON destination_country.code = destination.country_code
      LEFT JOIN states destination_state ON destination_state.id = destination.state_id
      WHERE chapter.visibility IN ('PUBLIC', 'ANONYMOUS')
        AND (${fromCityId}::integer IS NULL OR chapter.from_city_id = ${fromCityId}::integer)
        AND (${toCityId}::integer IS NULL OR chapter.to_city_id = ${toCityId}::integer)
        AND chapter.move_year BETWEEN ${yearFrom} AND ${yearTo}
        AND (${selectedReason}::text IS NULL OR chapter.reason = ${selectedReason})
        AND (${selectedCountry}::text IS NULL OR origin.country_code = ${selectedCountry} OR destination.country_code = ${selectedCountry})
      GROUP BY
        origin.id, origin.name, origin_state.name, origin_country.name, origin_country.code, origin.latitude, origin.longitude,
        destination.id, destination.name, destination_state.name, destination_country.name, destination_country.code, destination.latitude, destination.longitude,
        chapter.move_year, chapter.reason
      HAVING count(DISTINCT chapter.trail_id) >= ${privacyThreshold}
      ORDER BY volume DESC
      LIMIT 150
    `;
    const routes: AtlasRoute[] = rows.map((row) => ({
      from: { id: row.fromId, city: row.fromCity, region: row.fromRegion, country: row.fromCountry, countryCode: row.fromCountryCode, latitude: row.fromLatitude, longitude: row.fromLongitude },
      to: { id: row.toId, city: row.toCity, region: row.toRegion, country: row.toCountry, countryCode: row.toCountryCode, latitude: row.toLatitude, longitude: row.toLongitude },
      year: row.year,
      reason: row.reason,
      volume: row.volume,
    }));
    return { configured: true, routes };
  });

export const getWorldPatternMeta = createServerFn({ method: 'GET' }).handler(async () => {
  const { databaseConfigured, sql } = await import('@/db');
  if (!databaseConfigured) return { available: false as const, source: null, years: [] as number[], countries: [] as Array<{ code: string; name: string }> };
  const [source] = await sql<Array<{ provider: string; datasetName: string; version: string; sourceUrl: string }>>`
    SELECT provider, dataset_name AS "datasetName", version, source_url AS "sourceUrl"
    FROM migration_data_sources WHERE id = 'undesa-ims-2024-destination-origin'
  `;
  if (!source) return { available: false as const, source: null, years: [] as number[], countries: [] as Array<{ code: string; name: string }> };
  const yearRows = await sql<{ year: number }[]>`SELECT DISTINCT year FROM migrant_stock WHERE source_id = 'undesa-ims-2024-destination-origin' ORDER BY year`;
  const countryRows = await sql<{ code: string; name: string }[]>`
    SELECT country.code, country.name FROM countries country
    WHERE EXISTS (SELECT 1 FROM migrant_stock stock WHERE stock.origin_country_code = country.code OR stock.destination_country_code = country.code)
    ORDER BY country.name
  `;
  return { available: true as const, source, years: yearRows.map((row) => row.year), countries: countryRows };
});

const worldPatternInput = z.object({
  countryCode: z.string().length(2).nullable().optional(),
  perspective: z.enum(['from', 'to']).default('from'),
  year: z.number().int().min(1990).max(2100),
});

export const getWorldPatterns = createServerFn({ method: 'GET' })
  .validator((value: unknown) => worldPatternInput.parse(value))
  .handler(async ({ data }) => {
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) return { available: false, routes: [] as AtlasRoute[] };
    const countryCode = data.countryCode?.toUpperCase() ?? null;
    const rows = await sql<Array<{
      originCode: string; originName: string; originLatitude: number; originLongitude: number;
      destinationCode: string; destinationName: string; destinationLatitude: number; destinationLongitude: number;
      stock: number;
    }>>`
      SELECT
        origin.code AS "originCode", origin.name AS "originName", origin_anchor.latitude AS "originLatitude", origin_anchor.longitude AS "originLongitude",
        destination.code AS "destinationCode", destination.name AS "destinationName", destination_anchor.latitude AS "destinationLatitude", destination_anchor.longitude AS "destinationLongitude",
        stock.stock::bigint::float8 AS stock
      FROM migrant_stock stock
      JOIN countries origin ON origin.code = stock.origin_country_code
      JOIN countries destination ON destination.code = stock.destination_country_code
      JOIN country_map_anchors origin_anchor ON origin_anchor.country_code = origin.code
      JOIN country_map_anchors destination_anchor ON destination_anchor.country_code = destination.code
      WHERE stock.source_id = 'undesa-ims-2024-destination-origin'
        AND stock.year = ${data.year}
        AND (
          ${countryCode}::text IS NULL
          OR (${data.perspective} = 'from' AND stock.origin_country_code = ${countryCode})
          OR (${data.perspective} = 'to' AND stock.destination_country_code = ${countryCode})
        )
      ORDER BY stock.stock DESC
      LIMIT ${countryCode ? 14 : 28}
    `;
    return { available: true, routes: rows.map((row) => ({
      from: { id: `country:${row.originCode}`, city: row.originName, region: null, country: row.originName, countryCode: row.originCode, latitude: row.originLatitude, longitude: row.originLongitude },
      to: { id: `country:${row.destinationCode}`, city: row.destinationName, region: null, country: row.destinationName, countryCode: row.destinationCode, latitude: row.destinationLatitude, longitude: row.destinationLongitude },
      year: data.year, reason: 'International migrant stock', volume: row.stock,
    })) };
  });

const stopInput = z.object({
  id: placeId,
  chapterId: z.string().uuid().optional(),
  arrivalYear: z.number().int().min(1900).max(2100).optional(),
  endYear: z.number().int().min(1900).max(2100).optional(),
  reason: reason.optional(),
  title: z.string().trim().max(120).optional(),
  memory: z.string().trim().max(5000).optional(),
  privacy: storyVisibility.optional(),
});

const saveTrailInput = z.object({
  clientDraftId: z.string().uuid(),
  title: z.string().trim().min(1).max(120).default('My Life Trail'),
  publicTitle: z.string().trim().max(120).optional(),
  visibility: storyVisibility.default('PRIVATE'),
  stops: z.array(stopInput).min(2).max(50),
}).superRefine((value, context) => {
  value.stops.slice(1).forEach((stop, index) => {
    if (!stop.arrivalYear) context.addIssue({ code: 'custom', path: ['stops', index + 1, 'arrivalYear'], message: 'Each movement chapter needs a year.' });
  });
});

type SaveTrailData = z.infer<typeof saveTrailInput>;
type SaveSession = { user: { id: string; name: string } } | null;

async function persistTrail(data: SaveTrailData, session: SaveSession) {
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) throw new Error('The Life Atlas database is not configured yet.');
    const { clearAnonymousOwnerCookie, getAnonymousOwnerHash } = await import('@/server/anonymous-owner');
    const anonymousOwnerHash = getAnonymousOwnerHash();
    if (!session?.user && !anonymousOwnerHash) throw new Error('Sign in with Google to save this Life Atlas. Your preview has not been stored.');
    if (data.visibility === 'PUBLIC' && !session?.user) throw new Error('Public Life Atlases require a permanent account. You can share this Atlas as Unlisted for now.');

    const saved = await sql.begin(async (transaction) => {
      const uniqueCityIds = [...new Set(data.stops.map((stop) => stop.id))];
      const existingCities = await transaction<{ id: string }[]>`
        SELECT id::text AS id FROM cities WHERE id = ANY(${uniqueCityIds}::integer[])
      `;
      if (existingCities.length !== uniqueCityIds.length) throw new Error('One or more selected cities no longer exist.');

      let trail: { id: string } | undefined;

      if (session?.user) {
        const [profile] = await transaction<{ id: string }[]>`
          INSERT INTO profiles (user_id, display_name)
          VALUES (${session.user.id}, ${session.user.name})
          ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
          RETURNING id::text AS id
        `;
        if (!profile) throw new Error('Could not create a profile for this account.');

        if (anonymousOwnerHash) {
          const [anonymousTrail] = await transaction<{ id: string; clientDraftId: string }[]>`
            SELECT id::text AS id, client_draft_id::text AS "clientDraftId"
            FROM life_trails
            WHERE anonymous_owner_hash = ${anonymousOwnerHash}
            FOR UPDATE
          `;
          if (anonymousTrail) {
            const [ownedTrail] = await transaction<{ id: string }[]>`
              SELECT id::text AS id
              FROM life_trails
              WHERE profile_id = ${profile.id}::uuid
                AND client_draft_id = ${anonymousTrail.clientDraftId}::uuid
              FOR UPDATE
            `;
            if (ownedTrail && ownedTrail.id !== anonymousTrail.id) {
              await transaction`DELETE FROM life_chapters WHERE trail_id = ${ownedTrail.id}::uuid`;
              await transaction`DELETE FROM movement_chapters WHERE trail_id = ${ownedTrail.id}::uuid`;
              await transaction`UPDATE life_chapters SET trail_id = ${ownedTrail.id}::uuid, updated_at = now() WHERE trail_id = ${anonymousTrail.id}::uuid`;
              await transaction`UPDATE movement_chapters SET trail_id = ${ownedTrail.id}::uuid, updated_at = now() WHERE trail_id = ${anonymousTrail.id}::uuid`;
              await transaction`UPDATE life_trails SET title = ${data.title}, public_title = ${data.publicTitle ?? null}, visibility = ${data.visibility}, updated_at = now() WHERE id = ${ownedTrail.id}::uuid`;
              await transaction`DELETE FROM life_trails WHERE id = ${anonymousTrail.id}::uuid`;
              trail = ownedTrail;
            } else {
              [trail] = await transaction<{ id: string }[]>`
                UPDATE life_trails
                SET profile_id = ${profile.id}::uuid, anonymous_owner_hash = NULL, title = ${data.title}, public_title = ${data.publicTitle ?? null}, visibility = ${data.visibility}, claimed_at = now(), updated_at = now()
                WHERE id = ${anonymousTrail.id}::uuid
                RETURNING id::text AS id
              `;
            }
          }
        }

        if (!trail) {
          [trail] = await transaction<{ id: string }[]>`
            INSERT INTO life_trails (profile_id, client_draft_id, title, public_title, visibility)
            VALUES (${profile.id}::uuid, ${data.clientDraftId}::uuid, ${data.title}, ${data.publicTitle ?? null}, ${data.visibility})
            ON CONFLICT (profile_id, client_draft_id) DO UPDATE SET title = EXCLUDED.title, public_title = EXCLUDED.public_title, visibility = EXCLUDED.visibility, updated_at = now()
            RETURNING id::text AS id
          `;
        }
      } else {
        [trail] = await transaction<{ id: string }[]>`
          UPDATE life_trails
          SET title = ${data.title}, public_title = ${data.publicTitle ?? null}, visibility = ${data.visibility}, updated_at = now()
          WHERE anonymous_owner_hash = ${anonymousOwnerHash}
          RETURNING id::text AS id
        `;
        if (!trail) throw new Error('This legacy preview is no longer available. Sign in with Google to save a new Life Atlas.');
      }

      if (!trail) throw new Error('Could not create this Life Trail.');
      const existingChapters = await transaction<{ id: string }[]>`SELECT id::text AS id FROM life_chapters WHERE trail_id = ${trail.id}::uuid FOR UPDATE`;
      const existingMovements = await transaction<{ id: string }[]>`SELECT id::text AS id FROM movement_chapters WHERE trail_id = ${trail.id}::uuid FOR UPDATE`;
      const existingChapterIds = new Set(existingChapters.map((chapter) => chapter.id));
      const existingMovementIds = new Set(existingMovements.map((movement) => movement.id));
      await transaction`UPDATE life_chapters SET position = position + 1000 WHERE trail_id = ${trail.id}::uuid`;
      await transaction`UPDATE movement_chapters SET position = position + 1000 WHERE trail_id = ${trail.id}::uuid`;
      const chapterIds: string[] = [];
      for (const [index, stop] of data.stops.entries()) {
        const existingId = stop.chapterId && existingChapterIds.has(stop.chapterId) ? stop.chapterId : null;
        const chapterVisibility = data.visibility === 'PUBLIC' && stop.privacy !== 'PRIVATE' ? 'PUBLIC' : 'PRIVATE';
        if (existingId) {
          const [updated] = await transaction<{ id: string }[]>`
            UPDATE life_chapters SET
              city_id = ${stop.id}::integer,
              arrival_year = ${stop.arrivalYear ?? null},
              end_year = ${stop.endYear ?? null},
              reason = ${stop.reason || 'Other'},
              title = ${stop.title || null},
              memory_body = ${stop.memory || null},
              privacy_override = ${stop.privacy ?? null},
              visibility = ${chapterVisibility},
              position = ${index},
              updated_at = now()
            WHERE id = ${existingId}::uuid AND trail_id = ${trail.id}::uuid
            RETURNING id::text AS id
          `;
          if (updated) chapterIds.push(updated.id);
        } else {
          const [inserted] = await transaction<{ id: string }[]>`
            INSERT INTO life_chapters (trail_id, city_id, arrival_year, end_year, reason, title, memory_body, privacy_override, visibility, position)
            VALUES (${trail.id}::uuid, ${stop.id}::integer, ${stop.arrivalYear ?? null}, ${stop.endYear ?? null}, ${stop.reason || 'Other'}, ${stop.title || null}, ${stop.memory || null}, ${stop.privacy ?? null}, ${chapterVisibility}, ${index})
            RETURNING id::text AS id
          `;
          if (!inserted) throw new Error('Could not save a Life Chapter.');
          chapterIds.push(inserted.id);
        }
      }
      const keptMovementIds: string[] = [];
      for (let index = 0; index < data.stops.length - 1; index += 1) {
        const from = data.stops[index]!;
        const to = data.stops[index + 1]!;
        const movementId = chapterIds[index + 1]!;
        const movementVisibility = data.visibility === 'PUBLIC' && to.privacy !== 'PRIVATE' ? 'PUBLIC' : 'PRIVATE';
        if (existingMovementIds.has(movementId)) {
          await transaction`
            UPDATE movement_chapters SET from_city_id = ${from.id}::integer, to_city_id = ${to.id}::integer,
              move_year = ${to.arrivalYear!}, end_year = ${to.endYear ?? null}, reason = ${to.reason || 'Other'},
              title = ${to.title || null}, memory_body = ${to.memory || null}, privacy_override = ${to.privacy ?? null},
              visibility = ${movementVisibility}, position = ${index}, updated_at = now()
            WHERE id = ${movementId}::uuid AND trail_id = ${trail.id}::uuid
          `;
        } else {
          await transaction`
            INSERT INTO movement_chapters (id, trail_id, from_city_id, to_city_id, move_year, end_year, reason, title, memory_body, privacy_override, visibility, position)
            VALUES (${movementId}::uuid, ${trail.id}::uuid, ${from.id}::integer, ${to.id}::integer, ${to.arrivalYear!}, ${to.endYear ?? null}, ${to.reason || 'Other'}, ${to.title || null}, ${to.memory || null}, ${to.privacy ?? null}, ${movementVisibility}, ${index})
          `;
        }
        keptMovementIds.push(movementId);
      }
      if (chapterIds.length) {
        const removedMedia = await transaction<{ storageKey: string }[]>`
          SELECT media.storage_key AS "storageKey"
          FROM chapter_media media
          JOIN life_chapters chapter ON chapter.id = media.life_chapter_id
          WHERE chapter.trail_id = ${trail.id}::uuid
            AND NOT (chapter.id = ANY(${chapterIds}::uuid[]))
        `;
        if (removedMedia.length) {
          const { deletePrivateMedia } = await import('@/lib/media-storage');
          await Promise.all(removedMedia.map((media) => deletePrivateMedia(media.storageKey)));
        }
        await transaction`DELETE FROM movement_chapters WHERE trail_id = ${trail.id}::uuid AND NOT (id = ANY(${keptMovementIds}::uuid[]))`;
        await transaction`DELETE FROM life_chapters WHERE trail_id = ${trail.id}::uuid AND NOT (id = ANY(${chapterIds}::uuid[]))`;
      }
      let shareToken: string | null = null;
      if (data.visibility !== 'PRIVATE') {
        const [sharedTrail] = await transaction<{ shareToken: string }[]>`
          UPDATE life_trails
          SET share_token = COALESCE(share_token, ${randomBytes(24).toString('base64url')}), published_at = COALESCE(published_at, now()), updated_at = now()
          WHERE id = ${trail.id}::uuid
          RETURNING share_token AS "shareToken"
        `;
        shareToken = sharedTrail?.shareToken ?? null;
      }
      return { trailId: trail.id, chapterIds, shareToken };
    });

    if (session?.user && anonymousOwnerHash) clearAnonymousOwnerCookie();
    return { saved: true, ...saved, visibility: data.visibility, ownership: session?.user ? 'account' as const : 'anonymous' as const };
}

export const saveTrail = createServerFn({ method: 'POST' })
  .validator((value: unknown) => saveTrailInput.parse(value))
  .handler(async ({ data }) => {
    const { auth, authConfigured } = await import('@/lib/auth');
    const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
    return persistTrail(data, session);
  });

export const createGuestSaveHandoff = createServerFn({ method: 'POST' })
  .validator((value: unknown) => saveTrailInput.parse(value))
  .handler(async ({ data }) => {
    const { auth, authConfigured } = await import('@/lib/auth');
    const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
    if (session?.user) return { prepared: false, authenticated: true, expiresAt: null };
    const serialized = JSON.stringify(data);
    if (new TextEncoder().encode(serialized).byteLength > 64 * 1024) throw new Error('This preview is too large to carry safely through sign-in. Shorten long memories and try again.');
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) throw new Error('The Life Atlas database is not configured yet.');
    const { currentGuestSaveTokenHash, issueGuestSaveToken } = await import('@/server/guest-save-handoff');
    const previousTokenHash = currentGuestSaveTokenHash();
    const { tokenHash, expiresAt } = issueGuestSaveToken();
    await sql.begin(async (transaction) => {
      await transaction`DELETE FROM guest_save_handoffs WHERE expires_at <= now()`;
      if (previousTokenHash) await transaction`DELETE FROM guest_save_handoffs WHERE token_hash = ${previousTokenHash}`;
      await transaction`
        INSERT INTO guest_save_handoffs (token_hash, draft, expires_at)
        VALUES (${tokenHash}, ${serialized}::jsonb, ${expiresAt.toISOString()}::timestamptz)
      `;
    });
    return { prepared: true, authenticated: false, expiresAt: expiresAt.toISOString() };
  });

export const claimGuestSaveHandoff = createServerFn({ method: 'POST' })
  .handler(async () => {
    const { auth, authConfigured } = await import('@/lib/auth');
    const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
    if (!session?.user) return { claimed: false, reason: 'signed-out' as const };
    const { clearGuestSaveToken, currentGuestSaveTokenHash } = await import('@/server/guest-save-handoff');
    const tokenHash = currentGuestSaveTokenHash();
    if (!tokenHash) return { claimed: false, reason: 'missing' as const };
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) throw new Error('The Life Atlas database is not configured yet.');
    const [handoff] = await sql<{ draft: unknown }[]>`
      SELECT draft
      FROM guest_save_handoffs
      WHERE token_hash = ${tokenHash} AND expires_at > now()
      LIMIT 1
    `;
    if (!handoff) {
      clearGuestSaveToken();
      await sql`DELETE FROM guest_save_handoffs WHERE token_hash = ${tokenHash} OR expires_at <= now()`;
      return { claimed: false, reason: 'expired' as const };
    }
    const draft = saveTrailInput.parse(handoff.draft);
    const saved = await persistTrail(draft, session);
    await sql`DELETE FROM guest_save_handoffs WHERE token_hash = ${tokenHash}`;
    clearGuestSaveToken();
    return { claimed: true, ...saved };
  });

export const getMyLatestTrail = createServerFn({ method: 'POST' })
  .handler(async () => {
    const { auth, authConfigured } = await import('@/lib/auth');
    const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) return { authenticated: Boolean(session?.user), ownership: null, trail: null };
    const { clearAnonymousOwnerCookie, getAnonymousOwnerHash } = await import('@/server/anonymous-owner');
    const anonymousOwnerHash = getAnonymousOwnerHash();
    let claimedAnonymousTrail = false;

    const trail = await sql.begin(async (transaction) => {
      if (session?.user) {
        const [profile] = await transaction<{ id: string }[]>`
          INSERT INTO profiles (user_id, display_name)
          VALUES (${session.user.id}, ${session.user.name})
          ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
          RETURNING id::text AS id
        `;
        if (!profile) throw new Error('Could not load this account.');

        if (anonymousOwnerHash) {
          const [anonymousTrail] = await transaction<{ id: string; clientDraftId: string; title: string; visibility: StoryVisibility; shareToken: string | null }[]>`
            SELECT id::text AS id, client_draft_id::text AS "clientDraftId", title, visibility, share_token AS "shareToken"
            FROM life_trails
            WHERE anonymous_owner_hash = ${anonymousOwnerHash}
            FOR UPDATE
          `;
          if (anonymousTrail) {
            const [ownedTrail] = await transaction<{ id: string }[]>`
              SELECT id::text AS id
              FROM life_trails
              WHERE profile_id = ${profile.id}::uuid
                AND client_draft_id = ${anonymousTrail.clientDraftId}::uuid
              FOR UPDATE
            `;
            if (ownedTrail && ownedTrail.id !== anonymousTrail.id) {
              await transaction`DELETE FROM life_chapters WHERE trail_id = ${ownedTrail.id}::uuid`;
              await transaction`DELETE FROM movement_chapters WHERE trail_id = ${ownedTrail.id}::uuid`;
              await transaction`UPDATE life_chapters SET trail_id = ${ownedTrail.id}::uuid, updated_at = now() WHERE trail_id = ${anonymousTrail.id}::uuid`;
              await transaction`UPDATE movement_chapters SET trail_id = ${ownedTrail.id}::uuid, updated_at = now() WHERE trail_id = ${anonymousTrail.id}::uuid`;
              await transaction`UPDATE life_trails SET title = ${anonymousTrail.title}, claimed_at = COALESCE(claimed_at, now()), updated_at = now() WHERE id = ${ownedTrail.id}::uuid`;
              await transaction`DELETE FROM life_trails WHERE id = ${anonymousTrail.id}::uuid`;
              claimedAnonymousTrail = true;
              const [merged] = await transaction<Array<{ id: string; clientDraftId: string; title: string; visibility: StoryVisibility; shareToken: string | null }>>`
                SELECT id::text AS id, client_draft_id::text AS "clientDraftId", title, visibility, share_token AS "shareToken" FROM life_trails WHERE id = ${ownedTrail.id}::uuid
              `;
              return merged;
            }
            const [claimed] = await transaction<Array<{ id: string; clientDraftId: string; title: string; visibility: StoryVisibility; shareToken: string | null }>>`
              UPDATE life_trails
              SET profile_id = ${profile.id}::uuid, anonymous_owner_hash = NULL, claimed_at = now(), updated_at = now()
              WHERE id = ${anonymousTrail.id}::uuid
              RETURNING id::text AS id, client_draft_id::text AS "clientDraftId", title, visibility, share_token AS "shareToken"
            `;
            claimedAnonymousTrail = Boolean(claimed);
            if (claimed) return claimed;
          }
        }

        const [owned] = await transaction<Array<{ id: string; clientDraftId: string; title: string; visibility: StoryVisibility; shareToken: string | null }>>`
          SELECT trail.id::text AS id, trail.client_draft_id::text AS "clientDraftId", trail.title, trail.visibility, trail.share_token AS "shareToken"
          FROM life_trails trail
          WHERE trail.profile_id = ${profile.id}::uuid
          ORDER BY trail.updated_at DESC, trail.created_at DESC
          LIMIT 1
        `;
        return owned;
      }

      if (!anonymousOwnerHash) return undefined;
      const [anonymous] = await transaction<Array<{ id: string; clientDraftId: string; title: string; visibility: StoryVisibility; shareToken: string | null }>>`
        SELECT id::text AS id, client_draft_id::text AS "clientDraftId", title, visibility, share_token AS "shareToken"
        FROM life_trails
        WHERE anonymous_owner_hash = ${anonymousOwnerHash}
        LIMIT 1
      `;
      return anonymous;
    });

    if (claimedAnonymousTrail) clearAnonymousOwnerCookie();
    const ownership = session?.user ? 'account' as const : anonymousOwnerHash ? 'anonymous' as const : null;
    if (!trail) return { authenticated: Boolean(session?.user), ownership, trail: null };

    const chapters = await sql<Array<{
      id: string;
      position: number;
      arrivalYear: number | null;
      endYear: number | null;
      reason: string;
      title: string | null;
      memory: string | null;
      privacy: StoryVisibility | null;
      cityId: string; city: string; region: string | null; country: string; countryCode: string; latitude: number; longitude: number;
    }>>`
      SELECT
        chapter.id::text AS id, chapter.position, chapter.arrival_year AS "arrivalYear", chapter.end_year AS "endYear", chapter.reason,
        chapter.title, chapter.memory_body AS memory, chapter.privacy_override AS privacy,
        city.id::text AS "cityId", city.name AS city, state.name AS region,
        country.name AS country, country.code AS "countryCode", city.latitude, city.longitude
      FROM life_chapters chapter
      JOIN cities city ON city.id = chapter.city_id
      JOIN countries country ON country.code = city.country_code
      LEFT JOIN states state ON state.id = city.state_id
      WHERE chapter.trail_id = ${trail.id}::uuid
      ORDER BY chapter.position
    `;
    if (!chapters.length) return { authenticated: Boolean(session?.user), ownership, trail: null };

    const chapterIds = chapters.map((chapter) => chapter.id);
    const media = await sql<Array<{ id: string; chapterId: string; mimeType: string; width: number | null; height: number | null; displayOrder: number; caption: string | null }>>`
      SELECT id::text AS id, life_chapter_id::text AS "chapterId", mime_type AS "mimeType", width, height, display_order AS "displayOrder", caption
      FROM chapter_media
      WHERE life_chapter_id = ANY(${chapterIds}::uuid[])
      ORDER BY life_chapter_id, display_order, created_at
    `;
    const mediaByChapter = new Map<string, Array<{ id: string; chapterId: string; mimeType: string; width: number | null; height: number | null; displayOrder: number; caption: string | null }>>();
    media.forEach((item) => mediaByChapter.set(item.chapterId, [...(mediaByChapter.get(item.chapterId) ?? []), item]));

    const stops: TrailStop[] = chapters.map((chapter) => ({
      id: chapter.cityId,
      chapterId: chapter.id,
      city: chapter.city,
      region: chapter.region,
      country: chapter.country,
      countryCode: chapter.countryCode,
      latitude: chapter.latitude,
      longitude: chapter.longitude,
      ...(chapter.arrivalYear ? { arrivalYear: chapter.arrivalYear } : {}),
      ...(chapter.endYear ? { endYear: chapter.endYear } : {}),
      reason: chapter.reason,
      ...(chapter.title ? { title: chapter.title } : {}),
      ...(chapter.memory ? { memory: chapter.memory } : {}),
      ...(chapter.privacy ? { privacy: chapter.privacy } : {}),
      photos: (mediaByChapter.get(chapter.id) ?? []).map((photo) => ({ ...photo, url: `/api/media/${photo.id}` })),
    }));

    return {
      authenticated: Boolean(session?.user),
      ownership,
      trail: {
        id: trail.id,
        clientDraftId: trail.clientDraftId,
        title: trail.title,
        visibility: trail.visibility,
        shareToken: trail.shareToken,
        stops,
      },
    };
  });

export const getMediaCapabilities = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth, authConfigured } = await import('@/lib/auth');
  const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
  const storageConfigured = Boolean(process.env['BLOB_READ_WRITE_TOKEN']);
  return {
    uploads: storageConfigured && Boolean(session?.user),
    storageConfigured,
    authenticated: Boolean(session?.user),
    maxPhotos: 5,
    maxBytes: 10 * 1024 * 1024,
    maxSourceBytes: 25 * 1024 * 1024,
  };
});

export const deleteChapterPhoto = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ mediaId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) throw new Error('The Life Atlas database is not configured.');
    const { auth, authConfigured } = await import('@/lib/auth');
    const session = authConfigured ? await auth.api.getSession({ headers: getRequestHeaders() }) : null;
    const { getAnonymousOwnerHash } = await import('@/server/anonymous-owner');
    const anonymousOwnerHash = getAnonymousOwnerHash();
    const userId = session?.user?.id ?? null;
    const [media] = await sql<{ storageKey: string }[]>`
      SELECT media.storage_key AS "storageKey"
      FROM chapter_media media
      JOIN life_chapters chapter ON chapter.id = media.life_chapter_id
      JOIN life_trails trail ON trail.id = chapter.trail_id
      LEFT JOIN profiles profile ON profile.id = trail.profile_id
      WHERE media.id = ${data.mediaId}::uuid
        AND (
          (${userId}::text IS NOT NULL AND profile.user_id = ${userId})
          OR (${anonymousOwnerHash}::text IS NOT NULL AND trail.anonymous_owner_hash = ${anonymousOwnerHash})
        )
      LIMIT 1
    `;
    if (!media) throw new Error('Photo not found.');
    const { deletePrivateMedia } = await import('@/lib/media-storage');
    await deletePrivateMedia(media.storageKey);
    await sql`DELETE FROM chapter_media WHERE id = ${data.mediaId}::uuid`;
    return { deleted: true };
  });

// A visibility change must revoke an open share link on its very next load.
// POST avoids intermediary/browser caching of this authorization-sensitive read.
export const getSharedTrail = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ token: z.string().min(24).max(100) }).parse(value))
  .handler(async ({ data }) => {
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) return { trail: null };
    const [trail] = await sql<Array<{ id: string; title: string; publicTitle: string | null; visibility: StoryVisibility; displayName: string | null }>>`
      SELECT trail.id::text AS id, trail.title, trail.public_title AS "publicTitle", trail.visibility, profile.display_name AS "displayName"
      FROM life_trails trail
      LEFT JOIN profiles profile ON profile.id = trail.profile_id
      WHERE trail.share_token = ${data.token} AND trail.visibility IN ('UNLISTED', 'PUBLIC')
      LIMIT 1
    `;
    if (!trail) return { trail: null };
    const chapters = await sql<Array<{
      id: string; position: number; arrivalYear: number | null; endYear: number | null; reason: string; title: string | null; memory: string | null;
      cityId: string; city: string; region: string | null; country: string; countryCode: string; latitude: number; longitude: number;
    }>>`
      SELECT chapter.id::text AS id, chapter.position, chapter.arrival_year AS "arrivalYear", chapter.end_year AS "endYear", chapter.reason, chapter.title, chapter.memory_body AS memory,
        city.id::text AS "cityId", city.name AS city, state.name AS region, country.name AS country, country.code AS "countryCode", city.latitude, city.longitude
      FROM life_chapters chapter
      JOIN cities city ON city.id = chapter.city_id
      JOIN countries country ON country.code = city.country_code
      LEFT JOIN states state ON state.id = city.state_id
      WHERE chapter.trail_id = ${trail.id}::uuid
        AND COALESCE(chapter.privacy_override, ${trail.visibility}::story_visibility) <> 'PRIVATE'
      ORDER BY chapter.position
    `;
    if (!chapters.length) return { trail: null };
    const chapterIds = chapters.map((chapter) => chapter.id);
    const media = await sql<Array<{ id: string; chapterId: string; mimeType: string; width: number | null; height: number | null; displayOrder: number; caption: string | null }>>`
      SELECT media.id::text AS id, media.life_chapter_id::text AS "chapterId", media.mime_type AS "mimeType", media.width, media.height, media.display_order AS "displayOrder", media.caption
      FROM chapter_media media
      JOIN life_chapters chapter ON chapter.id = media.life_chapter_id
      WHERE media.life_chapter_id = ANY(${chapterIds}::uuid[])
        AND COALESCE(media.privacy_override, chapter.privacy_override, ${trail.visibility}::story_visibility) <> 'PRIVATE'
      ORDER BY media.life_chapter_id, media.display_order
    `;
    const mediaByChapter = new Map<string, Array<{ id: string; chapterId: string; mimeType: string; width: number | null; height: number | null; displayOrder: number; caption: string | null }>>();
    media.forEach((item) => mediaByChapter.set(item.chapterId, [...(mediaByChapter.get(item.chapterId) ?? []), item]));
    const stops: TrailStop[] = chapters.map((chapter) => ({
      id: chapter.cityId, chapterId: chapter.id, city: chapter.city, region: chapter.region, country: chapter.country, countryCode: chapter.countryCode, latitude: chapter.latitude, longitude: chapter.longitude,
      ...(chapter.arrivalYear ? { arrivalYear: chapter.arrivalYear } : {}), ...(chapter.endYear ? { endYear: chapter.endYear } : {}), reason: chapter.reason,
      ...(chapter.title ? { title: chapter.title } : {}), ...(chapter.memory ? { memory: chapter.memory } : {}),
      photos: (mediaByChapter.get(chapter.id) ?? []).map((photo) => ({ ...photo, url: `/api/media/${photo.id}` })),
    }));
    return { trail: { title: trail.publicTitle || trail.title, displayName: trail.displayName, visibility: trail.visibility, stops } };
  });
