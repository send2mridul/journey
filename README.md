# Life Atlas

Life Atlas is a living map of human movement. People can create a first journey without an account, view a real movement fingerprint, extend and edit their Life Trail, then sign in to save it.

## Architecture

- TanStack Start, React 19, TypeScript, Vite, and Nitro
- Mapbox GL JS for map rendering only; canonical places and coordinates come from Neon
- Neon PostgreSQL with Drizzle migrations and `pg_trgm` indexes
- Better Auth with Google OAuth and email/password accounts
- Vercel deployment through the TanStack Start/Nitro preset

Server functions own all location search, community aggregation, and persistence. Private data is authorized at the server boundary. Explore only returns route groups contributed by at least five distinct Life Trails.

## Local setup

1. Copy `.env.example` to `.env.local` and provide the values.
2. Install with `bun install` (or `npx bun install` if Bun is not installed globally).
3. Run `bun run db:migrate`.
4. Import the supplied location files.
5. Start the app with `bun run dev`.

The Google OAuth redirect URI is:

```text
http://localhost:3000/api/auth/callback/google
```

For production, add the corresponding `https://<domain>/api/auth/callback/google` URI and set `BETTER_AUTH_URL` to the production origin.

## Location import

The importer streams the city file into PostgreSQL using `COPY`; it does not load the 5.18 million city rows into application memory. It validates the CSV headers, repairs the observed double-encoded state names, resolves states by `(country_code, admin1_code)`, upserts canonical records, and analyzes the tables after import.

PowerShell example:

```powershell
$env:LOCATION_DATA_DIR='C:\path\to\locations file'
npx bun run db:import-locations
```

Or pass files explicitly:

```powershell
npx bun run db:import-locations -- --countries 'C:\path\country_uploaded.csv' --states 'C:\path\state_uploaded.csv' --cities 'C:\path\cities_uploaded.csv'
```

## Useful commands

```text
bun run check                 TypeScript verification
bun run build                 Production build
bun run db:migrate            Apply committed migrations
bun run db:import-locations   Stream the canonical location datasets into Neon
```

Never commit `.env` or `.env.local`. `VITE_MAPBOX_PUBLIC_TOKEN` is intentionally public; database, auth, and Google secrets must remain unprefixed and server-side.
