import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const { databaseConfigured, sql } = await import('@/db');
        const services = {
          googleAuth: Boolean(process.env['GOOGLE_CLIENT_ID'] && process.env['GOOGLE_CLIENT_SECRET'] && process.env['BETTER_AUTH_SECRET']),
          privatePhotoStorage: Boolean(process.env['BLOB_READ_WRITE_TOKEN']),
        };
        if (!databaseConfigured) {
          return Response.json({ ok: false, database: 'not-configured', services }, { status: 503 });
        }
        try {
          await sql`select 1`;
          return Response.json({ ok: true, database: 'connected', services });
        } catch {
          return Response.json({ ok: false, database: 'unavailable', services }, { status: 503 });
        }
      },
    },
  },
});
