# P0 Mobile Draw Bounds Fixes

Implement these 5 P0 fixes identified by Fable 5 in MapAuthoringCanvas.tsx and MapScreen.tsx.

## Files to modify

1. `src/screens/MapScreen/MapAuthoringCanvas.tsx`
2. `src/screens/MapScreen/MapScreen.tsx`
3. `src/screens/MapScreen/messages.ts` (maybe)

## P0-1: Pin touch-action:none on canvas during draw mode

**File**: MapAuthoringCanvas.tsx, lines 212-225 (cursor effect)

When `dragPan.disable()` is called, MapLibre removes the `maplibregl-touch-drag-pan` CSS class from the canvas container. This causes the canvas to revert to `touch-action: pan-x pan-y`, which makes iOS/Android treat one-finger drags as scrolls — stealing the gesture from the drawing handlers.

**Fix**: In the same effect that sets the crosshair cursor, also save and override `canvas.style.touchAction`:

```tsx
    const canvas = map.getCanvas();
    const prevCursor = canvas.style.cursor;
    const prevTouchAction = canvas.style.touchAction;
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';

    return () => {
      // ...existing cleanup...
      canvas.style.cursor = prevCursor;
      canvas.style.touchAction = prevTouchAction;
    };
```

## P0-2: Add touchcancel handler

**File**: MapAuthoringCanvas.tsx, add alongside the existing listeners

Any cancelled touch (incoming call, notification shade, gesture takeover) leaves `isDraggingRef.current = true` and stale drag state. A stray `touchmove` later resumes a phantom drag, and `touchend` commits a garbage bbox.

**Fix**: Add a `touchcancel` event handler that resets all drag state:

```tsx
    const onTouchCancel = () => {
      isDraggingRef.current = false;
      setDragStart(null);
      setDragEnd(null);
    };
    
    map.on('touchcancel', onTouchCancel);
    // in cleanup:
    map.off('touchcancel', onTouchCancel);
```

## P0-3: Handle multi-touch (one finger draws, two fingers navigate)

**File**: MapAuthoringCanvas.tsx, modify `onTouchStart` and `onTouchMove`

When a second finger touches the screen during a draw, the browser fires a new `touchstart`. This resets `dragStart` mid-gesture, the map zooms underneath, and the commit fires garbage.

**Fix**: Cancel the in-progress draw when >1 touch is detected, letting MapLibre handle the pinch naturally:

```tsx
    const onTouchStart = (e: MapTouchEvent) => {
      if (e.originalEvent.touches.length > 1) {
        // Cancel draw on second finger, let pinch-zoom navigate
        isDraggingRef.current = false;
        setDragStart(null);
        setDragEnd(null);
        return;
      }
      handleDragStart(e.lngLat.lng, e.lngLat.lat, e.point);
    };
    const onTouchMove = (e: MapTouchEvent) => {
      if (e.originalEvent.touches.length > 1) {
        isDraggingRef.current = false;
        setDragStart(null);
        setDragEnd(null);
        return;
      }
      handleDragMove(e.lngLat.lng, e.lngLat.lat, e.point);
    };
```

Note: The `handleDragStart` and `handleDragMove` signatures now need a `point?: {x: number; y: number}` parameter. This is also needed for P0-4.

## P0-4: Minimum drag distance + ref-based state

**File**: MapAuthoringCanvas.tsx

Add `MIN_DRAG_PX = 12` threshold. Track screen points in refs alongside geographic coords. Reject micro-drags (< 12px) without exiting draw mode. This also eliminates the impure nested setState (previous code had `setDragStart` wrapping `setDragEnd` in updaters).

```tsx
const MIN_DRAG_PX = 12;

// Add refs for point tracking
const startPointRef = useRef<{ x: number; y: number } | null>(null);
const endPointRef = useRef<{ x: number; y: number } | null>(null);

// Update signatures to accept point
const handleDragStart = useCallback(
  (lng: number, lat: number, point: { x: number; y: number }) => {
    isDraggingRef.current = true;
    dragStartRef.current = { lng, lat };
    dragEndRef.current = { lng, lat };
    startPointRef.current = point;
    endPointRef.current = point;
    setDragStart({ lng, lat });
    setDragEnd({ lng, lat });
  },
  [],
);

const handleDragMove = useCallback(
  (lng: number, lat: number, point: { x: number; y: number }) => {
    if (!isDraggingRef.current) return;
    dragEndRef.current = { lng, lat };
    endPointRef.current = point;
    setDragEnd({ lng, lat });
  },
  [],
);

// Ref-based handleDragEnd — reads refs, not state updaters
const handleDragEnd = useCallback(() => {
  if (!isDraggingRef.current) return;
  isDraggingRef.current = false;
  const start = dragStartRef.current;
  const end = dragEndRef.current;
  const sp = startPointRef.current;
  const ep = endPointRef.current;
  dragStartRef.current = null;
  dragEndRef.current = null;
  setDragStart(null);
  setDragEnd(null);
  if (!start || !end || !sp || !ep) return;
  // Ignore micro-drags (taps, accidental swipes); stay in draw mode
  if (Math.abs(ep.x - sp.x) < MIN_DRAG_PX || Math.abs(ep.y - sp.y) < MIN_DRAG_PX) return;
  const result = cornersToBbox(start.lng, start.lat, end.lng, end.lat);
  if (isValidBbox(result)) {
    onDrawCreateRef.current?.(result);
    onDrawModeChangeRef.current?.('simple_select');
  }
}, []);

// Also need dragStartRef/dragEndRef — add alongside isDraggingRef:
const dragStartRef = useRef<{ lng: number; lat: number } | null>(null);
const dragEndRef = useRef<{ lng: number; lat: number } | null>(null);
```

Update the mouse handlers to also pass `e.point`:
```tsx
    const onMouseDown = (e: MapMouseEvent) =>
      handleDragStart(e.lngLat.lng, e.lngLat.lat, e.point);
    const onMouseMove = (e: MapMouseEvent) =>
      handleDragMove(e.lngLat.lng, e.lngLat.lat, e.point);
```

## P0-5: Instruction banner visible during draw mode

**File**: MapScreen.tsx, add inside the map container div (after the DrawBoundsControl)

Render a semi-transparent navy banner at the top with instruction text and a Cancel link:

```tsx
{drawMode === 'draw_rectangle' && (
  <div className="absolute left-3 right-16 top-3 z-10 flex items-center gap-2 rounded-btn bg-navy/90 px-3 py-2 shadow-card">
    <p className="flex-1 text-sm text-white">
      {intl.formatMessage(mapMessages.drawingInstruction)}
    </p>
    <button
      type="button"
      onClick={() => setDrawMode('simple_select')}
      className="shrink-0 text-sm font-medium text-white underline"
    >
      {intl.formatMessage(mapMessages.drawingInstructionCancel)}
    </button>
  </div>
)}
```

The instruction text in `messages.ts` should be updated to pointer-neutral wording (no "click"):
- Current: `"Click and drag on the map to draw a rectangle for the bounds"`
- Update to: `"Drag on the map to set the area"` (or use existing key)

Add a new message for the cancel button:
- id: `map.bounds.drawingInstructionCancel`
- defaultMessage: `"Cancel"`

## Test

After changes, run:
```bash
npm test -- --run MapScreen/
npm run lint:types
```

All existing tests must pass.
