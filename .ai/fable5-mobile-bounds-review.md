# Fable 5 — Mobile Boundary Draw Tool UX Review

## Executive Summary

We moved the draw-bounds button from inside the settings panel to a floating `top-3 right-3` button on the map canvas. The drag-to-draw logic was already implemented in `MapAuthoringCanvas.tsx` (mousedown/mousemove/mouseup + touchstart/touchmove/touchend event listeners on the raw MapLibre map instance). The user reports the tool is **still not usable on mobile**.

## Architecture

- **DrawBoundsControl.tsx** — New 44×44px floating button, always visible on the map. Toggles `drawMode` between `'draw_rectangle'` and `'simple_select'` (which exits draw mode).
- **MapAuthoringCanvas.tsx** — Contains all drawing logic. When `drawMode === 'draw_rectangle'`:
  1. Disables `map.dragPan` and `map.scrollZoom`
  2. Sets cursor to `crosshair`
  3. Attaches mousedown/mousemove/mouseup + touchstart/touchmove/touchend to the raw MapLibre map instance
  4. On drag: computes `cornersToBbox(lng1, lat1, lng2, lat2)` and shows a preview polygon (dashed outline + 30% fill)
  5. On release: calls `onDrawCreate` with the bbox, switches to `'simple_select'` (exits draw mode)
  6. Escape key exits draw mode
- **MapScreen.tsx** — Parent. Renders `MapAuthoringCanvas` in a `relative` container, `DrawBoundsControl` absolutely positioned at `top-3 right-3 z-10`, BoundsEditor (coordinate inputs) in the sidebar/settings sheet.

## The Code

### DrawBoundsControl.tsx (floating button)
```tsx
export function DrawBoundsControl({
  drawMode,
  onDrawModeChange,
}: DrawBoundsControlProps) {
  const intl = useIntl();
  const isDrawing = drawMode === 'draw_rectangle';

  function handleClick() {
    onDrawModeChange?.(isDrawing ? 'simple_select' : 'draw_rectangle');
  }

  return (
    <button
      type="button"
      aria-pressed={isDrawing}
      aria-label={isDrawing ? 'Cancel drawing' : 'Draw bounds'}
      onClick={handleClick}
      className={`flex h-11 w-11 items-center justify-center rounded-btn border shadow-card ${
        isDrawing
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-white text-text'
      }`}
      style={{ touchAction: 'manipulation' }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3" y="3" width="14" height="14" rx="2"
          stroke="currentColor" strokeWidth="2"
          strokeDasharray={isDrawing ? undefined : '4 2'}
          fill={isDrawing ? 'currentColor' : 'none'}
          fillOpacity={isDrawing ? '0.2' : undefined}
        />
      </svg>
    </button>
  );
}
```

### MapAuthoringCanvas.tsx (draw event listeners)
```tsx
// Drag state
const [dragStart, setDragStart] = useState<{lng: number; lat: number} | null>(null);
const [dragEnd, setDragEnd] = useState<{lng: number; lat: number} | null>(null);
const isDrawing = drawMode === 'draw_rectangle';
const isDraggingRef = useRef(false);

const handleDragStart = useCallback((lng: number, lat: number) => {
  isDraggingRef.current = true;
  setDragStart({ lng, lat });
  setDragEnd({ lng, lat });
}, []);

const handleDragMove = useCallback((lng: number, lat: number) => {
  if (!isDraggingRef.current) return;
  setDragEnd({ lng, lat });
}, []);

const handleDragEnd = useCallback(() => {
  if (!isDraggingRef.current) return;
  isDraggingRef.current = false;
  setDragStart((prevStart) => {
    setDragEnd((prevEnd) => {
      if (!prevStart || !prevEnd) return null;
      const result = cornersToBbox(prevStart.lng, prevStart.lat, prevEnd.lng, prevEnd.lat);
      if (isValidBbox(result)) {
        onDrawCreateRef.current?.(result);
        onDrawModeChangeRef.current?.('simple_select');
      }
      return null;
    });
    return null;
  });
}, []);

// Effect that attaches/detaches event listeners
useEffect(() => {
  const map = mapRef.current?.getMap();
  if (!map || !isDrawing) {
    setDragStart(null);
    setDragEnd(null);
    return;
  }

  const onMouseDown = (e: MapMouseEvent) => handleDragStart(e.lngLat.lng, e.lngLat.lat);
  const onMouseMove = (e: MapMouseEvent) => handleDragMove(e.lngLat.lng, e.lngLat.lat);
  const onMouseUp = () => handleDragEnd();
  const onTouchStart = (e: MapTouchEvent) => handleDragStart(e.lngLat.lng, e.lngLat.lat);
  const onTouchMove = (e: MapTouchEvent) => handleDragMove(e.lngLat.lng, e.lngLat.lat);
  const onTouchEnd = () => handleDragEnd();

  map.on('mousedown', onMouseDown);
  map.on('mousemove', onMouseMove);
  map.on('mouseup', onMouseUp);
  map.on('touchstart', onTouchStart);
  map.on('touchmove', onTouchMove);
  map.on('touchend', onTouchEnd);

  const canvas = map.getCanvas();
  const prevCursor = canvas.style.cursor;
  canvas.style.cursor = 'crosshair';

  return () => {
    map.off('mousedown', onMouseDown);
    map.off('mousemove', onMouseMove);
    map.off('mouseup', onMouseUp);
    map.off('touchstart', onTouchStart);
    map.off('touchmove', onTouchMove);
    map.off('touchend', onTouchEnd);
    canvas.style.cursor = prevCursor;
  };
}, [mapRef, isDrawing, handleDragStart, handleDragMove, handleDragEnd]);

// Escape key cancels drawing
useEffect(() => {
  if (!isDrawing) return;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onDrawModeChangeRef.current?.('simple_select');
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isDrawing]);
```

