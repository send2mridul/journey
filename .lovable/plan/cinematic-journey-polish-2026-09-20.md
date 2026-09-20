# Cinematic journey polish

## Scope
Keep the current warm editorial design and page structure. Refine only the map composition, route reveal, Movement Fingerprint, Life Trail continuity, chapter editor, Explore controls, and scrolling rhythm.

## Implementation
- Upgrade the map to react to trail changes, fit every route dynamically with endpoint-safe padding, and choose framing from geographic distance instead of fixed zoom.
- Give each chapter its own curved geometry and visual state: older routes softened, current route stronger, with copper haze, an animated draw, moving light, and sequenced origin/destination pulses.
- Coordinate the result reveal so the camera moves first, then the origin, route, destination, and compact fingerprint card appear in sequence.
- Reduce the fingerprint card by roughly one quarter, remove dense secondary blocks, and place it responsively in the map's reserved safe area.
- Tighten the result-to-Life Trail transition and animate timeline nodes as they enter view.
- Replace the one-step add-place interaction with an inline city/year/reason editor; saving extends the same map and timeline immediately.
- Enlarge the hero and Explore globe presence while reducing the visual weight of Explore search, filters, layer switch, and timeline.
- Correct section heights, sticky behavior, and mobile spacing so the page reads as one continuous story.

## Validation
- Verify the initial reveal and adding a later chapter on desktop and mobile.
- Confirm short and long routes frame both endpoints safely, maps remain interactive, scrolling has no overlaps, and the build stays clean.
