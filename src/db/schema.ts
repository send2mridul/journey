import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const visibilityEnum = pgEnum('chapter_visibility', ['PUBLIC', 'ANONYMOUS', 'PRIVATE']);
export const storyVisibilityEnum = pgEnum('story_visibility', ['PRIVATE', 'UNLISTED', 'PUBLIC']);
export const profileDiscoverabilityEnum = pgEnum('profile_discoverability', ['DISCOVERABLE', 'LIMITED', 'HIDDEN']);
export const friendListVisibilityEnum = pgEnum('friend_list_visibility', ['ONLY_ME', 'FRIENDS']);
export const connectionStatusEnum = pgEnum('connection_status', ['PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED']);
export const chapterPersonStatusEnum = pgEnum('chapter_person_status', ['PLACEHOLDER', 'PENDING', 'CONFIRMED', 'DECLINED']);
export const socialInviteKindEnum = pgEnum('social_invite_kind', ['CONNECTION', 'CHAPTER', 'COMPARE']);
export const sharedMomentStatusEnum = pgEnum('shared_moment_status', ['PENDING', 'CONFIRMED', 'DECLINED']);

export const user = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('sessions_user_idx').on(table.userId)]);

export const account = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('accounts_user_idx').on(table.userId),
  uniqueIndex('accounts_provider_account_idx').on(table.providerId, table.accountId),
]);

export const verification = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('verifications_identifier_idx').on(table.identifier)]);

export const guestSaveHandoffs = pgTable('guest_save_handoffs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  draft: jsonb('draft').$type<Record<string, unknown>>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('guest_save_handoffs_expiry_idx').on(table.expiresAt)]);

export const countries = pgTable('countries', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
});

export const states = pgTable('states', {
  id: integer('id').primaryKey(),
  countryCode: text('country_code').notNull().references(() => countries.code),
  admin1Code: text('admin1_code').notNull(),
  name: text('name').notNull(),
}, (table) => [uniqueIndex('states_country_admin1_idx').on(table.countryCode, table.admin1Code)]);

export const cities = pgTable('cities', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  countryCode: text('country_code').notNull().references(() => countries.code),
  stateId: integer('state_id').references(() => states.id),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  population: integer('population').notNull().default(0),
});

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  handle: text('handle'),
  handleNormalized: text('handle_normalized'),
  discoverability: profileDiscoverabilityEnum('discoverability').notNull().default('LIMITED'),
  friendListVisibility: friendListVisibilityEnum('friend_list_visibility').notNull().default('ONLY_ME'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('profiles_handle_normalized_idx').on(table.handleNormalized),
  index('profiles_discoverability_handle_idx').on(table.discoverability, table.handleNormalized),
  index('profiles_display_name_idx').on(table.displayName),
]);

export const lifeTrails = pgTable('life_trails', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  anonymousOwnerHash: text('anonymous_owner_hash'),
  clientDraftId: uuid('client_draft_id').notNull(),
  title: text('title').notNull().default('My Life Trail'),
  publicTitle: text('public_title'),
  visibility: storyVisibilityEnum('visibility').notNull().default('PRIVATE'),
  shareToken: text('share_token'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('life_trails_profile_idx').on(table.profileId),
  uniqueIndex('life_trails_profile_draft_idx').on(table.profileId, table.clientDraftId),
  uniqueIndex('life_trails_anonymous_owner_idx').on(table.anonymousOwnerHash),
  uniqueIndex('life_trails_share_token_idx').on(table.shareToken),
  index('life_trails_visibility_idx').on(table.visibility, table.updatedAt),
  check('life_trails_owner_check', sql`${table.profileId} IS NOT NULL OR ${table.anonymousOwnerHash} IS NOT NULL`),
]);

export const movementChapters = pgTable('movement_chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  trailId: uuid('trail_id').notNull().references(() => lifeTrails.id, { onDelete: 'cascade' }),
  fromCityId: integer('from_city_id').notNull().references(() => cities.id),
  toCityId: integer('to_city_id').notNull().references(() => cities.id),
  moveYear: integer('move_year').notNull(),
  reason: text('reason').notNull().default('Other'),
  title: text('title'),
  memoryBody: text('memory_body'),
  endYear: integer('end_year'),
  privacyOverride: storyVisibilityEnum('privacy_override'),
  visibility: visibilityEnum('visibility').notNull().default('PRIVATE'),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('movement_chapters_trail_position_idx').on(table.trailId, table.position),
  index('movement_chapters_public_route_idx').on(table.visibility, table.fromCityId, table.toCityId, table.moveYear),
  index('movement_chapters_reason_idx').on(table.reason),
]);

