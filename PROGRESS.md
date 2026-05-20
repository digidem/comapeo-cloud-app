# PROGRESS.md — Mobile Responsiveness & UX Polish Sprint

> **Goal**: Make every screen pixel-perfect on mobile, add media thumbnails to observations, and polish the mobile navigation with smooth animations.

---

## Phase 1: Mobile Screenshot Audit (Baseline)

Capture every screen at **375×812** (mobile viewport) so we have a before/after comparison and can feed images to Codex GPT 5.5 mini for feedback.

### Task 1.1 — Create comprehensive mobile screenshot test suite

**Status**: `pending`

**What**: Create `tests/e2e/mobile-audit.screenshots.ts` that captures every screen at mobile viewport (375×812) with the default `cloud` theme. This gives us a single deterministic baseline.

**Screens to capture** (all at mobile viewport only):

| # | Screenshot name | Route / Interaction |
|---|----------------|---------------------|
| 1 | `mobile-login` | `/login` |
| 2 | `mobile-home-empty` | `/` (no projects) |
| 3 | `mobile-home-project` | `/` (create "Demo Project", wait for heading) |
| 4 | `mobile-data-observations` | `/data` (observations tab) |
| 5 | `mobile-data-alerts` | `/data` (alerts tab — click tab if needed) |
| 6 | `mobile-observation-detail` | `/data/observations/obs-1` |
| 7 | `mobile-alert-detail` | `/data/alerts/alert-1` |
| 8 | `mobile-create-alert` | `/data/alerts/new` |
| 9 | `mobile-settings` | `/settings` (full page) |
| 10 | `mobile-settings-invite-form` | `/settings` (scroll to Remote Archive Invites) |
| 11 | `mobile-settings-backup` | `/settings` (scroll to Backup & Restore) |
| 12 | `mobile-settings-clear-dialog` | `/settings` → click "Clear All Data" |
| 13 | `mobile-invite` | `/invite?code=test-code` |
| 14 | `mobile-not-found` | `/nonexistent-route` |
| 15 | `mobile-menu-drawer-closed` | `/` (hamburger button visible, drawer closed) |
| 16 | `mobile-menu-drawer-open` | `/` → click hamburger, drawer open |

**Implementation notes**:
- Use `setupMockServer(page)` from `./mock-server`
- Use `VIEWPORTS.mobile` from `./screenshot-utils`
- Use `reducedMotion: 'reduce'` to avoid flaky animation states
- Save all to `screenshots/mobile/` with `mobile-` prefix
- Pattern follows existing `app.screenshots.ts` / `feature.screenshots.ts`

**Files to create/modify**:
- `tests/e2e/mobile-audit.screenshots.ts` (new)

---

### Task 1.2 — Run mobile screenshots and generate manifest

**Status**: `pending`

**What**: Execute `npm run test:screenshots` (or the specific Playwright project) to generate all mobile PNGs. Then run `npm run review:visual` to get the JSON manifest.

**Commands**:
```bash
npx playwright test mobile-audit --project=screenshot
npm run review:visual
```

---

### Task 1.3 — Submit mobile screenshots to Codex GPT 5.5 mini for review

**Status**: `pending`

**What**: Feed each mobile screenshot to Codex GPT 5.5 mini (or equivalent vision LLM) with a structured review prompt. Collect feedback in a structured format.

**Review prompt template**:
```
You are a senior mobile UX/UI reviewer. Analyze this mobile screenshot (375px wide) of a web dashboard for environmental monitoring teams.

For each issue found, provide:
1. Severity: CRITICAL | MAJOR | MINOR | SUGGESTION
2. Component: Which UI element is affected
3. Issue: What's wrong
4. Recommendation: How to fix it

Focus areas:
- Touch targets (minimum 44px)
- Text readability and contrast
- Horizontal overflow / clipping
- Spacing and padding consistency
- Navigation usability
- Form input sizing
- Card/content layout on narrow viewports
- Image/media scaling
```

**Deliverable**: Paste the full Codex feedback into this file under a `## Codex Feedback — Phase 1 Baseline` section (or keep in a separate review document).

---

## Phase 2: Fix Responsive Layout Issues

Address all issues identified in Phase 1, plus known issues.

### Task 2.1 — Fix Settings screen mobile layout (KNOWN BROKEN)

**Status**: `pending`

**What**: The Settings screen (`src/screens/SettingsScreen.tsx`) is confirmed broken on mobile. The Remote Archive Invites section, Backup & Restore section, and Clear Data section need responsive treatment.

**Known issues**:
- Form inputs likely overflow on narrow screens
- Sections may lack proper mobile padding
- `max-w-md` on forms may be too wide for mobile
- Buttons may not be full-width on mobile

**Files to modify**:
- `src/screens/SettingsScreen.tsx`

**Approach**:
- Ensure all form sections use `w-full` on mobile with proper padding
- Make buttons full-width on mobile (`w-full sm:w-auto`)
- Add responsive spacing between sections
- Wrap long URLs/invite codes for mobile
- Test Clear Data dialog is usable on 375px

---

### Task 2.2 — Fix all screens identified by Codex review

