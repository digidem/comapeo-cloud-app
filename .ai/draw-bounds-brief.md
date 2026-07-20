# Draw Bounds UX Redesign Brief

## Problem

The draw-bounds tool is currently buried inside the settings panel (sidebar on desktop, bottom-sheet on mobile). Users must:
1. Open the settings sheet (mobile) or scroll the sidebar (desktop)
2. Click "Draw bounds"
3. Close/context-switch back to the map
4. Then drag on the map

This makes it undiscoverable and unusable, especially on mobile where the bottom-sheet covers the map.

## Goal

Move the draw-bounds trigger to a **top-right floating button on the map canvas** — visible on both desktop and mobile without entering settings. Follow established map-toolbar UX patterns.

## Best Practices (from research)

- **Toolbar pattern**: Drawing tools are floating controls overlaid on the map (Leaflet.draw, MapLibre TerraDraw, MapLibre-Geoman). Top-left or top-right is standard.
- **Toggle activation**: Click/tap button to enter draw mode. Button shows active/pressed state. Click again or press Escape to cancel.
- **Drag-to-draw**: Click and hold to start rectangle, drag to size, release to complete. Same as existing.
- **Map interaction disabled while drawing**: dragPan disabled (already done), scroll zoom should also be disabled while drawing.
- **Visual feedback**: Crosshair cursor, preview rectangle with dashed outline (already done).
- **Escape to cancel**: Press Escape to abort drawing and return to normal map interaction.
- **Mobile touch**: Touch-drag works (existing code). Button must be >= 44px touch target.
- **Keyboard shortcut**: Document Escape to cancel.

## Current File Structure

- `src/screens/MapScreen/MapAuthoringCanvas.tsx` — Map component with drag-to-draw logic (via raw map event listeners). Draws bbox preview and emits `onDrawCreate` + `onDrawModeChange`.
- `src/screens/MapScreen/BoundsEditor.tsx` — Settings-panel component with coordinate inputs, "Use current view", "Use project area", and "Draw bounds" button.
- `src/screens/MapScreen/MapScreen.tsx` — Parent that wires everything together. Has `drawMode` state, renders `MapAuthoringCanvas` + sidebar/settings-sheet with `BoundsEditor` inside.
- `src/screens/MapScreen/messages.ts` — i18n messages.

## What to Implement

### 1. New floating `DrawBoundsControl` component

Create `src/screens/MapScreen/DrawBoundsControl.tsx`:

```
Props:
  - drawMode: 'draw_rectangle' | 'simple_select' | null
  - onDrawModeChange: (mode: 'draw_rectangle' | 'simple_select' | null) => void
  - isDrawing: boolean (derived from drawMode)

Renders:
  - A floating button positioned absolutely in the top-right of the map container
  - Uses SVG rectangle icon (not text label — icon-only, with aria-label)
  - Shows active/highlighted state when drawMode is active
  - 44×44px minimum touch target
  - z-index above the map but below modal overlays
  - Responsive: always visible, doesn't overlap with other map controls
```

**Icon**: A simple rectangle/dashed-square SVG icon (mdi-draw or similar). Use a subtle rounded-square with dashed outline when inactive, filled primary color when active.

**Interaction**:
- Click/tap toggles draw mode on/off
- When active: button shows primary/highlighted state + tooltip "Cancel drawing"
- When inactive: button shows default state + tooltip "Draw bounds"
- Escape key while focused exits draw mode

### 2. Integrate in MapScreen

- Import and render `DrawBoundsControl` inside the map container div, absolutely positioned over the map
- Pass `drawMode` and `setDrawMode` (as `onDrawModeChange`)
- It should be rendered for both desktop and mobile (always visible)
- Keep the existing `BoundsEditor` in the settings panel (for manual coordinate entry), but remove the "Draw bounds" / "Cancel drawing" button from it since that functionality moves to the floating button

### 3. Keyboard shortcut (Escape)

In `MapAuthoringCanvas.tsx`, add an Escape key handler that exits draw mode:
- Listen for `keydown` events on the map container when in draw mode
- On Escape: call `onDrawModeChange?.('simple_select')` to cancel
- Clean up listener on unmount or when draw mode changes

### 4. Accessibility

- `aria-label="Draw bounds"` / `aria-label="Cancel drawing"` (dynamic)
- `aria-pressed` reflecting toggle state
- Focus-visible ring matching the design system
- Button is a `<button>` element, keyboard accessible by default

### 5. Styling

Follow the project's Tailwind v4 design tokens:
- Primary active: `bg-primary text-white` with primary border
- Default: `bg-white border border-border text-text` (like secondary button variant)
- Shadow: `shadow-card` or `shadow-elevated`
- Border-radius: `rounded-btn` (12px) for the button
- Position: `absolute top-3 right-3`
- z-index: `z-10` (above map, below dialog overlays which are z-50)
- Match existing map overlay pattern (like the bottom-left settings button)

### 6. BoundsEditor modifications

- Remove the "Draw bounds" / "Cancel drawing" button and its "Click and drag on the map" instruction from BoundsEditor
- Keep coordinate inputs, validations, "Use current view", "Use project area"
- The `drawMode` and `onDrawModeChange` props can be removed from BoundsEditor
- `isDrawing` prop/derived state and disabled inputs during drawing can also be removed

### 7. Tests

- **New tests** for `DrawBoundsControl`:
  - Renders with correct aria-label for active/inactive states
  - Clicking toggles draw mode
  - Has proper touch target size (44px)

- **Update tests** for `BoundsEditor`:
  - Remove tests related to draw mode button (it's no longer in BoundsEditor)
  - All existing coordinate/validation tests should keep passing

- **Update tests** for `MapAuthoringCanvas`:
  - Test that Escape key exits draw mode

- **Update tests** for `MapScreen`:
  - Verify the new control renders alongside the map
  - Verify draw mode state flows correctly between the control and canvas

### 8. i18n messages

Existing messages that can be reused or need updating:
- `map.bounds.drawBounds` → "Draw bounds" (reuse for floating button tooltip)
- `map.bounds.cancelDraw` → "Cancel drawing" (reuse for active button tooltip)
- `map.bounds.drawingInstruction` → "Click and drag on the map to draw a rectangle for the bounds" (keep for instruction text)

## Not Changing

- The drag-to-draw logic in `MapAuthoringCanvas` — it works correctly
- The bbox preview rendering on the map
- The BoundsEditor coordinate inputs and validation
- The "Use current view" and "Use project area" buttons
- The settings panel / bottom sheet layout

## Files to Create

1. `src/screens/MapScreen/DrawBoundsControl.tsx` (new)

## Files to Modify

1. `src/screens/MapScreen/MapScreen.tsx` — add DrawBoundsControl, remove drawMode/BoundsEditor wiring
2. `src/screens/MapScreen/BoundsEditor.tsx` — remove draw-mode button, instruction text, drawMode/onDrawModeChange props
3. `src/screens/MapScreen/MapAuthoringCanvas.tsx` — add Escape key handler
4. `tests/unit/screens/MapScreen/MapScreen.test.tsx` — update for new control
5. `tests/unit/screens/MapScreen/BoundsEditor.test.tsx` — remove draw-mode tests
6. Possibly `tests/unit/screens/MapScreen/MapAuthoringCanvas.test.tsx` — if exists, add escape test

## Test Commands

```bash
npm test -- --run MapScreen/BoundsEditor.test.tsx
npm test -- --run MapScreen/MapScreen.test.tsx
npm test -- --run MapScreen/  # all map screen tests
npm run lint:types
```
