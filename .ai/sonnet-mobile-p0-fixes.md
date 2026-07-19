# P0 Mobile Draw UX Fixes — Sonnet 5 Implementation

## Files to Modify

1. `src/screens/MapScreen/MapAuthoringCanvas.tsx`
2. `src/screens/MapScreen/MapScreen.tsx`
3. `src/screens/MapScreen/DrawBoundsControl.tsx`
4. `src/screens/MapScreen/messages.ts`
5. `src/screens/MapScreen/BoundsEditor.tsx`

---

## P0-4: Fix stale drag refs surviving mode exit (CORRECTNESS BUG)

**File**: `MapAuthoringCanvas.tsx`

**Current code (lines ~202-226):**
When the effect cleanup runs (`!map || !isDrawing`), it only resets `setDragStart(null)` and `setDragEnd(null)` — it leaves `isDraggingRef.current = true`, `dragStartRef.current`, `dragEndRef.current`, `startPointRef.current`, `endPointRef.current` all stale.

**Bug**: User enters draw mode, starts dragging, then presses Escape (or banner Cancel). The effect cleanup runs but leaves refs populated. When user enters draw mode again and moves the mouse (no button down!), `isDraggingRef.current` is still true so `handleDragMove` proceeds, and the next click commits a phantom bbox from the OLD session's start corner.

**Fix**: Reset ALL refs when exiting draw mode:

In the effect (where `if (!map || !isDrawing) { ... return; }`), change the cleanup from just `setDragStart(null); setDragEnd(null);` to also reset refs:

```typescript
if (!map || !isDrawing) {
  isDraggingRef.current = false;
  dragStartRef.current = null;
  dragEndRef.current = null;
  startPointRef.current = null;
  endPointRef.current = null;
  setDragStart(null);
  setDragEnd(null);
  return;
}
```

---

## P0-3: Fix dead one-finger gesture after two-finger cancel

**File**: `MapAuthoringCanvas.tsx`, the `onTouchMove` handler

**Current**: When a second finger touches during drawing, the code cancels the draw (sets `isDraggingRef.current = false`). When the user lifts back to one finger and drags, `isDraggingRef.current` is false so `handleDragMove` no-ops, AND `dragPan` is disabled — the finger does nothing. The map feels broken.

**Fix**: In `onTouchMove`, when the user drops back to one finger after a multi-touch cancel, resume drawing:

```typescript
const onTouchMove = (e: MapTouchEvent) => {
  if (e.originalEvent.touches.length > 1) {
    isDraggingRef.current = false;
    setDragStart(null);
    setDragEnd(null);
    return;
  }
  if (!isDraggingRef.current) {
    // Resume drawing when user drops back to one finger after a pinch
    handleDragStart(e.lngLat.lng, e.lngLat.lat, e.point);
    return;
  }
  handleDragMove(e.lngLat.lng, e.lngLat.lat, e.point);
};
```

---

## P0-1: Replace drag-to-draw with "pan-under-frame" pattern on mobile

**File**: `MapScreen.tsx`

On mobile (non-desktop), when draw mode is activated, instead of disabling map pan and requiring drag-to-draw, show a fixed centered frame overlay with a confirm button. The user pans/zooms the map underneath the frame, then taps "Set this area" to commit.

### Changes:

1. **Gate draw mode to desktop only** — In MapScreen.tsx, change:
   ```tsx
   drawMode={isDesktop ? drawMode : null}
   ```
   When on mobile, `drawMode` stays null so MapAuthoringCanvas never attaches touch handlers or disables pan. The map stays fully interactive.

2. **Frame overlay** — Inside the map container div, add a frame overlay when drawMode is active on mobile:
   ```tsx
   {drawMode === 'draw_rectangle' && !isDesktop ? (
     <>
       <div
         aria-hidden="true"
         className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
       >
         <div
           data-testid="draw-frame"
           className="h-3/5 w-4/5 rounded-sm border-2 border-dashed border-primary shadow-[0_0_0_9999px_rgba(4,20,92,0.35)]"
         />
       </div>
       <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
         <Button onClick={handleConfirmFrame}>
           {intl.formatMessage(mapMessages.setThisArea)}
         </Button>
       </div>
     </>
   ) : null}
   ```

