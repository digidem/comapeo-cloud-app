# Fable 5 — Mobile Draw UX: Final Polish

## Context

We've implemented the basic draw-bounds tool on a MapLibre GL JS map using react-map-gl. The button is at `top-3 right-3` and always visible. The following P0 fixes are ALREADY applied (do not re-recommend):

1. ✅ `touch-action: none` pinned on canvas during draw mode
2. ✅ `touchcancel` handler resets drag state
3. ✅ Multi-touch handled (one finger draws, two navigates)
4. ✅ Minimum drag threshold (12px) to avoid micro-commits
5. ✅ Instruction banner with Cancel during draw mode
6. ✅ Escape key exits draw mode
7. ✅ `scrollZoom` disabled during drawing
8. ✅ Ref-based drag state (no nested setState)
9. ✅ Mouse handlers pass `e.point` for pixel-distance threshold

## What Still Feels Wrong

The user says the tool is "still not very intuitive, and very error prone" on mobile despite the P0 fixes. I need expert UX review.

## Current UX Flow (mobile)

1. User navigates map by panning/zooming normally (MapLibre handles this)
2. User sees a 44×44px icon button at top-right with a dashed-rectangle SVG
3. User taps button → button turns solid blue, `aria-pressed="true"`
4. A semi-transparent banner appears at the top: "Drag on the map to set the area" + "Cancel" link
5. User places one finger on the map and drags → dashed preview rectangle follows the drag
6. User lifts finger → rectangle is committed as the new bbox (if >12px drag), mode exits
7. If user wants to re-draw, they tap the button again and repeat

## Core Files

- `src/screens/MapScreen/DrawBoundsControl.tsx` — 44×44px toggle button
- `src/screens/MapScreen/MapAuthoringCanvas.tsx` — drawing logic (MapLibre event handlers)
- `src/screens/MapScreen/MapScreen.tsx` — parent layout, instruction banner
- `src/screens/MapScreen/messages.ts` — i18n messages

## Specific Questions for Fable 5

1. **The icon button is cryptic** — Is a dashed-rectangle SVG alone enough to communicate "draw boundary"? Should we add a brief label below/next to it? Would a tooltip or badge help?

2. **No preview of the CURRENT bbox** — The map already shows the existing bbox outline (always rendered), but it's subtle (18% opacity blue fill). Should entering draw mode highlight/animate the existing bbox to make the "you are replacing this" relationship clear?

3. **No confirmation step** — As soon as the user lifts their finger, the bbox is committed and draw mode exits. There's no "Accept / Redraw" step. Is this too abrupt? Should we add a confirmation toast or a floating "Accept" button for mobile?

4. **Drawing commits, then mode exits** — The user draws and immediately the mode ends (button goes back to inactive). If they want to adjust, they must tap the button again. Should draw mode be persistent (stay active until explicitly cancelled)?

5. **The existing bbox overlay renders inside the map source** — When the user enters draw mode, the existing bbox outline stays visible while the new drag preview is drawn. Is this confusing?

6. **Haptic feedback** — Should we add `navigator.vibrate(10)` on touch start / commit? (iOS ignores it, Android uses it.)

7. **Draw mode feels like the map is "broken"** — The map stops panning/zooming when draw mode is active. Even with the instruction banner, this is disorienting. Any ideas to make the mode transition feel less jarring?

8. **Thumb reach** — The button is at `top-3 right-3`. On larger phones (6.7"+), this is the hardest spot for one-handed use. Would bottom-right or a bottom toolbar be better? Or is top-right OK for a rarely-used action?

9. **The Cancel button is in the instruction banner** — When the banner overlaps with the map content (e.g. zoom controls, attribution), it might feel cluttered. Any suggestions for a cleaner layout?

## Constraints

- React 19 + TypeScript strict, Tailwind v4
- MapLibre GL JS via react-map-gl/maplibre
- Must maintain 80% test coverage
- No new external dependencies

## What I Need

Ranked, actionable recommendations. For each P0/P1 recommendation, include:
- The specific code change (or file + line to modify)
- Why it improves mobile UX
- Any edge cases to watch for