// A chapter is a place in a life; a movement is the edge between two chapters.
// Existing movement UUIDs are reused for their destination chapters by the
// additive backfill so media and social references remain stable.
export const lifeChapters = pgTable('life_chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  trailId: uuid('trail_id').notNull().references(() => lifeTrails.id, { onDelete: 'cascade' }),
  cityId: integer('city_id').notNull().references(() => cities.id),
  arrivalYear: integer('arrival_year'),
  endYear: integer('end_year'),
  reason: text('reason').notNull().default('Other'),
  title: text('title'),
  memoryBody: text('memory_body'),
  privacyOverride: storyVisibilityEnum('privacy_override'),
  visibility: visibilityEnum('visibility').notNull().default('PRIVATE'),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('life_chapters_trail_position_idx').on(table.trailId, table.position),
  index('life_chapters_city_year_idx').on(table.cityId, table.arrivalYear),
  index('life_chapters_visibility_idx').on(table.visibility, table.cityId),
]);

export const chapterMedia = pgTable('chapter_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  movementChapterId: uuid('movement_chapter_id').references(() => movementChapters.id, { onDelete: 'cascade' }),
  lifeChapterId: uuid('life_chapter_id').references(() => lifeChapters.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull().unique(),
  mimeType: text('mime_type').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull().default(0),
  width: integer('width'),
  height: integer('height'),
  displayOrder: integer('display_order').notNull().default(0),
  caption: text('caption'),
  privacyOverride: storyVisibilityEnum('privacy_override'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('chapter_media_chapter_order_idx').on(table.movementChapterId, table.displayOrder),
  index('chapter_media_life_chapter_order_idx').on(table.lifeChapterId, table.displayOrder),
  index('chapter_media_created_at_idx').on(table.createdAt),
  check('chapter_media_chapter_reference_check', sql`${table.lifeChapterId} IS NOT NULL OR ${table.movementChapterId} IS NOT NULL`),
]);

export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  lowProfileId: uuid('low_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  highProfileId: uuid('high_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  requesterProfileId: uuid('requester_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  recipientProfileId: uuid('recipient_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  status: connectionStatusEnum('status').notNull().default('PENDING'),
  blockedByProfileId: uuid('blocked_by_profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('connections_canonical_pair_idx').on(table.lowProfileId, table.highProfileId),
  index('connections_low_status_idx').on(table.lowProfileId, table.status),
  index('connections_high_status_idx').on(table.highProfileId, table.status),
  index('connections_recipient_status_idx').on(table.recipientProfileId, table.status, table.createdAt),
  check('connections_distinct_profiles_check', sql`${table.lowProfileId} <> ${table.highProfileId}`),
  check('connections_canonical_order_check', sql`${table.lowProfileId}::text < ${table.highProfileId}::text`),
  check('connections_participants_check', sql`(${table.requesterProfileId} = ${table.lowProfileId} AND ${table.recipientProfileId} = ${table.highProfileId}) OR (${table.requesterProfileId} = ${table.highProfileId} AND ${table.recipientProfileId} = ${table.lowProfileId})`),
  check('connections_blocker_check', sql`${table.blockedByProfileId} IS NULL OR ${table.blockedByProfileId} IN (${table.lowProfileId}, ${table.highProfileId})`),
]);

export const connectionPermissions = pgTable('connection_permissions', {
  connectionId: uuid('connection_id').primaryKey().references(() => connections.id, { onDelete: 'cascade' }),
  lowCompareAllowed: boolean('low_compare_allowed').notNull().default(false),
  highCompareAllowed: boolean('high_compare_allowed').notNull().default(false),
  lowAtlasShared: boolean('low_atlas_shared').notNull().default(false),
  highAtlasShared: boolean('high_atlas_shared').notNull().default(false),
  lowExternalShareAllowed: boolean('low_external_share_allowed').notNull().default(false),
  highExternalShareAllowed: boolean('high_external_share_allowed').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chapterPeople = pgTable('chapter_people', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapterId: uuid('chapter_id').references(() => movementChapters.id, { onDelete: 'cascade' }),
  lifeChapterId: uuid('life_chapter_id').references(() => lifeChapters.id, { onDelete: 'cascade' }),
  ownerProfileId: uuid('owner_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  targetProfileId: uuid('target_profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  placeholderName: text('placeholder_name'),
  status: chapterPersonStatusEnum('status').notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('chapter_people_chapter_idx').on(table.chapterId, table.status),
  index('chapter_people_life_chapter_idx').on(table.lifeChapterId, table.status),
  index('chapter_people_target_status_idx').on(table.targetProfileId, table.status, table.createdAt),
  index('chapter_people_owner_idx').on(table.ownerProfileId, table.chapterId),
  uniqueIndex('chapter_people_chapter_target_idx').on(table.chapterId, table.targetProfileId),
  uniqueIndex('chapter_people_life_chapter_target_idx').on(table.lifeChapterId, table.targetProfileId),
  check('chapter_people_target_or_placeholder_check', sql`(${table.targetProfileId} IS NOT NULL) <> (${table.placeholderName} IS NOT NULL)`),
  check('chapter_people_chapter_reference_check', sql`${table.lifeChapterId} IS NOT NULL OR ${table.chapterId} IS NOT NULL`),
]);

export const socialInvites = pgTable('social_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  inviterProfileId: uuid('inviter_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  kind: socialInviteKindEnum('kind').notNull(),
  chapterPersonId: uuid('chapter_person_id').references(() => chapterPeople.id, { onDelete: 'set null' }),
  message: text('message'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedByProfileId: uuid('claimed_by_profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('social_invites_inviter_active_idx').on(table.inviterProfileId, table.expiresAt),
  index('social_invites_chapter_person_idx').on(table.chapterPersonId),
]);

export const sharedMoments = pgTable('shared_moments', {
  id: uuid('id').primaryKey().defaultRandom(),
  connectionId: uuid('connection_id').notNull().references(() => connections.id, { onDelete: 'cascade' }),
  proposedByProfileId: uuid('proposed_by_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  cityId: integer('city_id').references(() => cities.id, { onDelete: 'set null' }),
  cityName: text('city_name').notNull(),
  yearFrom: integer('year_from'),
  yearTo: integer('year_to'),
  title: text('title'),
  memoryBody: text('memory_body'),
  status: sharedMomentStatusEnum('status').notNull().default('PENDING'),
  lowProfileVisible: boolean('low_profile_visible').notNull().default(false),
  highProfileVisible: boolean('high_profile_visible').notNull().default(false),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('shared_moments_connection_status_idx').on(table.connectionId, table.status, table.createdAt),
]);

export const socialActivities = pgTable('social_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  recipientProfileId: uuid('recipient_profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  actorProfileId: uuid('actor_profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('social_activities_recipient_idx').on(table.recipientProfileId, table.readAt, table.createdAt),
]);

export const socialRateLimits = pgTable('social_rate_limits', {
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(1),
}, (table) => [
  primaryKey({ columns: [table.profileId, table.action, table.windowStartedAt] }),
  index('social_rate_limits_cleanup_idx').on(table.windowStartedAt),
]);

export const migrationDataSources = pgTable('migration_data_sources', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  datasetName: text('dataset_name').notNull(),
  version: text('version').notNull(),
  sourceUrl: text('source_url').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
});

export const migrantStock = pgTable('migrant_stock', {
  sourceId: text('source_id').notNull().references(() => migrationDataSources.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  originCountryCode: text('origin_country_code').notNull().references(() => countries.code),
  destinationCountryCode: text('destination_country_code').notNull().references(() => countries.code),
  stock: bigint('stock', { mode: 'number' }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.sourceId, table.year, table.originCountryCode, table.destinationCountryCode] }),
  index('migrant_stock_origin_year_idx').on(table.originCountryCode, table.year, table.stock),
  index('migrant_stock_destination_year_idx').on(table.destinationCountryCode, table.year, table.stock),
]);

export const countryMapAnchors = pgTable('country_map_anchors', {
  countryCode: text('country_code').primaryKey().references(() => countries.code, { onDelete: 'cascade' }),
  cityId: integer('city_id').notNull().references(() => cities.id),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const schema = { user, session, account, verification, guestSaveHandoffs, countries, states, cities, profiles, lifeTrails, movementChapters, lifeChapters, chapterMedia, connections, connectionPermissions, chapterPeople, socialInvites, sharedMoments, socialActivities, socialRateLimits, migrationDataSources, migrantStock, countryMapAnchors };
