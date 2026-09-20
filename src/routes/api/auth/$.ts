import { createFileRoute } from '@tanstack/react-router';
import { auth, authConfigured } from '@/lib/auth';

async function handle(request: Request) {
  if (!authConfigured) {
    return Response.json({ message: 'Authentication is not configured.' }, { status: 503 });
  }
  return auth.handler(request);
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
