import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';

export const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth, authConfigured } = await import('@/lib/auth');
  if (!authConfigured) return null;
  return auth.api.getSession({ headers: getRequestHeaders() });
});