**Status**: `pending` *(blocked by Task 1.3)*

**What**: Apply all CRITICAL and MAJOR fixes from the Codex GPT 5.5 mini review. This is a catch-all task for responsive fixes across screens.

**Screens that likely need fixes** (based on codebase analysis):
- `DataScreen.tsx` — tab layout on mobile
- `ObservationDetailScreen.tsx` — detail view layout
- `AlertDetailScreen.tsx` — alert detail layout
- `CreateAlertScreen.tsx` — form layout on mobile
- `InviteScreen.tsx` — invite acceptance flow
- `LoginScreen.tsx` — login form sizing
- `HomeScreen.tsx` — banner card, activity list on mobile

**Files to modify**:
- Various screen files in `src/screens/`

---

### Task 2.3 — Take post-fix mobile screenshots

**Status**: `pending` *(blocked by Task 2.2)*

**What**: Re-run the mobile screenshot suite to capture the "after" state. Compare with baseline.

**Commands**:
```bash
npx playwright test mobile-audit --project=screenshot
```

---

### Task 2.4 — Submit post-fix screenshots to Codex for final review

**Status**: `pending` *(blocked by Task 2.3)*

**What**: Feed the post-fix screenshots to Codex GPT 5.5 mini again. Ensure all CRITICAL and MAJOR issues are resolved. Iterate if needed.

---

## Phase 3: Observation Media Thumbnails

### Task 3.1 — Write failing test for observation media preview component

**Status**: `pending`

**What**: Create a `MediaPreview` component that shows attachment thumbnails on observation cards in the Data screen.

**Requirements**:
- Show up to 2 image thumbnails side-by-side
- If there are 3+ media items (photos + audio), show first 2 thumbnails + a "+N more" button that links to the observation detail
- Audio attachments show a waveform/audio icon placeholder
- Thumbnails are 48×48px with rounded corners (12px radius per design system)
- If no attachments, show nothing (no placeholder)

**Files to create**:
- `tests/unit/components/shared/MediaPreview.test.tsx` (test first, TDD)

---

### Task 3.2 — Implement MediaPreview component

**Status**: `pending` *(blocked by Task 3.1)*

**What**: Build the `MediaPreview` component to pass the tests.

**Files to create**:
- `src/components/shared/MediaPreview.tsx`

**Design specs**:
- Container: `flex gap-2 items-center`
- Thumbnail: `w-12 h-12 rounded-btn object-cover bg-surface-container-low`
- "+N more" button: pill-shaped (`rounded-full`), `bg-primary-soft text-primary text-xs font-medium`
- Audio icon: SVG waveform icon, `bg-surface-container-low` background
- Uses `photoUrls` and `audioCount` from observation tags (already parsed in `remote-archive.ts`)

---

### Task 3.3 — Integrate MediaPreview into observation list/cards

**Status**: `pending` *(blocked by Task 3.2)*

**What**: Add `MediaPreview` to the observation cards in the Data screen. Each observation row/card should show media thumbnails inline.

**Files to modify**:
- `src/screens/DataScreen.tsx` (observation list rendering)

**Integration notes**:
- Read `tags.photoUrls`, `tags.photoCount`, `tags.audioCount` from each observation
- Place thumbnails after the observation text/tags, before the timestamp
- On mobile, thumbnails should stack or wrap naturally

---

### Task 3.4 — Write tests for MediaPreview integration

**Status**: `pending` *(blocked by Task 3.3)*

**What**: Update DataScreen tests to verify media previews render in the observation list.

**Files to modify**:
- `tests/unit/screens/DataScreen.test.tsx`

---

### Task 3.5 — Take screenshots of observations with media previews

**Status**: `pending` *(blocked by Task 3.4)*

**What**: Add a mobile screenshot for the Data screen showing observations with media thumbnails. Also submit to Codex for review.

**Files to modify**:
- `tests/e2e/mobile-audit.screenshots.ts` (add or update observation screenshots)

---

## Phase 4: Mobile Menu Animation & Polish

### Task 4.1 — Write failing test for animated hamburger button

**Status**: `pending`

**What**: The hamburger button in the Topbar (`src/components/layout/topbar.tsx`) is currently a plain SVG with no animation. Add a morphing animation: three bars → X when menu opens.

**Requirements**:
- Hamburger icon (3 bars) morphs to close icon (X) when drawer opens
- Smooth CSS transition (~200ms)
- Uses `motion-safe:` prefix so reduced-motion users get instant toggle
- The button should feel tactile — slight scale press effect

**Files to create/modify**:
- `tests/unit/components/layout/topbar.test.tsx` (add animation state tests)

---

### Task 4.2 — Implement animated hamburger/close button

**Status**: `pending` *(blocked by Task 4.1)*

**What**: Refactor the Topbar hamburger button to accept an `isMenuOpen` prop and animate between hamburger and close states.

**Design approach**:
- Use 3 `<span>` elements (bars) with CSS transforms
- Bar 1: rotates 45deg + translates down
- Bar 2: fades out (opacity 0)
- Bar 3: rotates -45deg + translates up
- Transition: `transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease`
- Active state: `scale-90` for tactile press feel
- The close button inside the drawer header should be removed (the hamburger now serves as both open/close)

