# Production implementation plan

1. Preserve the existing editorial UI and Mapbox animation while removing mock data and dead Lovable/Supabase wiring.
2. Create a Neon-native relational schema, indexed location search, and a streamed importer for the supplied country/state/city datasets.
3. Move search, statistics, Explore aggregation, and trail persistence behind validated TanStack server functions.
4. Add post-result authentication and preserve the anonymous draft through sign-in.
5. Make chapter add/edit/delete/reorder controls and movement fingerprints data-driven.
6. Verify type safety, production build, desktop/mobile rendering, database health, and Vercel runtime behavior.

## Audit findings

- Framework: TanStack Start + React + Vite + Tailwind CSS.
- State: local React state only; no persisted journey.
- Map: Mapbox GL with good curved-route/camera animation worth preserving.
- Data: 24 hard-coded cities and fabricated community volumes.
- Backend: Supabase-specific migration and generated clients, but no functional app queries.
- Auth: Lovable/Supabase OAuth buttons; email was inert.
- Explore: visual controls only, with fabricated pulse and city statistics.
- Responsive: fixed mobile heights and card/map padding could hide route endpoints.

## Dataset inspection

- Countries: 252 records plus header; `country_id,country_name,country_code`.
- States/regions: 3,864 records plus header; `state_id,country_code,admin1_code,state_name`.
- Cities: 5,175,737 records plus header; `city_id,city_name,country_code,admin1_code,latitude,longitude,population`.
- Some state names are double-encoded UTF-8; the importer repairs those values before loading.
