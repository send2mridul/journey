import { createHmac, randomBytes } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';

const cookieName = 'life_atlas_guest_save';
const lifetimeSeconds = 15 * 60;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: lifetimeSeconds,
  };
}

function signingKey() {
  const key = process.env['BETTER_AUTH_SECRET'];
  if (process.env['NODE_ENV'] === 'production' && !key) throw new Error('Guest save handoff is not configured.');
  return key ?? 'life-atlas-local-development-secret-only';
}

function hashToken(token: string) {
  return createHmac('sha256', signingKey()).update(token).digest('hex');
}

export function currentGuestSaveTokenHash() {
  const token = getCookie(cookieName);
  return token ? hashToken(token) : null;
}

export function issueGuestSaveToken() {
  const token = randomBytes(32).toString('base64url');
  setCookie(cookieName, token, cookieOptions());
  return { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + lifetimeSeconds * 1000) };
}

export function clearGuestSaveToken() {
  deleteCookie(cookieName, { ...cookieOptions(), maxAge: 0 });
}
