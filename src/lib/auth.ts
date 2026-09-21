import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { db } from '@/db';
import { account, session, user, verification } from '@/db/schema';

const googleConfigured = Boolean(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']);
const productionSecret = process.env['BETTER_AUTH_SECRET'];

export const authConfigured = Boolean(process.env['DATABASE_URL'] && productionSecret);

export const auth = betterAuth({
  appName: 'Life Atlas',
  baseURL: process.env['BETTER_AUTH_URL'],
  secret: productionSecret ?? 'life-atlas-local-development-secret-only',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: false },
  socialProviders: googleConfigured ? {
    google: {
      clientId: process.env['GOOGLE_CLIENT_ID']!,
      clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
    },
  } : {},
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [tanstackStartCookies()],
});
