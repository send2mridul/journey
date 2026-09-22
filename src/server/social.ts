import { createHash, randomBytes } from 'node:crypto';
import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';
import { deriveSharedDiscoveries, minimalProfile, normalizeHandle, pairAccess, type ComparisonChapter } from '@/server/social-policy';

const handleInput = z.string().trim().min(1).max(30);
const discoverabilityInput = z.enum(['DISCOVERABLE', 'LIMITED', 'HIDDEN']);
const friendListVisibilityInput = z.enum(['ONLY_ME', 'FRIENDS']);
const requestIdInput = z.string().uuid();
const permissionInput = z.enum(['COMPARE', 'ATLAS', 'EXTERNAL_SHARE']);

type SocialProfile = { id: string; userId: string; displayName: string | null; handle: string | null; handleNormalized: string | null; discoverability: 'DISCOVERABLE' | 'LIMITED' | 'HIDDEN'; friendListVisibility: 'ONLY_ME' | 'FRIENDS'; image: string | null };
type SocialPayload = Record<string, string | number | boolean | null>;

async function requireSocialProfile(requireHandle = true) {
  const { auth, authConfigured } = await import('@/lib/auth');
  if (!authConfigured) throw new Error('Google sign-in is not configured yet.');
  const session = await auth.api.getSession({ headers: getRequestHeaders() });
  if (!session?.user) throw new Error('Continue with Google to use Life Circle.');
  const { requireDatabase, sql } = await import('@/db');
  requireDatabase();
  const [profile] = await sql<SocialProfile[]>`
    INSERT INTO profiles (user_id, display_name)
    VALUES (${session.user.id}, ${session.user.name})
    ON CONFLICT (user_id) DO UPDATE SET display_name = COALESCE(profiles.display_name, EXCLUDED.display_name), updated_at = now()
    RETURNING id::text AS id, user_id AS "userId", display_name AS "displayName", handle, handle_normalized AS "handleNormalized", discoverability, friend_list_visibility AS "friendListVisibility", ${session.user.image ?? null}::text AS image
  `;
  if (!profile) throw new Error('Your Life Atlas profile could not be loaded.');
  if (requireHandle && !profile.handleNormalized) throw new Error('Choose your Life Atlas handle first.');
  return profile;
}

function canonicalPair(first: string, second: string) {
  return first.localeCompare(second) < 0 ? [first, second] as const : [second, first] as const;
}

async function rateLimit(profileId: string, action: string, maximum: number) {
  const { sql } = await import('@/db');
  const [row] = await sql<{ attempts: number }[]>`
    INSERT INTO social_rate_limits (profile_id, action, window_started_at, attempts)
    VALUES (${profileId}::uuid, ${action}, date_trunc('hour', now()), 1)
    ON CONFLICT (profile_id, action, window_started_at)
    DO UPDATE SET attempts = social_rate_limits.attempts + 1
    WHERE social_rate_limits.attempts < ${maximum}
    RETURNING attempts
  `;
  if (!row) throw new Error('Please slow down and try again later.');
}

async function activity(recipientProfileId: string, actorProfileId: string | null, connectionId: string | null, type: string, payload: SocialPayload = {}) {
  const { sql } = await import('@/db');
  await sql`INSERT INTO social_activities (recipient_profile_id, actor_profile_id, connection_id, type, payload) VALUES (${recipientProfileId}::uuid, ${actorProfileId}::uuid, ${connectionId}::uuid, ${type}, ${sql.json(payload)})`;
}

export const getSocialSession = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    const profile = await requireSocialProfile(false);
    return {
      authenticated: true as const,
      profile: profile.handle ? { displayName: profile.displayName, handle: profile.handle, discoverability: profile.discoverability, friendListVisibility: profile.friendListVisibility } : null,
    };
  } catch (error) {
    return { authenticated: false as const, profile: null, reason: error instanceof Error ? error.message : 'Google sign-in is required.' };
  }
});

const saveProfileInput = z.object({
  handle: handleInput,
  displayName: z.string().trim().min(1).max(80),
  discoverability: discoverabilityInput.default('LIMITED'),
  friendListVisibility: friendListVisibilityInput.default('ONLY_ME'),
});

export const saveSocialProfile = createServerFn({ method: 'POST' })
  .validator((value: unknown) => saveProfileInput.parse(value))
  .handler(async ({ data }) => {
    const profile = await requireSocialProfile(false);
    const handle = normalizeHandle(data.handle);
    const { sql } = await import('@/db');
    try {
      const [saved] = await sql<{ displayName: string; handle: string; discoverability: 'DISCOVERABLE' | 'LIMITED' | 'HIDDEN'; friendListVisibility: 'ONLY_ME' | 'FRIENDS' }[]>`
        UPDATE profiles
        SET display_name = ${data.displayName}, handle = ${handle.display}, handle_normalized = ${handle.normalized}, discoverability = ${data.discoverability}, friend_list_visibility = ${data.friendListVisibility}, updated_at = now()
        WHERE id = ${profile.id}::uuid
        RETURNING display_name AS "displayName", handle, discoverability, friend_list_visibility AS "friendListVisibility"
      `;
      if (!saved) throw new Error('Your profile could not be saved.');
      return { profile: saved };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === '23505') throw new Error('That Life Atlas handle is already taken.');
      throw error;
    }
  });

const searchPeopleInput = z.object({ query: z.string().trim().min(2).max(40) });

