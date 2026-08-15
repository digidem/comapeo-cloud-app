# Production tile rate-limit measurement

The baseline in `production-baseline-2026-08-14.json` was measured against the real production application at `https://app.comapeo.cloud` on 2026-08-14.

Capture conditions:

- Browser: headless Chromium via the repository Playwright installation on Linux.
- Network: unthrottled runner connectivity. This is intentionally conservative for request-burst measurement because faster delivery produces a higher instantaneous request rate than typical field connectivity.
- Tile provider: the curated Esri World Imagery raster source (`server.arcgisonline.com`) through the production `/api/tiles` proxy.
- Small sample: bbox `[-48.51, -1.47, -48.49, -1.45]`, zoom 0–12, one complete SMP download.
- Large sample: bbox `[-48.55, -1.51, -48.45, -1.41]`, zoom 0–16, two complete SMP downloads executed back-to-back from the same machine/IP. Their HAR entries were combined by original request timestamp before measurement so the 60-second window includes both legitimate downloads.
- Result: all three downloads reached the application's success state with no observed tile-request failures or HTTP 429 responses.
- Cloudflare-facing HAR counts used by the repository measurement tool: 362 requests for the small sample and 3,136 requests for the combined large sample, with all large-sample requests occurring inside 51.426 seconds.
- Raw HAR files were intentionally not committed because HARs may contain operational request metadata.

The measured legitimate maximum is 3,136 requests in a 60-second window. Applying the repository's default 1.5 safety multiplier yields the current recommended observation threshold of 4,710 requests per 60 seconds. This remains an observation starting point, not automatic permission to enforce; shared-IP behavior and Cloudflare would-block analytics still need to be checked before enforcement.
