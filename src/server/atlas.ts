import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import type { AtlasRoute, Place } from '@/lib/atlas-data';

const privacyThreshold = 5;
const placeId = z.string().regex(/^\d+$/);
const reason = z.enum(['Career', 'Study', 'Family', 'Love', 'Adventure', 'Opportunity', 'Other']);

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
      WHERE lower(city.name) LIKE lower(${data.query}) || '%'
        OR similarity(lower(city.name), lower(${data.query})) >= 0.34
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
      WHERE from_city_id = ${data.fromCityId}::bigint
        AND to_city_id = ${data.toCityId}::bigint
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
        AND (${fromCityId}::bigint IS NULL OR chapter.from_city_id = ${fromCityId}::bigint)
        AND (${toCityId}::bigint IS NULL OR chapter.to_city_id = ${toCityId}::bigint)
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

const stopInput = z.object({
  id: placeId,
  arrivalYear: z.number().int().min(1900).max(2100).optional(),
  reason: reason.optional(),
});

const saveTrailInput = z.object({
  clientDraftId: z.string().uuid(),
  title: z.string().trim().min(1).max(120).default('My Life Trail'),
  visibility: z.enum(['PUBLIC', 'ANONYMOUS', 'PRIVATE']).default('PRIVATE'),
  stops: z.array(stopInput).min(2).max(50),
}).superRefine((value, context) => {
  value.stops.slice(1).forEach((stop, index) => {
    if (!stop.arrivalYear) context.addIssue({ code: 'custom', path: ['stops', index + 1, 'arrivalYear'], message: 'Each movement chapter needs a year.' });
  });
});

export const saveTrail = createServerFn({ method: 'POST' })
  .validator((value: unknown) => saveTrailInput.parse(value))
  .handler(async ({ data }) => {
    const { auth, authConfigured } = await import('@/lib/auth');
    if (!authConfigured) throw new Error('Authentication is not configured yet.');
    const session = await auth.api.getSession({ headers: getRequestHeaders() });
    if (!session?.user) throw new Error('Sign in to save your Life Trail.');
    const { databaseConfigured, sql } = await import('@/db');
    if (!databaseConfigured) throw new Error('The Life Atlas database is not configured yet.');

    const trailId = await sql.begin(async (transaction) => {
      const uniqueCityIds = [...new Set(data.stops.map((stop) => stop.id))];
      const existingCities = await transaction<{ id: string }[]>`
        SELECT id::text AS id FROM cities WHERE id = ANY(${uniqueCityIds}::bigint[])
      `;
      if (existingCities.length !== uniqueCityIds.length) throw new Error('One or more selected cities no longer exist.');

      const [profile] = await transaction<{ id: string }[]>`
        INSERT INTO profiles (user_id, display_name)
        VALUES (${session.user.id}, ${session.user.name})
        ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
        RETURNING id::text AS id
      `;
      if (!profile) throw new Error('Could not create a profile for this account.');
      const [trail] = await transaction<{ id: string }[]>`
        INSERT INTO life_trails (profile_id, client_draft_id, title)
        VALUES (${profile.id}::uuid, ${data.clientDraftId}::uuid, ${data.title})
        ON CONFLICT (profile_id, client_draft_id) DO UPDATE SET title = EXCLUDED.title, updated_at = now()
        RETURNING id::text AS id
      `;
      if (!trail) throw new Error('Could not create this Life Trail.');
      await transaction`DELETE FROM movement_chapters WHERE trail_id = ${trail.id}::uuid`;
      const chapters = data.stops.slice(1).map((stop, index) => ({
        trail_id: trail.id,
        from_city_id: data.stops[index]!.id,
        to_city_id: stop.id,
        move_year: stop.arrivalYear!,
        reason: stop.reason || 'Other',
        visibility: data.visibility,
        position: index,
      }));
      await transaction`
        INSERT INTO movement_chapters ${transaction(chapters, 'trail_id', 'from_city_id', 'to_city_id', 'move_year', 'reason', 'visibility', 'position')}
      `;
      return trail.id;
    });

    return { saved: true, trailId };
  });
