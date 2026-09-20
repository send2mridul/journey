import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const { databaseConfigured, sql } = await import('@/db');
        if (!databaseConfigured) {
          return Response.json({ ok: false, database: 'not-configured' }, { status: 503 });
        }
        try {
          await sql`select 1`;
          return Response.json({ ok: true, database: 'connected' });
        } catch {
          return Response.json({ ok: false, database: 'unavailable' }, { status: 503 });
        }
      },
    },
  },
});
