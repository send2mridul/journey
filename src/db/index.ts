import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema';

const configuredUrl = process.env['DATABASE_URL'];
const developmentPlaceholder = 'postgres://life_atlas:life_atlas@127.0.0.1:5432/life_atlas';

export const databaseConfigured = Boolean(configuredUrl);
export const sql = postgres(configuredUrl ?? developmentPlaceholder, {
  max: process.env['VERCEL'] ? 1 : 5,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sql, { schema });

export function requireDatabase() {
  if (!databaseConfigured) {
    throw new Error('Life Atlas is not connected to its location database yet.');
  }
}
