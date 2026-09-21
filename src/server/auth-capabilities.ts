import { createServerFn } from '@tanstack/react-start';

export const getAuthCapabilities = createServerFn({ method: 'GET' })
  .handler(() => ({
    google: Boolean(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET']),
  }));
