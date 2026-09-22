# Life Atlas

Life Atlas is a geographic biography of the places that became chapters of a person's life. People can build and replay an in-memory preview without an account, then use Google sign-in to keep it permanently, enrich chapters with memories and private photographs, and share an unlisted read-only Atlas.

## Architecture

- TanStack Start, React 19, TypeScript, Vite, and Nitro
- Mapbox GL JS for map rendering only; canonical places and coordinates come from Neon
- Neon PostgreSQL with Drizzle migrations and `pg_trgm` indexes
- Better Auth with Google as the only permanent account provider; email/password is disabled
- Private Vercel Blob chapter-photo storage behind server-authorized uploads and delivery
- UN DESA International Migrant Stock 2024 country-to-country estimates for World Patterns
- Vercel deployment through the TanStack Start/Nitro preset

Server functions own location search, story persistence, share authorization, and community aggregation. New guest previews are never written as permanent trails. When a guest chooses to save, the server holds a short-lived, token-bound handoff for the Google OAuth round trip; it is claimed into the signed-in account and then deleted. Existing anonymous trails retain their secure HttpOnly ownership cookie so they can be claimed without data loss. Private data is authorized at the server boundary. Community Explore only returns eligible route groups contributed by at least five distinct Life Trails.

## Local setup

1. Copy `.env.example` to `.env.local` and provide the values.
2. Install with `bun install` (or `npx bun install` if Bun is not installed globally).
3. Run `bun run db:migrate`.
4. Import the supplied location files.
5. Import the official UN DESA workbook with `bun run db:import-world-patterns`.
6. Start the app with `bun run dev`.

The Google OAuth redirect URI is:

```text
http://localhost:3000/api/auth/callback/google
```

For production, add the corresponding `https://<domain>/api/auth/callback/google` URI and set `BETTER_AUTH_URL` to the production origin.

Google OAuth credentials are required for permanent saves, public discovery, social features, and photograph uploads. Without them, the app remains usable as a refresh-sensitive preview and says clearly that the work has not been saved.

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
bun run check                     TypeScript verification
bun run test                      Route-geometry regression tests
bun run build                     Production build
bun run db:migrate                Apply committed migrations
bun run db:import-locations       Stream the canonical location datasets into Neon
bun run db:import-world-patterns  Import official UN DESA migrant-stock estimates
```

## World Patterns import

`db:import-world-patterns` downloads the official **UN DESA International Migrant Stock 2024: Destination and origin** workbook by default, validates the supported worksheet structure, and transactionally upserts the available years (1990–2024) with source/version metadata. It can also accept a local official workbook:

```powershell
npx bun run db:import-world-patterns -- --file 'C:\path\to\undesa_pd_2024_ims_stock_by_sex_destination_and_origin.xlsx'
```

These values are migrant-stock estimates, not annual move counts. If the table has no imported source, World Patterns stays hidden from the consumer UI.

## Chapter photos

Create or connect a **private** Vercel Blob store and expose its generated `BLOB_READ_WRITE_TOKEN` to the project. Without the token, the rest of Life Atlas remains available and the photo controls explain that uploads are temporarily unavailable. Image bytes never enter Neon; Neon stores authorized media metadata only.

Photographs require an authenticated trail owner. The browser decodes and re-encodes supported JPEG, PNG, WebP, AVIF, HEIC, and HEIF sources as WebP before upload, limiting the prepared file to 10 MB and stripping source metadata. Server-issued upload tokens are short-lived and limited to the owned chapter, WebP content, and a private store. Limits are five photos per chapter, 100 photos or 250 MB per Atlas, and 20 uploads per hour. Delivery is through the authenticated `/api/media/:mediaId` route with private, no-store responses.

Never commit `.env` or `.env.local`. `VITE_MAPBOX_PUBLIC_TOKEN` is intentionally public; database, auth, Blob, and Google secrets must remain unprefixed and server-side.