export const searchPeople = createServerFn({ method: 'GET' })
  .validator((value: unknown) => searchPeopleInput.parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    await rateLimit(me.id, 'PEOPLE_SEARCH', 120);
    const normalizedQuery = data.query.replace(/^@+/, '').toLowerCase();
    const { sql } = await import('@/db');
    const rows = await sql<Array<{
      displayName: string | null; handle: string; image: string | null; mutualConnections: number; requesterProfileId: string | null; recipientProfileId: string | null; connectionStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED' | null;
    }>>`
      WITH my_friends AS (
        SELECT CASE WHEN low_profile_id = ${me.id}::uuid THEN high_profile_id ELSE low_profile_id END AS friend_id
        FROM connections WHERE status = 'ACCEPTED' AND (${me.id}::uuid IN (low_profile_id, high_profile_id))
      ), candidate_mutuals AS (
        SELECT p.id AS candidate_id, count(*)::int AS mutual_count
        FROM profiles p
        JOIN connections candidate_connection ON candidate_connection.status = 'ACCEPTED' AND p.id IN (candidate_connection.low_profile_id, candidate_connection.high_profile_id)
        JOIN my_friends mine ON mine.friend_id = CASE WHEN candidate_connection.low_profile_id = p.id THEN candidate_connection.high_profile_id ELSE candidate_connection.low_profile_id END
        GROUP BY p.id
      )
      SELECT profile.display_name AS "displayName", profile.handle, account_user.image,
        COALESCE(candidate_mutuals.mutual_count, 0)::int AS "mutualConnections",
        relationship.requester_profile_id::text AS "requesterProfileId", relationship.recipient_profile_id::text AS "recipientProfileId", relationship.status AS "connectionStatus"
      FROM profiles profile
      JOIN users account_user ON account_user.id = profile.user_id
      LEFT JOIN candidate_mutuals ON candidate_mutuals.candidate_id = profile.id
      LEFT JOIN connections relationship ON relationship.low_profile_id = LEAST(profile.id, ${me.id}::uuid) AND relationship.high_profile_id = GREATEST(profile.id, ${me.id}::uuid)
      WHERE profile.id <> ${me.id}::uuid
        AND profile.handle_normalized IS NOT NULL
        AND COALESCE(relationship.status::text, '') <> 'BLOCKED'
        AND profile.handle_normalized = ${normalizedQuery}
        AND (
          relationship.status = 'ACCEPTED'
          OR profile.discoverability IN ('DISCOVERABLE', 'LIMITED')
        )
      LIMIT 1
    `;
    return {
      people: rows.map((row) => minimalProfile({
        displayName: row.displayName,
        handle: row.handle,
        image: row.image,
        mutualConnections: row.mutualConnections,
        requestStatus: row.connectionStatus === 'ACCEPTED' ? 'CONNECTED' : row.connectionStatus === 'PENDING' ? (row.requesterProfileId === me.id ? 'OUTGOING' : 'INCOMING') : 'NONE',
      })),
    };
  });

async function suggestionRows(profileId: string) {
  const { sql } = await import('@/db');
  return sql<Array<{ displayName: string | null; handle: string; image: string | null; mutualConnections: number }>>`
    WITH my_friends AS (
      SELECT CASE WHEN low_profile_id = ${profileId}::uuid THEN high_profile_id ELSE low_profile_id END AS friend_id
      FROM connections WHERE status = 'ACCEPTED' AND (${profileId}::uuid IN (low_profile_id, high_profile_id))
    ), second_degree AS (
      SELECT CASE WHEN connection.low_profile_id = mine.friend_id THEN connection.high_profile_id ELSE connection.low_profile_id END AS candidate_id,
        count(DISTINCT mine.friend_id)::int AS mutual_count
      FROM my_friends mine
      JOIN connections connection ON connection.status = 'ACCEPTED' AND mine.friend_id IN (connection.low_profile_id, connection.high_profile_id)
      GROUP BY candidate_id
    )
    SELECT profile.display_name AS "displayName", profile.handle, account_user.image, second_degree.mutual_count AS "mutualConnections"
    FROM second_degree
    JOIN profiles profile ON profile.id = second_degree.candidate_id
    JOIN users account_user ON account_user.id = profile.user_id
    LEFT JOIN connections existing ON existing.low_profile_id = LEAST(profile.id, ${profileId}::uuid) AND existing.high_profile_id = GREATEST(profile.id, ${profileId}::uuid)
    WHERE second_degree.candidate_id <> ${profileId}::uuid
      AND profile.discoverability = 'DISCOVERABLE'
      AND profile.handle IS NOT NULL
      AND existing.id IS NULL
    ORDER BY second_degree.mutual_count DESC, profile.handle_normalized
    LIMIT 12
  `;
}

