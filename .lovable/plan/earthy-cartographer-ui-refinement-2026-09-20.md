# Earthy Cartographer UI Refinement

## Goal
Refine the existing Life Atlas into a cinematic, warm editorial experience while preserving its current onboarding, journey reveal, Life Trail, saving, and Explore flow.

## What will change

### Living atlas hero
- Keep the real interactive map as the full-viewport visual, but improve its camera, atmospheric globe treatment, terrain contrast, city glow, and background journey motion.
- Rebalance the headline and journey composer so the map remains visible and the first screen feels spacious, emotional, and intentional.
- Refine the composer into a quieter parchment-glass instrument with stronger hierarchy and more polished reason controls.

### Movement Fingerprint reveal
- Make the route map the dominant surface and reduce the fingerprint panel to a compact floating story card.
- Add a prominent copper route with a soft bloom, moving highlight, dotted after-trail, and breathing origin/destination markers.
- Reframe the map automatically around the selected route with appropriate padding on desktop and mobile.
- Keep insights readable without covering the route or large portions of the earth.

### Life Trail and saving
- Turn the Life Trail into an editorial vertical chronology with connected chapter markers and clearer place/year storytelling.
- Keep all existing add-before, add-after, and add-another interactions.
- Simplify “Save your Life Trail” into a restrained invitation rather than a large panel.

### Explore Atlas
- Increase the map’s visual share and refine the floating search, filters, layer switcher, city details, Human Pulse, and timeline.
- Give Community Journeys and World Patterns visibly distinct copper and sage treatments.
- Make the timeline slimmer and easier to read while preserving year filtering.

### Page rhythm and responsiveness
- Correct section heights, overlaps, and spacing from hero through footer.
- Preserve clean map visibility at desktop and mobile sizes.
- Add restrained entrances and atmospheric movement, with reduced-motion support.

## Technical details
- Update `AtlasMap` with separate glow/core/motion route layers, endpoint classifications, animated line progression, and responsive route fitting.
- Update the existing page composition and semantic styling only; no new product sections, data model changes, or authentication changes.
- Extend semantic design tokens for parchment, espresso, copper, sage, map haze, and layered shadows.
- Verify the route reveal and chapter extension in the browser at desktop and mobile sizes, then confirm the preview build is healthy.
