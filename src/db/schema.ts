import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const visibilityEnum = pgEnum('chapter_visibility', ['PUBLIC', 'ANONYMOUS', 'PRIVATE']);

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const lifeTrails = pgTable('life_trails', {
  id: uuid('id').primaryKey().defaultRandom(),
  profileId: uuid('profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
  anonymousOwnerHash: text('anonymous_owner_hash'),
  clientDraftId: uuid('client_draft_id').notNull(),
  title: text('title').notNull().default('My Life Trail'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('life_trails_profile_idx').on(table.profileId),
  uniqueIndex('life_trails_profile_draft_idx').on(table.profileId, table.clientDraftId),
  uniqueIndex('life_trails_anonymous_owner_idx').on(table.anonymousOwnerHash),
  check('life_trails_owner_check', sql`${table.profileId} IS NOT NULL OR ${table.anonymousOwnerHash} IS NOT NULL`),
]);

export const movementChapters = pgTable('movement_chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  trailId: uuid('trail_id').notNull().references(() => lifeTrails.id, { onDelete: 'cascade' }),
  fromCityId: integer('from_city_id').notNull().references(() => cities.id),
  toCityId: integer('to_city_id').notNull().references(() => cities.id),
  moveYear: integer('move_year').notNull(),
  reason: text('reason').notNull().default('Other'),
  visibility: visibilityEnum('visibility').notNull().default('PRIVATE'),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('movement_chapters_trail_position_idx').on(table.trailId, table.position),
  index('movement_chapters_public_route_idx').on(table.visibility, table.fromCityId, table.toCityId, table.moveYear),
  index('movement_chapters_reason_idx').on(table.reason),
]);

export const schema = { user, session, account, verification, countries, states, cities, profiles, lifeTrails, movementChapters };
