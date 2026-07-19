# Greptile Review Fixes — PR #125

## Files to Modify

1. `src/lib/map/smp-download.ts`
2. `src/screens/MapScreen/DownloadPanel.tsx`

## Fix 1-2-4-5: Recovery Write Leaves Downloading / Error Stays Downloading

There are 4 threads about the same issue in `smp-download.ts`. When the blob storage write at line 282 fails (e.g. IndexedDB quota), the `recordFailureStatus` call at line 287 also tries to write to Dexie. If that ALSO fails (same quota), the error is swallowed silently and the map stays `downloading`. On reload the user sees "interrupted download" instead of the real storage error.

### Fix for smp-download.ts lines 275-292

Change the blob storage handler to update status BEFORE attempting the status update. Since the status update is a small key-value write (no blob), it's very likely to succeed even when the blob write fails. Use a direct update instead of `recordFailureStatus` so the failure to record is explicit:

```tsx
  // --- Store in Dexie ---
  try {
    await db.maps.update(map.id, {
      smpBlob: blob,
      smpSize: totalSize,
      status: 'ready',
      errorMessage: undefined,
    });
  } catch (storageError) {
    const message =
      storageError instanceof Error
        ? `Storage error: ${storageError.message}`
        : 'Storage error: unable to save map';
    // Best-effort recovery: this is a tiny key-value update and should
    // succeed even when the blob write failed (IndexedDB quota tiers).
    // If this also fails, the original storageError is still thrown.
    try {
      await db.maps.update(map.id, {
        status: 'error',
        errorMessage: message,
      });
    } catch {
      // Swallow — the original error is authoritative.
    }
    throw storageError;
  }
```

This replaces the `recordFailureStatus` call with an inline try-catch, so:
- The original `storageError` is always thrown (the catch clause is a secondary concern)
- The status update is attempted directly (smaller operation)
- If the status update fails, the original error propagates

### Fix for smp-download.ts lines 217-220, 237-240, 244-247, 267-270

These four `recordFailureStatus` calls all have the same pattern: they try to record the error, then throw the original error. If `recordFailureStatus` fails, the throw after it doesn't execute.

Change each to use the same inline try-catch pattern. Example:

```tsx
    // lines 210-222 (setupError)
    const message =
      setupError instanceof Error
        ? setupError.message
        : 'Download setup failed';
    try {
      await db.maps.update(map.id, {
        status: 'error',
        errorMessage: message,
      });
    } catch {
      // Best-effort — original error is authoritative.
    }
    throw setupError;
```

```tsx
    // lines 236-248 (stream error + abort)
    if (signal?.aborted) {
      try {
        await db.maps.update(map.id, {
          status: 'draft',
          errorMessage: undefined,
        });
      } catch {
        // Best-effort
      }
      throw new DOMException('Download cancelled', 'AbortError');
    }
    const message = error instanceof Error ? error.message : 'Download failed';
    try {
      await db.maps.update(map.id, {
        status: 'error',
        errorMessage: message,
      });
    } catch {
      // Best-effort
    }
    throw error;
```

```tsx
    // lines 258-272 (blob creation error)
    const message =
      blobError instanceof Error
        ? `Failed to create download package: ${blobError.message}`
        : 'Failed to create download package';
    try {
      await db.maps.update(map.id, {
        status: 'error',
        errorMessage: message,
      });
    } catch {
      // Best-effort
    }
    throw blobError;
```

Then remove the `recordFailureStatus` function entirely (lines 80-90) since it's no longer used.

## Fix 3: Ready Export Fails Silently (DownloadPanel.tsx)

This thread is about the "Ready Export" handler in DownloadPanel.tsx (lines 208-243). Looking at the current code, it ALREADY has a try-catch that sets status to `error` when export fails. So the current code already handles this.

The thread refers to OLD code at lines 209-210 before the try-catch was added. No additional code change is needed — this thread is stale.

## After fixes

Run tests:
```bash
npm test -- --run MapScreen/ 2>&1 | tail -10
```

The `recordFailureStatus` function removal means imports may need updating. If `recordFailureStatus` was only used internally, no import change needed.

## Thread IDs to resolve after fixes:
1. PRRT_kwDOSXFPbs6RMdO8
2. PRRT_kwDOSXFPbs6ROa5U
3. PRRT_kwDOSXFPbs6ROa6y
4. PRRT_kwDOSXFPbs6RUsfm
5. PRRT_kwDOSXFPbs6RU7nn
