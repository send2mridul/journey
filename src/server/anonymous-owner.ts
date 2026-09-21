import { createHmac, randomBytes } from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server';

const cookieName = 'life_atlas_anonymous_owner';
const oneYear = 60 * 60 * 24 * 365;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: oneYear,
  };
}

function ownershipKey() {
  const key = process.env['BETTER_AUTH_SECRET'];
  if (process.env['NODE_ENV'] === 'production' && !key) {
    throw new Error('Anonymous ownership is not configured.');
  }
  return key ?? 'life-atlas-local-development-secret-only';
}

function hashOwnershipSecret(secret: string) {
  return createHmac('sha256', ownershipKey()).update(secret).digest('hex');
}

export function getAnonymousOwnerHash() {
  const secret = getCookie(cookieName);
  return secret ? hashOwnershipSecret(secret) : null;
}

export function getOrCreateAnonymousOwnerHash() {
  const existing = getCookie(cookieName);
  if (existing) return hashOwnershipSecret(existing);
  const secret = randomBytes(32).toString('base64url');
  setCookie(cookieName, secret, cookieOptions());
  return hashOwnershipSecret(secret);
}

export function clearAnonymousOwnerCookie() {
  deleteCookie(cookieName, { ...cookieOptions(), maxAge: 0 });
}
