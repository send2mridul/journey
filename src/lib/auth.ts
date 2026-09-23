import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { tanstackStartCookies } from 'better-auth/tanstack-start';
import { db } from '@/db';
import { account, session, user, verification } from '@/db/schema';

const googleConfigured = Boolean(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']);
const productionSecret = process.env['BETTER_AUTH_SECRET'];
const canonicalBaseUrl = process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000';

function hostname(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return 'life-atlas-ebon.vercel.app';
  }
}

// Better Auth resolves OAuth callbacks and cookies against the host that
// initiated sign-in. Keep this list exact so the protected review alias can
// exercise real Google auth without trusting arbitrary Vercel deployments.
const authHosts = [
  hostname(canonicalBaseUrl),
  'life-atlas-send2mridul-3002s-projects.vercel.app',
  'localhost:*',
  '127.0.0.1:*',
];

export const authConfigured = Boolean(process.env['DATABASE_URL'] && productionSecret);

export const auth = betterAuth({
  appName: 'Life Atlas',
  baseURL: {
    allowedHosts: authHosts,
    protocol: 'auto',
    fallback: canonicalBaseUrl,
  },
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
  advanced: {
    trustedProxyHeaders: true,
  },
  plugins: [tanstackStartCookies()],
});