export const getLifeCircle = createServerFn({ method: 'GET' }).handler(async () => {
  const me = await requireSocialProfile();
  const { sql } = await import('@/db');
  const relationships = await sql<Array<{ requestId: string; otherProfileId: string; displayName: string | null; handle: string; image: string | null; status: 'PENDING' | 'ACCEPTED'; incoming: boolean; compareMine: boolean; compareTheirs: boolean; atlasMine: boolean; atlasTheirs: boolean }>>`
    SELECT connection.id::text AS "requestId", other.id::text AS "otherProfileId", other.display_name AS "displayName", other.handle, account_user.image,
      connection.status, connection.recipient_profile_id = ${me.id}::uuid AS incoming,
      CASE WHEN connection.low_profile_id = ${me.id}::uuid THEN COALESCE(permission.low_compare_allowed, false) ELSE COALESCE(permission.high_compare_allowed, false) END AS "compareMine",
      CASE WHEN connection.low_profile_id = ${me.id}::uuid THEN COALESCE(permission.high_compare_allowed, false) ELSE COALESCE(permission.low_compare_allowed, false) END AS "compareTheirs",
      CASE WHEN connection.low_profile_id = ${me.id}::uuid THEN COALESCE(permission.low_atlas_shared, false) ELSE COALESCE(permission.high_atlas_shared, false) END AS "atlasMine",
      CASE WHEN connection.low_profile_id = ${me.id}::uuid THEN COALESCE(permission.high_atlas_shared, false) ELSE COALESCE(permission.low_atlas_shared, false) END AS "atlasTheirs"
    FROM connections connection
    JOIN profiles other ON other.id = CASE WHEN connection.low_profile_id = ${me.id}::uuid THEN connection.high_profile_id ELSE connection.low_profile_id END
    JOIN users account_user ON account_user.id = other.user_id
    LEFT JOIN connection_permissions permission ON permission.connection_id = connection.id
    WHERE ${me.id}::uuid IN (connection.low_profile_id, connection.high_profile_id) AND connection.status IN ('PENDING', 'ACCEPTED')
    ORDER BY connection.status, connection.created_at DESC
  `;
  const chapterRequests = await sql<Array<{ tagId: string; ownerName: string | null; ownerHandle: string; city: string; fromYear: number; toYear: number | null }>>`
    SELECT person.id::text AS "tagId", owner.display_name AS "ownerName", owner.handle AS "ownerHandle",
      city.name AS city, chapter.arrival_year AS "fromYear", chapter.end_year AS "toYear"
    FROM chapter_people person
    JOIN profiles owner ON owner.id = person.owner_profile_id
    JOIN life_chapters chapter ON chapter.id = person.life_chapter_id
    JOIN cities city ON city.id = chapter.city_id
    WHERE person.target_profile_id = ${me.id}::uuid AND person.status = 'PENDING' AND owner.handle IS NOT NULL
    ORDER BY person.created_at DESC
    LIMIT 12
  `;
  const momentRequests = await sql<Array<{ momentId: string; proposerName: string | null; proposerHandle: string; city: string; yearFrom: number | null; yearTo: number | null }>>`
    SELECT moment.id::text AS "momentId", proposer.display_name AS "proposerName", proposer.handle AS "proposerHandle",
      moment.city_name AS city, moment.year_from AS "yearFrom", moment.year_to AS "yearTo"
    FROM shared_moments moment
    JOIN connections connection ON connection.id = moment.connection_id
    JOIN profiles proposer ON proposer.id = moment.proposed_by_profile_id
    WHERE moment.status = 'PENDING' AND moment.proposed_by_profile_id <> ${me.id}::uuid
      AND ${me.id}::uuid IN (connection.low_profile_id, connection.high_profile_id)
      AND connection.status = 'ACCEPTED' AND proposer.handle IS NOT NULL
    ORDER BY moment.created_at DESC
    LIMIT 12
  `;
  const people = relationships.map((row) => ({
    requestId: row.requestId,
    profile: minimalProfile({ displayName: row.displayName, handle: row.handle, image: row.image }),
    incoming: row.incoming,
    compare: { mine: row.compareMine, theirs: row.compareTheirs },
    atlas: { mine: row.atlasMine, theirs: row.atlasTheirs },
  }));
  return {
    profile: { displayName: me.displayName, handle: me.handle!, discoverability: me.discoverability, friendListVisibility: me.friendListVisibility },
    friends: people.filter((_, index) => relationships[index]?.status === 'ACCEPTED'),
    incoming: people.filter((_, index) => relationships[index]?.status === 'PENDING' && relationships[index]?.incoming),
    outgoing: people.filter((_, index) => relationships[index]?.status === 'PENDING' && !relationships[index]?.incoming),
    suggestions: [],
    chapterRequests,
    momentRequests,
    activities: [],
  };
});

