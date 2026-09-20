# Life Atlas — Warm Editorial Redesign

## Experience
- Replace the dark interface with a warm pearl, editorial visual system using refined serif/sans typography, translucent floating controls, gentle shadows, and restrained amber/teal route accents.
- Recompose the opening around one fast, result-first chapter: searchable origin and destination selectors, year, reason, and a single journey action.
- Build polished location autocomplete with city, region, and country labels backed by structured place objects containing IDs and coordinates.

## Living journey reveal
- Transition from the opening into a real interactive map where the origin pulses, the route draws, and the destination illuminates.
- Keep the map visible while showing the Movement Fingerprint and route insights.
- Add chapter continuation controls for places before, after, or between existing stops; new chapters extend the same Life Trail and redraw every route.
- Include a save invitation only after the first result, with Google, Apple, and email options.

## Global explore
- Replace the static globe and map artwork with a Mapbox-powered, pannable world map.
- Seed the map with dozens of meaningful example movements, proportional city activity markers, animated route arcs, rich hover details, and a clickable city exploration panel.
- Add Community Journeys and World Patterns layers with visibly distinct treatments.
- Add floating search and filters, discovery prompts, a 2000–2026 replay slider, and rotating Human Pulse activity.

## Personal profile and privacy
- Create the data model for people, structured places, multi-chapter journeys, and per-chapter Public / Anonymous / Private visibility.
- Add a personal “My Life Trail” view after sign-in with the complete route timeline, map, totals, movement fingerprint, privacy controls, and Journey Card.
- Support Google, Apple, and email authentication without blocking the first journey result.

## Technical details
- Use Lovable Cloud for profiles, chapters, privacy, and authentication.
- Use Mapbox GL JS with a public browser token for the interactive map; use demo data immediately so the experience is never empty.
- Keep map code isolated from server rendering and lazy-load it after hydration.
- Preserve route-specific metadata and verify desktop/mobile layouts, map interactions, chapter extension, and sign-in entry points.