## Known Issues from Personal Review

1. **No instruction/confirmation overlay** — When user taps the draw button on mobile, nothing visually changes except the button turns blue. No text says "Drag on the map to draw." The user may not know they need to drag.
2. **Button position** — `top-3 right-3` may be in the safe-area notch region on modern phones. Should use `env(safe-area-inset-top)` and `env(safe-area-inset-right)`.
3. **No visual feedback that draw mode is active** — The crosshair cursor is invisible on touch devices. The only feedback is the button's blue state, which is subtle and in the corner of the screen.
4. **No touch event `preventDefault`** — The raw MapLibre touch events are not calling `e.preventDefault()`. The browser may still scroll/zoom even though `scrollZoom.disable()` and `dragPan.disable()` are called.
5. **Nested `setState` in handleDragEnd** — `setDragStart` wraps `setDragEnd` in a nested updater, which is impure and fragile.
6. **Preview polygon relies on `dragStart && dragEnd`** — It renders as soon as touch starts (even a stationary press shows a zero-area preview). Not harmful but could be visually confusing.
7. **No haptic feedback** — On iOS/Android, no `navigator.vibrate()` for touch start/end.
8. **Drawing committed immediately** — No confirmation step. The rectangle is set as the bbox as soon as the user lifts their finger. No undo.
9. **No way to see current bounds while drawing** — The existing bbox overlay disappears while drawing? No, actually the bbox overlay stays (separate Source), but there's no reference to help the user position the new rectangle.
10. **MapLibre touch events vs browser touch events** — The touch events come from MapLibre's event system, not native DOM events. They may not include `e.preventDefault()` capability.

## What We Need from Fable 5

1. **Identify ALL mobile-specific issues** — Read the actual source files and identify every problem that would make this tool "not usable on mobile." Be exhaustive — P0, P1, P2, and nice-to-haves.

2. **Prioritize fixes** — Rank issues by severity (P0 = blocks usability, P1 = significant friction, P2 = polish).

3. **For each P0 issue**: Propose exact code changes. Show the diff or describe what to change and where.

4. **Evaluate the overall UX flow for mobile**: 
   - User taps button → enters draw mode → draws on map → completes → sees result
   - Identify gaps in this flow specific to touch/mobile
   - What would make it feel native on a phone?

5. **Check for touch-specific bugs**:
   - Does `preventDefault` need to be called on touch events?
   - Are there race conditions between MapLibre's built-in gestures and our draw events?
   - Is `touchAction: 'manipulation'` sufficient on the button?

6. **Evaluate safe-area handling** — Is `top-3 right-3` on the map container correctly respecting iOS notch / Android status bar?

## Files to Read

- `src/screens/MapScreen/DrawBoundsControl.tsx`
- `src/screens/MapScreen/MapAuthoringCanvas.tsx` (the main drawing logic)
- `src/screens/MapScreen/MapScreen.tsx` (parent layout, positioning)
- `src/screens/MapScreen/messages.ts` (existing i18n messages)
- `src/screens/MapScreen/BoundsEditor.tsx` (coordinate inputs in settings panel)

## Constraints

- React 19 + TypeScript strict mode
- MapLibre GL JS via react-map-gl/maplibre
- Tailwind CSS v4
- 80% test coverage required on all source files
- All existing tests must continue to pass
- Must follow project AGENTS.md conventions

## Budget

- File-backed review, budget $3.00-5.00
- Focus on actionable mobile fixes, not general architecture