export const sendConnectionRequest = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ handle: handleInput }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    await rateLimit(me.id, 'CONNECTION_REQUEST', 30);
    const normalized = normalizeHandle(data.handle).normalized;
    const { sql } = await import('@/db');
    const result = await sql.begin(async (transaction) => {
      const [target] = await transaction<{ id: string; displayName: string | null; handle: string; discoverability: 'DISCOVERABLE' | 'LIMITED' | 'HIDDEN'; existingStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED' | null }[]>`
        SELECT target.id::text AS id, target.display_name AS "displayName", target.handle, target.discoverability, existing.status AS "existingStatus"
        FROM profiles target
        LEFT JOIN connections existing ON existing.low_profile_id = LEAST(target.id, ${me.id}::uuid) AND existing.high_profile_id = GREATEST(target.id, ${me.id}::uuid)
        WHERE target.handle_normalized = ${normalized} AND target.handle IS NOT NULL
      `;
      if (!target || target.id === me.id) throw new Error('That Life Atlas profile is not available.');
      if (target.discoverability === 'HIDDEN' && target.existingStatus !== 'PENDING' && target.existingStatus !== 'ACCEPTED') throw new Error('That Life Atlas profile is not available.');
      const [lowId, highId] = canonicalPair(me.id, target.id);
      await transaction`
        INSERT INTO connections (low_profile_id, high_profile_id, requester_profile_id, recipient_profile_id, status)
        VALUES (${lowId}::uuid, ${highId}::uuid, ${me.id}::uuid, ${target.id}::uuid, 'PENDING')
        ON CONFLICT (low_profile_id, high_profile_id) DO NOTHING
      `;
      const [connection] = await transaction<{ id: string; requesterProfileId: string; recipientProfileId: string; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED'; updatedAt: string }[]>`
        SELECT id::text AS id, requester_profile_id::text AS "requesterProfileId", recipient_profile_id::text AS "recipientProfileId", status, updated_at::text AS "updatedAt"
        FROM connections WHERE low_profile_id = ${lowId}::uuid AND high_profile_id = ${highId}::uuid FOR UPDATE
      `;
      if (!connection) throw new Error('The connection request could not be created.');
      if (connection.status === 'BLOCKED') throw new Error('That Life Atlas profile is not available.');
      if (connection.status === 'ACCEPTED') return { status: 'CONNECTED' as const, connectionId: connection.id, target };
      if (connection.status === 'PENDING' && connection.requesterProfileId === me.id) return { status: 'REQUEST_SENT' as const, connectionId: connection.id, target };
      if (connection.status === 'PENDING' && connection.recipientProfileId === me.id) {
        await transaction`UPDATE connections SET status = 'ACCEPTED', responded_at = now(), updated_at = now() WHERE id = ${connection.id}::uuid`;
        await transaction`INSERT INTO connection_permissions (connection_id) VALUES (${connection.id}::uuid) ON CONFLICT DO NOTHING`;
        return { status: 'CONNECTED' as const, connectionId: connection.id, target };
      }
      const declinedRecently = Date.now() - new Date(connection.updatedAt).getTime() < 30 * 24 * 60 * 60 * 1000;
      if (declinedRecently) throw new Error('A previous request was declined. Please give this person some time.');
      await transaction`UPDATE connections SET requester_profile_id = ${me.id}::uuid, recipient_profile_id = ${target.id}::uuid, status = 'PENDING', blocked_by_profile_id = NULL, responded_at = NULL, updated_at = now() WHERE id = ${connection.id}::uuid`;
      return { status: 'REQUEST_SENT' as const, connectionId: connection.id, target };
    });
    await activity(result.target.id, me.id, result.connectionId, result.status === 'CONNECTED' ? 'CONNECTION_ACCEPTED' : 'CONNECTION_REQUESTED');
    return { status: result.status, person: minimalProfile({ displayName: result.target.displayName, handle: result.target.handle, image: null }) };
  });

export const respondConnection = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ requestId: requestIdInput, action: z.enum(['ACCEPT', 'IGNORE', 'BLOCK']) }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const { sql } = await import('@/db');
    const [connection] = await sql<{ id: string; requesterProfileId: string; lowProfileId: string; highProfileId: string }[]>`
      SELECT id::text AS id, requester_profile_id::text AS "requesterProfileId", low_profile_id::text AS "lowProfileId", high_profile_id::text AS "highProfileId"
      FROM connections WHERE id = ${data.requestId}::uuid AND recipient_profile_id = ${me.id}::uuid AND status = 'PENDING'
    `;
    if (!connection) throw new Error('This request is no longer available.');
    const status = data.action === 'ACCEPT' ? 'ACCEPTED' : data.action === 'BLOCK' ? 'BLOCKED' : 'DECLINED';
    await sql.begin(async (transaction) => {
      await transaction`UPDATE connections SET status = ${status}, blocked_by_profile_id = ${data.action === 'BLOCK' ? me.id : null}::uuid, responded_at = now(), updated_at = now() WHERE id = ${connection.id}::uuid AND recipient_profile_id = ${me.id}::uuid`;
      if (status === 'ACCEPTED') await transaction`INSERT INTO connection_permissions (connection_id) VALUES (${connection.id}::uuid) ON CONFLICT DO NOTHING`;
      if (status === 'BLOCKED') {
        await transaction`DELETE FROM connection_permissions WHERE connection_id = ${connection.id}::uuid`;
        await transaction`DELETE FROM social_activities WHERE connection_id = ${connection.id}::uuid`;
      }
    });
    if (status === 'ACCEPTED') await activity(connection.requesterProfileId, me.id, connection.id, 'CONNECTION_ACCEPTED');
    return { status };
  });

export const changeConnection = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ handle: handleInput, action: z.enum(['REMOVE', 'BLOCK']) }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const targetHandle = normalizeHandle(data.handle).normalized;
    const { sql } = await import('@/db');
    const [connection] = await sql<{ id: string }[]>`
      SELECT connection.id::text AS id FROM connections connection
      JOIN profiles target ON target.id = CASE WHEN connection.low_profile_id = ${me.id}::uuid THEN connection.high_profile_id ELSE connection.low_profile_id END
      WHERE ${me.id}::uuid IN (connection.low_profile_id, connection.high_profile_id) AND target.handle_normalized = ${targetHandle} AND connection.status <> 'BLOCKED'
    `;
    if (!connection) throw new Error('That connection is not available.');
    const status = data.action === 'BLOCK' ? 'BLOCKED' : 'DECLINED';
    await sql.begin(async (transaction) => {
      await transaction`UPDATE connections SET status = ${status}, blocked_by_profile_id = ${data.action === 'BLOCK' ? me.id : null}::uuid, responded_at = now(), updated_at = now() WHERE id = ${connection.id}::uuid`;
      await transaction`DELETE FROM connection_permissions WHERE connection_id = ${connection.id}::uuid`;
      await transaction`DELETE FROM social_activities WHERE connection_id = ${connection.id}::uuid`;
    });
    return { status };
  });

async function connectionWithHandle(myProfileId: string, handle: string) {
  const normalized = normalizeHandle(handle).normalized;
  const { sql } = await import('@/db');
  const [row] = await sql<Array<{
    id: string; lowProfileId: string; highProfileId: string; status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'BLOCKED';
    otherProfileId: string; otherDisplayName: string | null; otherHandle: string; otherImage: string | null;
    lowCompareAllowed: boolean; highCompareAllowed: boolean; lowAtlasShared: boolean; highAtlasShared: boolean;
    lowExternalShareAllowed: boolean; highExternalShareAllowed: boolean;
  }>>`
    SELECT connection.id::text AS id, connection.low_profile_id::text AS "lowProfileId", connection.high_profile_id::text AS "highProfileId", connection.status,
      other.id::text AS "otherProfileId", other.display_name AS "otherDisplayName", other.handle AS "otherHandle", account_user.image AS "otherImage",
      COALESCE(permission.low_compare_allowed, false) AS "lowCompareAllowed", COALESCE(permission.high_compare_allowed, false) AS "highCompareAllowed",
      COALESCE(permission.low_atlas_shared, false) AS "lowAtlasShared", COALESCE(permission.high_atlas_shared, false) AS "highAtlasShared",
      COALESCE(permission.low_external_share_allowed, false) AS "lowExternalShareAllowed", COALESCE(permission.high_external_share_allowed, false) AS "highExternalShareAllowed"
    FROM connections connection
    JOIN profiles other ON other.id = CASE WHEN connection.low_profile_id = ${myProfileId}::uuid THEN connection.high_profile_id ELSE connection.low_profile_id END
    JOIN users account_user ON account_user.id = other.user_id
    LEFT JOIN connection_permissions permission ON permission.connection_id = connection.id
    WHERE ${myProfileId}::uuid IN (connection.low_profile_id, connection.high_profile_id) AND other.handle_normalized = ${normalized}
  `;
  return row;
}

export const setPairPermission = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ handle: handleInput, permission: permissionInput, allowed: z.boolean() }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const connection = await connectionWithHandle(me.id, data.handle);
    if (!connection || connection.status !== 'ACCEPTED') throw new Error('Only connected people can change path permissions.');
    const mineIsLow = connection.lowProfileId === me.id;
    const { sql } = await import('@/db');
    await sql`INSERT INTO connection_permissions (connection_id) VALUES (${connection.id}::uuid) ON CONFLICT DO NOTHING`;
    if (data.permission === 'COMPARE' && mineIsLow) await sql`UPDATE connection_permissions SET low_compare_allowed = ${data.allowed}, updated_at = now() WHERE connection_id = ${connection.id}::uuid`;
    if (data.permission === 'COMPARE' && !mineIsLow) await sql`UPDATE connection_permissions SET high_compare_allowed = ${data.allowed}, updated_at = now() WHERE connection_id = ${connection.id}::uuid`;
    if (data.permission === 'ATLAS' && mineIsLow) await sql`UPDATE connection_permissions SET low_atlas_shared = ${data.allowed}, updated_at = now() WHERE connection_id = ${connection.id}::uuid`;
    if (data.permission === 'ATLAS' && !mineIsLow) await sql`UPDATE connection_permissions SET high_atlas_shared = ${data.allowed}, updated_at = now() WHERE connection_id = ${connection.id}::uuid`;
    if (data.permission === 'EXTERNAL_SHARE' && mineIsLow) await sql`UPDATE connection_permissions SET low_external_share_allowed = ${data.allowed}, updated_at = now() WHERE connection_id = ${connection.id}::uuid`;
    if (data.permission === 'EXTERNAL_SHARE' && !mineIsLow) await sql`UPDATE connection_permissions SET high_external_share_allowed = ${data.allowed}, updated_at = now() WHERE connection_id = ${connection.id}::uuid`;
    if (data.allowed && data.permission === 'COMPARE') await activity(connection.otherProfileId, me.id, connection.id, 'COMPARISON_REQUESTED');
    if (data.allowed && data.permission === 'ATLAS') await activity(connection.otherProfileId, me.id, connection.id, 'ATLAS_SHARED');
    return { allowed: data.allowed };
  });

async function comparisonChapters(profileId: string) {
  const { sql } = await import('@/db');
  return sql<ComparisonChapter[]>`
    SELECT city.id AS "cityId", city.name AS city, country.name AS country, country.code AS "countryCode",
      city.latitude, city.longitude, COALESCE(chapter.arrival_year, 1900) AS "fromYear", chapter.end_year AS "toYear"
    FROM life_trails trail
    JOIN life_chapters chapter ON chapter.trail_id = trail.id
    JOIN cities city ON city.id = chapter.city_id
    JOIN countries country ON country.code = city.country_code
    WHERE trail.profile_id = ${profileId}::uuid
      AND trail.id = (SELECT id FROM life_trails WHERE profile_id = ${profileId}::uuid ORDER BY updated_at DESC LIMIT 1)
    ORDER BY chapter.position
  `;
}

async function fullTrail(profileId: string) {
  const { sql } = await import('@/db');
  const chapters = await sql<Array<{
    chapterId: string; position: number; arrivalYear: number | null; endYear: number | null; reason: string;
    cityId: number; city: string; country: string; countryCode: string; latitude: number; longitude: number;
  }>>`
    SELECT chapter.id::text AS "chapterId", chapter.position, chapter.arrival_year AS "arrivalYear", chapter.end_year AS "endYear", chapter.reason,
      city.id AS "cityId", city.name AS city, country.name AS country, country.code AS "countryCode", city.latitude, city.longitude
    FROM life_trails trail
    JOIN life_chapters chapter ON chapter.trail_id = trail.id
    JOIN cities city ON city.id = chapter.city_id JOIN countries country ON country.code = city.country_code
    WHERE trail.profile_id = ${profileId}::uuid
      AND trail.id = (SELECT id FROM life_trails WHERE profile_id = ${profileId}::uuid ORDER BY updated_at DESC LIMIT 1)
    ORDER BY chapter.position
  `;
  if (!chapters.length) return [];
  return chapters.map((chapter) => ({
      id: String(chapter.cityId), chapterId: chapter.chapterId, city: chapter.city, country: chapter.country, countryCode: chapter.countryCode,
      latitude: chapter.latitude, longitude: chapter.longitude, arrivalYear: chapter.arrivalYear ?? undefined, endYear: chapter.endYear,
      reason: chapter.reason,
    }));
}

export const getOurPaths = createServerFn({ method: 'GET' })
  .validator((value: unknown) => z.object({ handle: handleInput }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const connection = await connectionWithHandle(me.id, data.handle);
    if (!connection || connection.status !== 'ACCEPTED') throw new Error('Our Paths is available only between connected people.');
    const requesterIsLow = connection.lowProfileId === me.id;
    const access = pairAccess({ requesterIsLow, ...connection });
    const base = {
      me: { displayName: me.displayName || me.handle!, handle: me.handle! },
      other: minimalProfile({ displayName: connection.otherDisplayName, handle: connection.otherHandle, image: connection.otherImage }),
      permissions: {
        compareMine: requesterIsLow ? connection.lowCompareAllowed : connection.highCompareAllowed,
        compareTheirs: requesterIsLow ? connection.highCompareAllowed : connection.lowCompareAllowed,
        atlasMine: requesterIsLow ? connection.lowAtlasShared : connection.highAtlasShared,
        atlasTheirs: requesterIsLow ? connection.highAtlasShared : connection.lowAtlasShared,
        externalMine: requesterIsLow ? connection.lowExternalShareAllowed : connection.highExternalShareAllowed,
        externalTheirs: requesterIsLow ? connection.highExternalShareAllowed : connection.lowExternalShareAllowed,
        compareAllowed: access.compareAllowed,
        fullComparisonAllowed: access.fullComparisonAllowed,
        canViewOtherFullAtlas: access.canViewOtherFullAtlas,
        externalShareAllowed: access.externalShareAllowed,
      },
    };
    const theirSharedTrail = access.canViewOtherFullAtlas ? await fullTrail(connection.otherProfileId) : null;
    if (!access.compareAllowed) return { ...base, discoveries: [], mineTrail: null, theirTrail: theirSharedTrail, moments: [] };
    const [mineChapters, theirChapters] = await Promise.all([comparisonChapters(me.id), comparisonChapters(connection.otherProfileId)]);
    const discoveries = deriveSharedDiscoveries(mineChapters, theirChapters);
    const { sql } = await import('@/db');
    const moments = await sql<Array<{ id: string; city: string; yearFrom: number | null; yearTo: number | null; title: string | null; memory: string | null; status: 'PENDING' | 'CONFIRMED' | 'DECLINED'; mineVisible: boolean; theirVisible: boolean }>>`
      SELECT moment.id::text AS id, moment.city_name AS city, moment.year_from AS "yearFrom", moment.year_to AS "yearTo", moment.title, moment.memory_body AS memory, moment.status,
        CASE WHEN ${requesterIsLow} THEN moment.low_profile_visible ELSE moment.high_profile_visible END AS "mineVisible",
        CASE WHEN ${requesterIsLow} THEN moment.high_profile_visible ELSE moment.low_profile_visible END AS "theirVisible"
      FROM shared_moments moment WHERE moment.connection_id = ${connection.id}::uuid AND moment.status <> 'DECLINED' ORDER BY moment.year_from, moment.created_at
    `;
    const [mineTrail, theirTrail] = access.fullComparisonAllowed ? await Promise.all([fullTrail(me.id), Promise.resolve(theirSharedTrail ?? await fullTrail(connection.otherProfileId))]) : [null, theirSharedTrail];
    return { ...base, discoveries, mineTrail, theirTrail, moments };
  });

// Share payloads are minted independently from the on-screen comparison. This
// prevents a stale client from exporting after either person revokes consent.
export const getOurPathsShareData = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ handle: handleInput }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    await rateLimit(me.id, 'OUR_PATHS_SHARE', 30);
    const connection = await connectionWithHandle(me.id, data.handle);
    if (!connection || connection.status !== 'ACCEPTED') throw new Error('Our Paths sharing is available only between connected people.');
    const requesterIsLow = connection.lowProfileId === me.id;
    const access = pairAccess({ requesterIsLow, ...connection });
    if (!access.externalShareAllowed) throw new Error('Both people must allow external sharing before an Our Paths card can be created.');
    const [mineChapters, theirChapters] = await Promise.all([comparisonChapters(me.id), comparisonChapters(connection.otherProfileId)]);
    const discoveries = deriveSharedDiscoveries(mineChapters, theirChapters);
    const [mineTrail, theirTrail] = access.fullComparisonAllowed
      ? await Promise.all([fullTrail(me.id), fullTrail(connection.otherProfileId)])
      : [[], []];
    const safeStop = (stop: Awaited<ReturnType<typeof fullTrail>>[number]) => ({
      id: stop.id, city: stop.city, country: stop.country, countryCode: stop.countryCode,
      latitude: stop.latitude, longitude: stop.longitude,
    });
    return {
      mineName: me.displayName || me.handle!,
      otherName: connection.otherDisplayName || connection.otherHandle,
      mineTrail: mineTrail.map(safeStop),
      theirTrail: theirTrail.map(safeStop),
      sharedPlaces: discoveries.map((place) => ({
        city: place.city, country: place.country, latitude: place.latitude, longitude: place.longitude,
        overlapFrom: place.overlapFrom, overlapTo: place.overlapTo,
      })),
    };
  });

const addChapterPersonInput = z.object({ chapterId: z.string().uuid(), handle: handleInput.optional(), placeholderName: z.string().trim().min(1).max(80).optional() }).refine((value) => Boolean(value.handle) !== Boolean(value.placeholderName), 'Choose a Life Atlas person or add a private placeholder.');

export const addChapterPerson = createServerFn({ method: 'POST' })
  .validator((value: unknown) => addChapterPersonInput.parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    await rateLimit(me.id, 'CHAPTER_PERSON', 60);
    const { sql } = await import('@/db');
    const [chapter] = await sql<{ id: string }[]>`
      SELECT chapter.id::text AS id FROM life_chapters chapter JOIN life_trails trail ON trail.id = chapter.trail_id
      WHERE chapter.id = ${data.chapterId}::uuid AND trail.profile_id = ${me.id}::uuid
    `;
    if (!chapter) throw new Error('That chapter is not available.');
    if (data.placeholderName) {
      const [person] = await sql<{ id: string; name: string; status: string }[]>`
        INSERT INTO chapter_people (life_chapter_id, owner_profile_id, placeholder_name, status)
        VALUES (${chapter.id}::uuid, ${me.id}::uuid, ${data.placeholderName}, 'PLACEHOLDER')
        RETURNING id::text AS id, placeholder_name AS name, status
      `;
      if (!person) throw new Error('The private placeholder could not be added.');
      return { person };
    }
    const normalized = normalizeHandle(data.handle!).normalized;
    const [target] = await sql<{ id: string; displayName: string | null; handle: string; discoverability: string; connected: boolean }[]>`
      SELECT target.id::text AS id, target.display_name AS "displayName", target.handle, target.discoverability,
        EXISTS(SELECT 1 FROM connections WHERE status = 'ACCEPTED' AND low_profile_id = LEAST(target.id, ${me.id}::uuid) AND high_profile_id = GREATEST(target.id, ${me.id}::uuid)) AS connected
      FROM profiles target WHERE target.handle_normalized = ${normalized}
    `;
    if (!target || target.id === me.id || (target.discoverability === 'HIDDEN' && !target.connected)) throw new Error('That Life Atlas profile is not available.');
    const [person] = await sql<{ id: string; status: string }[]>`
      INSERT INTO chapter_people (life_chapter_id, owner_profile_id, target_profile_id, status)
      VALUES (${chapter.id}::uuid, ${me.id}::uuid, ${target.id}::uuid, 'PENDING')
      ON CONFLICT (life_chapter_id, target_profile_id) DO UPDATE SET status = 'PENDING', responded_at = NULL, updated_at = now()
      RETURNING id::text AS id, status
    `;
    if (!person) throw new Error('The chapter association could not be requested.');
    await activity(target.id, me.id, null, 'CHAPTER_TAG_REQUESTED', { chapterPersonId: person.id });
    return { person: { ...person, name: target.displayName || target.handle } };
  });

export const getChapterPeople = createServerFn({ method: 'GET' })
  .validator((value: unknown) => z.object({ chapterId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const { sql } = await import('@/db');
    const people = await sql<Array<{ id: string; name: string; handle: string | null; status: string; placeholder: boolean }>>`
      SELECT person.id::text AS id, COALESCE(target.display_name, person.placeholder_name, target.handle) AS name, target.handle, person.status, person.target_profile_id IS NULL AS placeholder
      FROM chapter_people person
      JOIN life_chapters chapter ON chapter.id = person.life_chapter_id JOIN life_trails trail ON trail.id = chapter.trail_id
      LEFT JOIN profiles target ON target.id = person.target_profile_id
      WHERE person.life_chapter_id = ${data.chapterId}::uuid AND trail.profile_id = ${me.id}::uuid ORDER BY person.created_at
    `;
    return { people };
  });

export const respondChapterTag = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ tagId: z.string().uuid(), action: z.enum(['CONFIRM', 'DECLINE']) }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const { sql } = await import('@/db');
    const [tag] = await sql<{ id: string; ownerProfileId: string }[]>`
      UPDATE chapter_people SET status = ${data.action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED'}, responded_at = now(), updated_at = now()
      WHERE id = ${data.tagId}::uuid AND target_profile_id = ${me.id}::uuid AND status = 'PENDING'
      RETURNING id::text AS id, owner_profile_id::text AS "ownerProfileId"
    `;
    if (!tag) throw new Error('That chapter request is no longer available.');
    if (data.action === 'CONFIRM') await activity(tag.ownerProfileId, me.id, null, 'CHAPTER_TAG_CONFIRMED', { chapterPersonId: tag.id });
    return { status: data.action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED' };
  });

const inviteInput = z.object({
  kind: z.enum(['CONNECTION', 'CHAPTER', 'COMPARE']),
  chapterPersonId: z.string().uuid().optional(),
  message: z.string().trim().max(240).optional(),
});

function inviteHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export const createSocialInvite = createServerFn({ method: 'POST' })
  .validator((value: unknown) => inviteInput.parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    await rateLimit(me.id, 'SOCIAL_INVITE', 20);
    const { sql } = await import('@/db');
    if (data.kind === 'CHAPTER') {
      if (!data.chapterPersonId) throw new Error('Choose the private chapter person to invite.');
      const [placeholder] = await sql<{ id: string }[]>`
        SELECT person.id::text AS id FROM chapter_people person
        WHERE person.id = ${data.chapterPersonId}::uuid AND person.owner_profile_id = ${me.id}::uuid AND person.status = 'PLACEHOLDER' AND person.target_profile_id IS NULL
      `;
      if (!placeholder) throw new Error('That private placeholder is not available.');
    }
    const token = randomBytes(32).toString('base64url');
    const [invite] = await sql<{ id: string; expiresAt: string }[]>`
      INSERT INTO social_invites (inviter_profile_id, token_hash, kind, chapter_person_id, message, expires_at)
      VALUES (${me.id}::uuid, ${inviteHash(token)}, ${data.kind}, ${data.chapterPersonId ?? null}::uuid, ${data.message ?? null}, now() + interval '30 days')
      RETURNING id::text AS id, expires_at::text AS "expiresAt"
    `;
    if (!invite) throw new Error('The invitation could not be created.');
    return { token, expiresAt: invite.expiresAt };
  });

export const getSocialInvite = createServerFn({ method: 'GET' })
  .validator((value: unknown) => z.object({ token: z.string().min(20).max(100) }).parse(value))
  .handler(async ({ data }) => {
    const { requireDatabase, sql } = await import('@/db');
    requireDatabase();
    const [invite] = await sql<{ kind: 'CONNECTION' | 'CHAPTER' | 'COMPARE'; message: string | null; inviterName: string | null; inviterHandle: string; placeholderName: string | null; expiresAt: string }[]>`
      SELECT invite.kind, invite.message, inviter.display_name AS "inviterName", inviter.handle AS "inviterHandle", person.placeholder_name AS "placeholderName", invite.expires_at::text AS "expiresAt"
      FROM social_invites invite JOIN profiles inviter ON inviter.id = invite.inviter_profile_id
      LEFT JOIN chapter_people person ON person.id = invite.chapter_person_id
      WHERE invite.token_hash = ${inviteHash(data.token)} AND invite.revoked_at IS NULL AND invite.claimed_at IS NULL AND invite.expires_at > now() AND inviter.handle IS NOT NULL
    `;
    if (!invite) return { invite: null };
    return { invite: { kind: invite.kind, message: invite.message, inviter: { displayName: invite.inviterName || invite.inviterHandle, handle: invite.inviterHandle }, context: invite.kind === 'CHAPTER' ? `${invite.inviterName || invite.inviterHandle} added you to a chapter of their Life Atlas.` : invite.kind === 'COMPARE' ? `${invite.inviterName || invite.inviterHandle} wants to see where your lives crossed.` : `${invite.inviterName || invite.inviterHandle} wants you in their Life Circle.`, expiresAt: invite.expiresAt } };
  });

export const claimSocialInvite = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ token: z.string().min(20).max(100) }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const { sql } = await import('@/db');
    const result = await sql.begin(async (transaction) => {
      const [invite] = await transaction<{ id: string; inviterProfileId: string; kind: 'CONNECTION' | 'CHAPTER' | 'COMPARE'; chapterPersonId: string | null }[]>`
        SELECT id::text AS id, inviter_profile_id::text AS "inviterProfileId", kind, chapter_person_id::text AS "chapterPersonId"
        FROM social_invites WHERE token_hash = ${inviteHash(data.token)} AND revoked_at IS NULL AND claimed_at IS NULL AND expires_at > now() FOR UPDATE
      `;
      if (!invite || invite.inviterProfileId === me.id) throw new Error('This invitation is not available.');
      await transaction`UPDATE social_invites SET claimed_by_profile_id = ${me.id}::uuid, claimed_at = now() WHERE id = ${invite.id}::uuid`;
      if (invite.kind === 'CHAPTER' && invite.chapterPersonId) {
        const [claimed] = await transaction<{ id: string }[]>`
          UPDATE chapter_people SET target_profile_id = ${me.id}::uuid, placeholder_name = NULL, status = 'CONFIRMED', responded_at = now(), updated_at = now()
          WHERE id = ${invite.chapterPersonId}::uuid AND target_profile_id IS NULL AND status = 'PLACEHOLDER' RETURNING id::text AS id
        `;
        if (!claimed) throw new Error('This chapter invitation was already claimed.');
      }
      if (invite.kind !== 'CHAPTER') {
        const [lowId, highId] = canonicalPair(me.id, invite.inviterProfileId);
        const [connection] = await transaction<{ id: string; lowProfileId: string }[]>`
          INSERT INTO connections (low_profile_id, high_profile_id, requester_profile_id, recipient_profile_id, status, responded_at)
          VALUES (${lowId}::uuid, ${highId}::uuid, ${invite.inviterProfileId}::uuid, ${me.id}::uuid, 'ACCEPTED', now())
          ON CONFLICT (low_profile_id, high_profile_id) DO UPDATE SET status = CASE WHEN connections.status = 'BLOCKED' THEN connections.status ELSE 'ACCEPTED'::connection_status END, responded_at = CASE WHEN connections.status = 'BLOCKED' THEN connections.responded_at ELSE now() END, updated_at = now()
          RETURNING id::text AS id, low_profile_id::text AS "lowProfileId"
        `;
        if (!connection) throw new Error('The invitation could not establish a connection.');
        const [blocked] = await transaction<{ blocked: boolean }[]>`SELECT status = 'BLOCKED' AS blocked FROM connections WHERE id = ${connection.id}::uuid`;
        if (blocked?.blocked) throw new Error('This invitation is not available.');
        await transaction`INSERT INTO connection_permissions (connection_id) VALUES (${connection.id}::uuid) ON CONFLICT DO NOTHING`;
        if (invite.kind === 'COMPARE') {
          if (connection.lowProfileId === invite.inviterProfileId) await transaction`UPDATE connection_permissions SET low_compare_allowed = true, updated_at = now() WHERE connection_id = ${connection.id}::uuid`;
          else await transaction`UPDATE connection_permissions SET high_compare_allowed = true, updated_at = now() WHERE connection_id = ${connection.id}::uuid`;
        }
      }
      return invite;
    });
    await activity(result.inviterProfileId, me.id, null, result.kind === 'CHAPTER' ? 'CHAPTER_INVITE_CLAIMED' : 'INVITE_CLAIMED');
    return { claimed: true, kind: result.kind };
  });

export const revokeSocialInvite = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ inviteId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const { sql } = await import('@/db');
    const [revoked] = await sql<{ id: string }[]>`UPDATE social_invites SET revoked_at = now() WHERE id = ${data.inviteId}::uuid AND inviter_profile_id = ${me.id}::uuid AND claimed_at IS NULL RETURNING id::text AS id`;
    if (!revoked) throw new Error('That invitation is not available.');
    return { revoked: true };
  });

const sharedMomentInput = z.object({ handle: handleInput, city: z.string().trim().min(1).max(120), yearFrom: z.number().int().min(1900).max(2100).nullable(), yearTo: z.number().int().min(1900).max(2100).nullable(), title: z.string().trim().max(120).optional(), memory: z.string().trim().max(1000).optional() });

export const proposeSharedMoment = createServerFn({ method: 'POST' })
  .validator((value: unknown) => sharedMomentInput.parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const connection = await connectionWithHandle(me.id, data.handle);
    if (!connection || connection.status !== 'ACCEPTED') throw new Error('Only connected people can confirm a shared moment.');
    const access = pairAccess({ requesterIsLow: connection.lowProfileId === me.id, ...connection });
    if (!access.compareAllowed) throw new Error('Both people must allow Our Paths before confirming a shared moment.');
    const [mine, theirs] = await Promise.all([comparisonChapters(me.id), comparisonChapters(connection.otherProfileId)]);
    const discovery = deriveSharedDiscoveries(mine, theirs).find((item) => item.city.toLowerCase() === data.city.toLowerCase() && item.overlapFrom === data.yearFrom && item.overlapTo === data.yearTo);
    if (!discovery || discovery.sameCityDifferentTimes) throw new Error('That shared-city overlap could not be verified.');
    const { sql } = await import('@/db');
    const [moment] = await sql<{ id: string }[]>`
      INSERT INTO shared_moments (connection_id, proposed_by_profile_id, city_name, year_from, year_to, title, memory_body, status)
      VALUES (${connection.id}::uuid, ${me.id}::uuid, ${discovery.city}, ${discovery.overlapFrom}, ${discovery.overlapTo}, ${data.title ?? null}, ${data.memory ?? null}, 'PENDING')
      RETURNING id::text AS id
    `;
    if (!moment) throw new Error('The shared moment could not be proposed.');
    await activity(connection.otherProfileId, me.id, connection.id, 'SHARED_MOMENT_PROPOSED', { sharedMomentId: moment.id, city: discovery.city });
    return { momentId: moment.id, status: 'PENDING' as const };
  });

export const respondSharedMoment = createServerFn({ method: 'POST' })
  .validator((value: unknown) => z.object({ momentId: z.string().uuid(), action: z.enum(['CONFIRM', 'DECLINE']), showOnMyAtlas: z.boolean().default(false) }).parse(value))
  .handler(async ({ data }) => {
    const me = await requireSocialProfile();
    const { sql } = await import('@/db');
    const [moment] = await sql<{ id: string; connectionId: string; proposedByProfileId: string; lowProfileId: string }[]>`
      SELECT moment.id::text AS id, moment.connection_id::text AS "connectionId", moment.proposed_by_profile_id::text AS "proposedByProfileId", connection.low_profile_id::text AS "lowProfileId"
      FROM shared_moments moment JOIN connections connection ON connection.id = moment.connection_id
      WHERE moment.id = ${data.momentId}::uuid AND moment.status = 'PENDING' AND moment.proposed_by_profile_id <> ${me.id}::uuid AND ${me.id}::uuid IN (connection.low_profile_id, connection.high_profile_id) AND connection.status = 'ACCEPTED'
    `;
    if (!moment) throw new Error('That shared moment is no longer available.');
    const status = data.action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED';
    if (moment.lowProfileId === me.id) await sql`UPDATE shared_moments SET status = ${status}, low_profile_visible = ${status === 'CONFIRMED' && data.showOnMyAtlas}, responded_at = now(), updated_at = now() WHERE id = ${moment.id}::uuid`;
    else await sql`UPDATE shared_moments SET status = ${status}, high_profile_visible = ${status === 'CONFIRMED' && data.showOnMyAtlas}, responded_at = now(), updated_at = now() WHERE id = ${moment.id}::uuid`;
    if (status === 'CONFIRMED') await activity(moment.proposedByProfileId, me.id, moment.connectionId, 'SHARED_MOMENT_CONFIRMED', { sharedMomentId: moment.id });
    return { status };
  });
