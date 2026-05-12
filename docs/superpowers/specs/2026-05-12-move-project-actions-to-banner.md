# Move Project Action Buttons from Sidebar to Main Content

**Date:** 2026-05-12
**Status:** Approved

## Problem

Project action buttons (Edit, Delete, Import Data) currently live in the 268px secondary sidebar alongside each project name. This cramps the sidebar — project names get truncated and the row becomes visually noisy with multiple small icon buttons. The sidebar should be a clean, scannable list of project names.

## Solution

Move all project action buttons (Edit, Delete, Import Data) from the sidebar into the `ProjectBannerCard` in the main content area. The sidebar becomes a simple list of clickable project names.

## Design

### Sidebar (ArchiveBrowser + ProjectList)

Each project row becomes:
- **Before:** `[name button] [edit icon] [delete icon] [import icon]`
- **After:** `[name button]` (full width, truncated with ellipsis)

Props removed from `ArchiveBrowser`:
- `onEditProject`
- `onDeleteProject`
- `onImportComplete`

Props removed from `ProjectList`:
- `onEdit`
- `onDelete`

### ProjectBannerCard

New action bar added between the description and stats pills:

```
+----------------------------------------------------------+
|  [Background image + gradient overlay]                    |
|                                                          |
|  Project Name                                            |
|  Description text...                                     |
|                                                          |
|  [Edit] [Import Data]                    [Delete]         |
|                                                          |
|  [Territory Area pill] [Last Sync pill] [Team pill]      |
+----------------------------------------------------------+
```

**Action bar layout:**
- Left-aligned: Edit button (secondary, pencil icon + label) + Import Data button (secondary, upload icon + label, local projects only)
- Right-aligned: Delete button (ghost, trash icon, error-colored hover)

**New props:**
- `onEdit?: () => void`
- `onDelete?: () => void`
- `projectLocalId?: string` (for ImportDataButton)
- `projectName?: string` (for ImportDataButton)
- `onImportComplete?: (result: { imported: number; skipped: number }) => void`
- `isLocalProject?: boolean`

Note: `ImportDataButton` is rendered directly inside `ProjectBannerCard` (not via callback) since it manages its own file input state internally.

### HomeScreen

- Stop passing `onEditProject`, `onDeleteProject`, `onImportComplete` to `ArchiveBrowser`
- Pass action callbacks to `ProjectBannerCard` instead
- Import Data button is rendered inside `ProjectBannerCard` (or triggered via callback to `HomeScreen`)

### i18n

New/updated messages in `ProjectBannerCard`:
- `editProject` — "Edit Project"
- `importData` — "Import Data"
- `deleteProject` — "Delete Project"

### Files Changed

| File | Change |
|------|--------|
| `src/screens/Home/ProjectBannerCard.tsx` | Add action bar with Edit, Import Data, Delete buttons |
| `src/screens/Home/ArchiveBrowser.tsx` | Remove action buttons from project rows, remove unused props |
| `src/screens/Home/ProjectList.tsx` | Remove action buttons, remove unused props |
| `src/screens/Home/HomeScreen.tsx` | Wire action callbacks to ProjectBannerCard instead of ArchiveBrowser |
| `tests/unit/screens/Home/ProjectBannerCard.test.tsx` | New tests for action bar |
| `tests/unit/screens/Home/ArchiveBrowser.test.tsx` | Update to verify buttons removed |
| `tests/unit/screens/Home/HomeScreen.test.tsx` | Update wiring tests |

### Mobile

No special handling needed. On mobile the sidebar becomes a drawer (same clean project list). The `ProjectBannerCard` with actions is already in the main content area which renders the same on all viewports.

### Accessibility

- Edit and Import Data buttons have visible text labels (not icon-only)
- Delete button uses `aria-label` since it's icon-only
- All buttons are focusable with keyboard navigation
- Focus-visible ring styles maintained
