import { randomUUID } from "node:crypto";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, idle_timeout: 10, connect_timeout: 10 });

function pair(first, second) {
  return first.localeCompare(second) < 0 ? [first, second] : [second, first];
}

function planIndexes(node, found = new Set()) {
  if (node["Index Name"]) found.add(node["Index Name"]);
  for (const child of node.Plans ?? []) planIndexes(child, found);
  return [...found];
}

const tables = await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('connections', 'connection_permissions', 'chapter_people', 'social_invites', 'shared_moments', 'social_activities', 'social_rate_limits')
  ORDER BY table_name
`;
const constraints = await sql`
  SELECT conname FROM pg_constraint
  WHERE conname IN ('connections_participants_check', 'connections_blocker_check', 'connections_canonical_order_check')
  ORDER BY conname
`;
const indexes = await sql`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' AND indexname IN ('connections_canonical_pair_idx', 'profiles_handle_normalized_idx', 'connections_low_status_idx', 'connections_high_status_idx', 'connections_recipient_status_idx')
  ORDER BY indexname
`;

const connection = await sql.reserve();
const suffix = randomUUID().slice(0, 8);
const people = ["mridul", "rohan", "priya", "ankit", "blocked"];

try {
  await connection.unsafe("BEGIN");
  const profiles = {};
  for (const name of people) {
    const userId = `social-proof-${name}-${suffix}`;
    await connection`
      INSERT INTO users (id, name, email, email_verified)
      VALUES (${userId}, ${name[0].toUpperCase() + name.slice(1)}, ${`${userId}@example.invalid`}, true)
    `;
    const [profile] = await connection`
      INSERT INTO profiles (user_id, display_name, handle, handle_normalized, discoverability)
      VALUES (${userId}, ${name[0].toUpperCase() + name.slice(1)}, ${`${name}_${suffix}`}, ${`${name}_${suffix}`}, 'DISCOVERABLE')
      RETURNING id::text AS id
    `;
    profiles[name] = profile.id;
  }

  async function connect(first, second, status = "ACCEPTED") {
    const [low, high] = pair(profiles[first], profiles[second]);
    const [row] = await connection`
      INSERT INTO connections (low_profile_id, high_profile_id, requester_profile_id, recipient_profile_id, status, responded_at)
      VALUES (${low}::uuid, ${high}::uuid, ${profiles[first]}::uuid, ${profiles[second]}::uuid, ${status}::connection_status, CASE WHEN ${status} = 'ACCEPTED' THEN now() END)
      RETURNING id::text AS id
    `;
    if (status === "ACCEPTED") await connection`INSERT INTO connection_permissions (connection_id) VALUES (${row.id}::uuid)`;
    return row.id;
  }

  await connect("mridul", "rohan");
  await connect("mridul", "ankit");
  await connect("rohan", "priya");
  await connect("rohan", "ankit");
  await connect("priya", "ankit");
  const blockedConnection = await connect("mridul", "blocked", "BLOCKED");

  const mutual = await connection`
    WITH my_friends AS (
      SELECT CASE WHEN low_profile_id = ${profiles.mridul}::uuid THEN high_profile_id ELSE low_profile_id END AS friend_id
      FROM connections WHERE status = 'ACCEPTED' AND (${profiles.mridul}::uuid IN (low_profile_id, high_profile_id))
    ), candidate_friends AS (
      SELECT CASE WHEN low_profile_id = ${profiles.priya}::uuid THEN high_profile_id ELSE low_profile_id END AS friend_id
      FROM connections WHERE status = 'ACCEPTED' AND (${profiles.priya}::uuid IN (low_profile_id, high_profile_id))
    )
    SELECT count(*)::int AS count FROM my_friends JOIN candidate_friends USING (friend_id)
  `;

  await connection.unsafe("SET LOCAL enable_seqscan = off");
  const [explain] = await connection`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    WITH my_friends AS (
      SELECT CASE WHEN low_profile_id = ${profiles.mridul}::uuid THEN high_profile_id ELSE low_profile_id END AS friend_id
      FROM connections WHERE status = 'ACCEPTED' AND (${profiles.mridul}::uuid IN (low_profile_id, high_profile_id))
    ), second_degree AS (
      SELECT CASE WHEN candidate.low_profile_id = mine.friend_id THEN candidate.high_profile_id ELSE candidate.low_profile_id END AS candidate_id,
        count(DISTINCT mine.friend_id)::int AS mutual_count
      FROM my_friends mine
      JOIN connections candidate ON candidate.status = 'ACCEPTED' AND mine.friend_id IN (candidate.low_profile_id, candidate.high_profile_id)
      GROUP BY candidate_id
    )
    SELECT profile.handle, second_degree.mutual_count
    FROM second_degree JOIN profiles profile ON profile.id = second_degree.candidate_id
    LEFT JOIN connections existing ON existing.low_profile_id = LEAST(profile.id, ${profiles.mridul}::uuid) AND existing.high_profile_id = GREATEST(profile.id, ${profiles.mridul}::uuid)
    WHERE second_degree.candidate_id <> ${profiles.mridul}::uuid AND profile.discoverability = 'DISCOVERABLE' AND existing.id IS NULL
    ORDER BY second_degree.mutual_count DESC LIMIT 12
  `;
  const plan = explain["QUERY PLAN"][0];

  const pendingId = await connect("rohan", "blocked", "PENDING");
  const unauthorizedResponse = await connection`
    UPDATE connections SET status = 'ACCEPTED'
    WHERE id = ${pendingId}::uuid AND recipient_profile_id = ${profiles.mridul}::uuid AND status = 'PENDING'
    RETURNING id
  `;

  const [invite] = await connection`
    INSERT INTO social_invites (inviter_profile_id, token_hash, kind, expires_at)
    VALUES (${profiles.rohan}::uuid, ${`proof-${suffix}`}, 'CONNECTION', now() + interval '1 day') RETURNING id::text AS id
  `;
  const unauthorizedInviteRevoke = await connection`
    UPDATE social_invites SET revoked_at = now()
    WHERE id = ${invite.id}::uuid AND inviter_profile_id = ${profiles.mridul}::uuid RETURNING id
  `;

  const [city] = await connection`SELECT id FROM cities WHERE name = 'Bengaluru' ORDER BY population DESC LIMIT 1`;
  const [otherCity] = await connection`SELECT id FROM cities WHERE name = 'Delhi' ORDER BY population DESC LIMIT 1`;
  const [trail] = await connection`
    INSERT INTO life_trails (profile_id, client_draft_id, visibility)
    VALUES (${profiles.rohan}::uuid, ${randomUUID()}::uuid, 'PRIVATE') RETURNING id::text AS id
  `;
  const [chapter] = await connection`
    INSERT INTO movement_chapters (trail_id, from_city_id, to_city_id, move_year, reason, position, title, memory_body)
    VALUES (${trail.id}::uuid, ${otherCity.id}, ${city.id}, 2022, 'Career', 0, 'Private chapter', 'Never expose this memory')
    RETURNING id::text AS id
  `;
  const unauthorizedTrailRead = await connection`
    SELECT trail.id FROM life_trails trail JOIN profiles owner ON owner.id = trail.profile_id
    WHERE trail.id = ${trail.id}::uuid AND owner.id = ${profiles.mridul}::uuid
  `;
  const unauthorizedChapterMutation = await connection`
    UPDATE movement_chapters chapter SET title = 'tampered'
    FROM life_trails trail WHERE chapter.id = ${chapter.id}::uuid AND trail.id = chapter.trail_id AND trail.profile_id = ${profiles.mridul}::uuid
    RETURNING chapter.id
  `;
  const [media] = await connection`
    INSERT INTO chapter_media (movement_chapter_id, storage_key, mime_type, width, height)
    VALUES (${chapter.id}::uuid, ${`proof/${suffix}.webp`}, 'image/webp', 1200, 800) RETURNING id::text AS id
  `;
  const unauthorizedMediaRead = await connection`
    SELECT media.id FROM chapter_media media
    JOIN movement_chapters media_chapter ON media_chapter.id = media.movement_chapter_id
    JOIN life_trails media_trail ON media_trail.id = media_chapter.trail_id
    WHERE media.id = ${media.id}::uuid AND media_trail.profile_id = ${profiles.mridul}::uuid
  `;
  const guessedShareToken = await connection`
    SELECT id FROM life_trails WHERE share_token = ${`guessed-${suffix}`} AND visibility IN ('UNLISTED', 'PUBLIC')
  `;
  const unauthorizedComparisonMutation = await connection`
    UPDATE connection_permissions permission SET low_compare_allowed = true
    FROM connections relationship
    WHERE permission.connection_id = relationship.id
      AND relationship.id = (SELECT id FROM connections WHERE low_profile_id = LEAST(${profiles.mridul}::uuid, ${profiles.rohan}::uuid) AND high_profile_id = GREATEST(${profiles.mridul}::uuid, ${profiles.rohan}::uuid))
      AND ${profiles.blocked}::uuid IN (relationship.low_profile_id, relationship.high_profile_id)
    RETURNING permission.connection_id
  `;

  const [moment] = await connection`
    INSERT INTO shared_moments (connection_id, proposed_by_profile_id, city_name, year_from, year_to)
    VALUES ((SELECT id FROM connections WHERE low_profile_id = LEAST(${profiles.mridul}::uuid, ${profiles.rohan}::uuid) AND high_profile_id = GREATEST(${profiles.mridul}::uuid, ${profiles.rohan}::uuid)), ${profiles.mridul}::uuid, 'Bengaluru', 2022, 2024)
    RETURNING id::text AS id
  `;
  const unauthorizedMomentResponse = await connection`
    UPDATE shared_moments moment SET status = 'CONFIRMED'
    FROM connections relationship
    WHERE moment.id = ${moment.id}::uuid AND relationship.id = moment.connection_id
      AND ${profiles.blocked}::uuid IN (relationship.low_profile_id, relationship.high_profile_id)
    RETURNING moment.id
  `;

  const blockedVisible = await connection`
    SELECT id FROM connections WHERE id = ${blockedConnection}::uuid AND status = 'ACCEPTED'
  `;

  console.log(JSON.stringify({
    migration: {
      tables: tables.map((row) => row.table_name),
      constraints: constraints.map((row) => row.conname),
      indexes: indexes.map((row) => row.indexname),
    },
    socialGraph: {
      mridulPriyaMutualConnections: mutual[0].count,
      suggestionPlanExecutionMs: plan["Execution Time"],
      suggestionPlanIndexes: planIndexes(plan.Plan),
    },
    objectAuthorization: {
      changedConnectionIdRejected: unauthorizedResponse.length === 0,
      changedInviteIdRejected: unauthorizedInviteRevoke.length === 0,
      privateTrailIdRejected: unauthorizedTrailRead.length === 0,
      changedChapterIdRejected: unauthorizedChapterMutation.length === 0,
      changedMediaIdRejected: unauthorizedMediaRead.length === 0,
      guessedShareTokenRejected: guessedShareToken.length === 0,
      changedComparisonIdRejected: unauthorizedComparisonMutation.length === 0,
      changedSharedMomentIdRejected: unauthorizedMomentResponse.length === 0,
      blockedRelationshipUnavailable: blockedVisible.length === 0,
    },
    transaction: "rolled back; no fixture data persisted",
  }, null, 2));
} finally {
  await connection.unsafe("ROLLBACK").catch(() => {});
  connection.release();
  await sql.end();
}