3. **Confirm handler** — In MapScreen.tsx, add a handler that reads the map viewport and computes the bbox from the frame position:
   ```typescript
   const FRAME_LEFT = 0.1;   // 10% from left
   const FRAME_TOP = 0.2;    // 20% from top
   const FRAME_WIDTH = 0.8;  // 80% of viewport
   const FRAME_HEIGHT = 0.6; // 60% of viewport
   
   function handleConfirmFrame() {
     const map = mapRef.current?.getMap();
     if (!map) return;
     const canvas = map.getCanvas();
     const w = canvas.clientWidth;
     const h = canvas.clientHeight;
     // Project the 4 corners of the frame to geographic coordinates
     const corners = [
       map.unproject([w * FRAME_LEFT, h * FRAME_TOP]),
       map.unproject([w * (FRAME_LEFT + FRAME_WIDTH), h * FRAME_TOP]),
       map.unproject([w * (FRAME_LEFT + FRAME_WIDTH), h * (FRAME_TOP + FRAME_HEIGHT)]),
       map.unproject([w * FRAME_LEFT, h * (FRAME_TOP + FRAME_HEIGHT)]),
     ];
     const lngs = corners.map((c) => c.lng);
     const lats = corners.map((c) => c.lat);
     setBbox([
       Math.min(...lngs),
       Math.min(...lats),
       Math.max(...lngs),
       Math.max(...lats),
     ]);
     setDrawMode('simple_select');
   }
   ```

4. **Update instruction banner** — Change the mobile instruction text. Place the frame OVERLAY after the instruction banner so both are visible. The instruction text doesn't need to change but the frame makes it self-explanatory.

---

## P0-2: Add Undo toast after bbox commit (both platforms)

**File**: `MapScreen.tsx`

When the user draws/confirms a new bbox, show a temporary "Map area updated → Undo" toast at the bottom that restores the previous bbox.

### Changes:

1. Add state and refs:
   ```typescript
   const previousBboxRef = useRef<[number, number, number, number] | null>(null);
   const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const [showUndo, setShowUndo] = useState(false);
   ```

2. Modify the `setBbox` wrapper to track previous bbox and show undo:
   ```typescript
   function handleDrawCreate(next: [number, number, number, number]) {
     previousBboxRef.current = bbox;
     setBbox(next);
     setShowUndo(true);
     if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
     undoTimerRef.current = setTimeout(() => setShowUndo(false), 6000);
   }
   ```

3. Undo handler:
   ```typescript
   function handleUndoDraw() {
     if (previousBboxRef.current) setBbox(previousBboxRef.current);
     setShowUndo(false);
   }
   ```

4. Wire `handleDrawCreate` as `onDrawCreate` instead of `setBbox` directly.

5. Clean up timer on unmount:
   ```typescript
   useEffect(() => {
     return () => {
       if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
     };
   }, []);
   ```

6. Render undo toast (inside the map container):
   ```tsx
   {showUndo ? (
     <div
       role="status"
       className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-btn bg-black/80 px-4 py-2 shadow-card"
     >
       <span className="text-sm text-white">
         {intl.formatMessage(mapMessages.areaUpdated)}
       </span>
       <button
         type="button"
         onClick={handleUndoDraw}
         className="min-h-[44px] text-sm font-semibold text-white underline"
         style={{ touchAction: 'manipulation' }}
       >
         {intl.formatMessage(mapMessages.undo)}
       </button>
     </div>
   ) : null}
   ```

---

## P1-1: Banner shouldn't block drawing

**File**: `MapScreen.tsx`, the instruction banner div

Add `pointer-events-none` to the banner container and `pointer-events-auto` to the Cancel button:

```tsx
<div className="pointer-events-none absolute left-3 right-16 top-3 z-10 flex items-center gap-2 rounded-btn bg-black/70 px-3 py-2 shadow-card">
  <p className="pointer-events-auto flex-1 text-sm text-white">
    {intl.formatMessage(mapMessages.drawingInstruction)}
  </p>
  <button
    type="button"
    onClick={() => setDrawMode('simple_select')}
    className="pointer-events-auto shrink-0 text-sm font-medium text-white underline min-h-[44px] px-2"
    style={{ touchAction: 'manipulation' }}
  >
    {intl.formatMessage(mapMessages.drawingInstructionCancel)}
  </button>
</div>
```

---

## Messages to Add

In `messages.ts`:
```typescript
setThisArea: {
  id: 'map.bounds.setThisArea',
  defaultMessage: 'Set this area',
},
areaUpdated: {
  id: 'map.bounds.areaUpdated',
  defaultMessage: 'Map area updated',
},
undo: {
  id: 'map.bounds.undo',
  defaultMessage: 'Undo',
},
frameInstruction: {
  id: 'map.bounds.frameInstruction',
  defaultMessage: 'Pan and zoom until the area fits inside the frame',
},
```

---

## After Changes

```bash
npm test -- --run MapScreen/
npm run extract-messages
npx prettier --write src/screens/MapScreen/
```

Verify all existing tests still pass.
