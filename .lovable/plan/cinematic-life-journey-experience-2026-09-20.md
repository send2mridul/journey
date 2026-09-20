# Cinematic Life Journey Experience

## What I’ll build
- Replace the placeholder with a polished, dark, immersive homepage centered on an animated world globe.
- Add the compact journey form with Patna, Bengaluru, 2021, reason chips, and a clear “Show My Journey” action.
- Create a cinematic reveal sequence where origin, route, and destination illuminate before showing the movement fingerprint.
- Add journey stats and a premium, shareable journey-card preview.
- Build a full-screen global explorer with animated movement arcs, compact filters, discovery prompts, a 2000–2026 timeline, and World Data / Community Journeys layers.
- Add “Your Life Trail” with the Patna → Bengaluru → London → Toronto timeline and summary metrics.
- Include refined loading and empty states, responsive layouts, smooth scrolling, and restrained motion.

## Visual direction
- Near-black cinematic canvas with warm amber/coral route light, cool teal data accents, restrained glass surfaces, and soft depth.
- Modern editorial typography, spacious composition, compact rounded controls, and no dashboard sidebar.
- The globe remains the dominant visual signal, with moving arcs and luminous city points rather than decorative gradients.

## Interaction details
- The form works immediately without sign-up and drives the reveal content.
- Layer toggles, filters, discovery cards, and timeline controls update the explorer visually.
- The journey card is rendered as a polished social preview and can be downloaded as an image where browser support allows.
- Motion respects reduced-motion preferences.

## Technical approach
- Use an SVG-based cinematic globe/map treatment for reliable responsive rendering and lightweight animation.
- Keep the experience frontend-only with representative community/world data; no account or persistence work is included.
- Define the full semantic token system and animation utilities centrally, then use them consistently across the page.
- Add route-specific metadata and verify the finished experience at desktop and mobile sizes.