**Files to modify**:
- `src/components/layout/topbar.tsx`
- `src/components/layout/app-shell.tsx` (pass `mobileMenuOpen` to Topbar)

---

### Task 4.3 — Enhance MobileNavDrawer slide animation

**Status**: `pending`

**What**: The drawer already has a basic slide animation. Enhance it with:
- Staggered nav item entrance (each item slides in with a slight delay)
- Subtle backdrop blur on the overlay
- Spring-like easing curve
- Drawer header with logo + animated close button

**Current state** (`src/components/layout/mobile-nav-drawer.tsx`):
- Has basic `translate-x` transition with `duration-200`
- Uses `cubic-bezier(0.16, 1, 0.3, 1)` easing
- No staggered items, no backdrop blur

**Enhancements**:
- Overlay: add `backdrop-blur-sm` to the overlay
- Drawer slide: increase duration to `300ms` for smoother feel
- Nav items: use CSS `animation-delay` with stagger (0ms, 30ms, 60ms, etc.)
- Each item fades in + slides from left: `@keyframes slideInLeft { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }`
- Active item has a subtle left border accent (4px pill indicator matching desktop)
- Add a subtle gradient or divider between nav and secondary content

**Files to modify**:
- `src/components/layout/mobile-nav-drawer.tsx`
- `src/app/index.css` (add keyframes if needed)

---

### Task 4.4 — Write tests for enhanced drawer animations

**Status**: `pending` *(blocked by Task 4.3)*

**What**: Update existing tests to verify the new animation classes and stagger behavior.

**Files to modify**:
- `tests/unit/components/layout/mobile-nav-drawer.test.tsx`
- `tests/unit/components/layout/app-shell.test.tsx`

---

### Task 4.5 — Take screenshots of mobile menu (open + closed states)

**Status**: `pending` *(blocked by Task 4.4)*

**What**: Capture the mobile menu in both states. Since animations are `motion-safe:`, use `reducedMotion: 'reduce'` for deterministic screenshots. Also capture a "motion enabled" screenshot for visual review.

**Screenshots**:
- `mobile-menu-closed` — hamburger visible in topbar
- `mobile-menu-open` — drawer open with nav items
- `mobile-menu-open-motion` — with animations enabled (no `reducedMotion`)

**Submit to Codex for feedback on the visual polish.**

---

## Phase 5: Final Polish & Regression

### Task 5.1 — Run full test suite

**Status**: `pending` *(blocked by all Phase 2-4 tasks)*

**What**: Run all tests to ensure no regressions.

**Commands**:
```bash
npm test                    # Unit tests
npm run test:coverage       # Coverage (80% threshold)
npm run lint:eslint         # ESLint
npm run lint:types          # TypeScript
npm run lint:prettier       # Formatting
npm run extract-messages    # i18n extraction check
```

---

### Task 5.2 — Final mobile screenshot suite + Codex review

**Status**: `pending` *(blocked by Task 5.1)*

**What**: Run the complete mobile screenshot suite one final time. Submit all screenshots to Codex GPT 5.5 mini for a comprehensive review. Address any remaining feedback.

---

### Task 5.3 — Update existing desktop screenshots if layouts changed

**Status**: `pending` *(blocked by Task 5.2)*

**What**: Re-run the full screenshot suite (desktop + mobile, all themes) to ensure desktop layouts weren't broken by responsive changes.

**Commands**:
```bash
npm run test:screenshots
npm run review:visual
```

---

## Summary of Files

### New files
| File | Purpose |
|------|---------|
| `tests/e2e/mobile-audit.screenshots.ts` | Mobile-only screenshot test suite |
| `src/components/shared/MediaPreview.tsx` | Observation media thumbnail component |
| `tests/unit/components/shared/MediaPreview.test.tsx` | Tests for MediaPreview |

### Modified files
| File | Changes |
|------|---------|
| `src/screens/SettingsScreen.tsx` | Mobile responsive layout fixes |
| `src/screens/DataScreen.tsx` | Integrate MediaPreview into observation list |
| `src/components/layout/topbar.tsx` | Animated hamburger/close button |
| `src/components/layout/app-shell.tsx` | Pass menu state to Topbar |
| `src/components/layout/mobile-nav-drawer.tsx` | Enhanced slide + stagger animations |
| `src/app/index.css` | Keyframe animations for drawer items |
| `tests/unit/screens/DataScreen.test.tsx` | Media preview integration tests |
| `tests/unit/components/layout/topbar.test.tsx` | Animation state tests |
| `tests/unit/components/layout/mobile-nav-drawer.test.tsx` | Enhanced animation tests |
| `tests/unit/components/layout/app-shell.test.tsx` | Updated drawer interaction tests |

---

## Execution Order

```
Phase 1 (Audit) ──→ Phase 2 (Fix responsive) ──→ Phase 5 (Regression)
                     Phase 3 (Media thumbnails)  ──↗
                     Phase 4 (Menu animations)   ──↗
```

Phases 2, 3, and 4 can be executed in parallel after Phase 1 completes. Phase 5 is the final gate.
