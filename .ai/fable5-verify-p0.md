# Fable 5 — Verify P0 Mobile Draw UX Fixes

## What was done

Based on your previous analysis, Sonnet 5 implemented these fixes. Verify each one is correct.

### P0-4: Stale drag ref fix
The effect cleanup in MapAuthoringCanvas.tsx now resets ALL drag refs (`isDraggingRef`, `dragStartRef`, `dragEndRef`, `startPointRef`, `endPointRef`) when exiting draw mode, not just the state. This prevents a phantom bbox commit when re-entering draw mode after cancelling mid-drag.

### P0-3: Dead gesture after pinch
When the user drops back to one finger after a multi-touch cancel, `onTouchMove` now calls `handleDragStart` to resume drawing instead of leaving the gesture dead (map frozen, finger does nothing).

### P0-1: Frame pattern on mobile
On non-desktop viewports, `drawMode` is gated to `null` so the map stays fully interactive (no drag handlers attached, pan/zoom works). Instead, a centered dashed frame overlay appears with a "Set this area" confirm button. `handleConfirmFrame` uses `map.unproject()` to convert the frame's 4 screen corners to a geographic bbox.

### P0-2: Undo toast
Bbox commits go through `handleDrawCreate`, which stores the previous bbox in a ref and shows a 6-second "Map area updated → Undo" toast. The Undo button restores the previous bbox.

### P1-1: Banner pointer-events
The instruction banner is now `pointer-events-none` with `pointer-events-auto` on the text and Cancel button, so it doesn't block map drags underneath.

## Files to verify
- src/screens/MapScreen/MapAuthoringCanvas.tsx
- src/screens/MapScreen/MapScreen.tsx
- src/screens/MapScreen/messages.ts

## Specific concerns
1. Does the frame overlay (h-3/5 w-4/5 centered) handle the `map.unproject()` correctly on rotated/tilted maps?
2. Is the undo toast positioned correctly (`bottom-16 left-1/2 -translate-x-1/2`) without overlapping the Settings/Save buttons at bottom-4?
3. Is the instruction banner still visible and readable now that it's `pointer-events-none`?
4. Does the `isDesktop ? drawMode : null` gate break the instruction banner display on any code path?
5. Are there any new type errors or edge cases introduced?
