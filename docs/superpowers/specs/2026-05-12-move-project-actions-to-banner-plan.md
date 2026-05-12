# Move Project Actions to Banner Card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move edit, delete, and import-data action buttons from the sidebar project rows into the ProjectBannerCard in the main content area, leaving the sidebar as a clean list of project names.

**Architecture:** Remove action icon buttons from `ArchiveBrowser` and `ProjectList` sidebar components. Add an action bar (Edit, Import Data, Delete) to `ProjectBannerCard` between the description and stats pills. Wire callbacks through `HomeScreen`.

**Tech Stack:** React, TypeScript, react-intl, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Remove action buttons from ArchiveBrowser

**Files:**
- Modify: `src/screens/Home/ArchiveBrowser.tsx:49-58` (props interface)
- Modify: `src/screens/Home/ArchiveBrowser.tsx:82-91` (destructured props)
- Modify: `src/screens/Home/ArchiveBrowser.tsx:300-374` (project rows)
- Test: `tests/unit/screens/Home/HomeScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test to `tests/unit/screens/Home/HomeScreen.test.tsx` verifying that the sidebar project rows no longer contain edit/delete/import buttons. Add this inside the existing `describe('HomeScreen', ...)` block, after the `'shows project list when projects exist'` test:

```tsx
it('does not render edit/delete/import buttons in sidebar project rows', async () => {
  mockUseProjects.mockReturnValue({
    data: [
      {
        localId: 'p1',
        name: 'Sidebar Clean Project',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
  } as unknown as ReturnType<typeof useProjects>);

  renderWithShell(<HomeScreen />);
  await waitFor(() => {
    expect(screen.getAllByText('Sidebar Clean Project').length).toBeGreaterThan(0);
  });

  // Sidebar project rows should NOT contain edit or delete aria-labels
  const secondarySection = screen.getByTestId('shell-secondary');
  expect(
    within(secondarySection).queryByRole('button', { name: /edit project/i }),
  ).toBeNull();
  expect(
    within(secondarySection).queryByRole('button', { name: /delete project/i }),
  ).toBeNull();
  expect(
    within(secondarySection).queryByRole('button', { name: /import data into/i }),
  ).toBeNull();
});
```

Note: Add `within` to the imports at the top of the test file (it's already imported).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/screens/Home/HomeScreen.test.tsx --reporter=verbose 2>&1 | tail -30`
Expected: FAIL — the sidebar still renders edit/delete/import buttons.

- [ ] **Step 3: Remove action buttons from ArchiveBrowser**

In `src/screens/Home/ArchiveBrowser.tsx`:

1. Remove `onEditProject`, `onDeleteProject`, and `onImportComplete` from the `ArchiveBrowserProps` interface (lines 54-55, 57).

2. Remove them from the destructured props in the component function (lines 87-88, 90).

3. Remove the edit button, delete button, and ImportDataButton from each project row (lines 319-373). Replace the entire project row content with just the name button. The project row div (line 304-374) becomes:

```tsx
{archiveProjects.map((project) => {
  const isActive = project.localId === selectedProjectId;
  return (
    <div
      key={project.localId}
      className={`flex items-center px-3 py-1.5 rounded-btn text-sm transition-colors ${
        isActive
          ? 'bg-primary-soft text-primary font-medium'
          : 'text-text hover:bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(project.localId)}
        className="flex-1 text-left truncate cursor-pointer focus:outline-none"
      >
        {project.name ?? 'Untitled'}
      </button>
    </div>
  );
})}
```

4. Remove the `ImportDataButton` import at line 11.

- [ ] **Step 4: Update HomeScreen to stop passing removed props to ArchiveBrowser**

In `src/screens/Home/HomeScreen.tsx`, find the `secondaryContent` useMemo (around line 553-576). Remove the `onEditProject`, `onDeleteProject`, and `onImportComplete` props from the `<ArchiveBrowser>` JSX:

Before:
```tsx
<ArchiveBrowser
  selectedProjectId={state.selectedProjectId}
  onSelect={(id) => dispatch({ type: 'SELECT_PROJECT', id })}
  onCreateNew={handleOpenCreateDialog}
  onAddServer={() => dispatch({ type: 'OPEN_ADD_SERVER_DIALOG' })}
  onEditProject={(id) => dispatch({ type: 'OPEN_EDIT_DIALOG', id })}
  onDeleteProject={(id) => dispatch({ type: 'OPEN_DELETE_DIALOG', id })}
  onSelectServer={(id) => dispatch({ type: 'SELECT_SERVER', id })}
  onImportComplete={handleIncrementRefresh}
/>
```

After:
```tsx
<ArchiveBrowser
  selectedProjectId={state.selectedProjectId}
  onSelect={(id) => dispatch({ type: 'SELECT_PROJECT', id })}
  onCreateNew={handleOpenCreateDialog}
  onAddServer={() => dispatch({ type: 'OPEN_ADD_SERVER_DIALOG' })}
  onSelectServer={(id) => dispatch({ type: 'SELECT_SERVER', id })}
/>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/screens/Home/HomeScreen.test.tsx --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Home/ArchiveBrowser.tsx src/screens/Home/HomeScreen.tsx tests/unit/screens/Home/HomeScreen.test.tsx
git commit -m "refactor(sidebar): remove edit/delete/import buttons from ArchiveBrowser project rows"
```

---

### Task 2: Remove action buttons from ProjectList

**Files:**
- Modify: `src/screens/Home/ProjectList.tsx:6-16` (props interface)
- Modify: `src/screens/Home/ProjectList.tsx:53-63` (component function)
- Modify: `src/screens/Home/ProjectList.tsx:101-168` (project list items)
- Test: `tests/unit/screens/Home/ProjectList.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test to `tests/unit/screens/Home/ProjectList.test.tsx` verifying no edit/delete buttons:

```tsx
it('does not render edit or delete buttons', () => {
  render(
    <ProjectList
      projects={projects}
      selectedProjectId={null}
      onSelect={vi.fn()}
      onCreateNew={vi.fn()}
    />,
  );

  expect(screen.queryByRole('button', { name: /edit project/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /delete project/i })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/screens/Home/ProjectList.test.tsx --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — edit/delete buttons still exist.

- [ ] **Step 3: Remove action buttons from ProjectList**

In `src/screens/Home/ProjectList.tsx`:

1. Remove `onEdit` and `onDelete` from `ProjectListProps` interface (lines 11-12).

2. Remove them from the destructured props (lines 58-59).

3. Remove the `editAria` and `deleteAria` messages from the `defineMessages` block (lines 43-50).

4. Simplify each project list item (lines 106-165). The `li` becomes:

```tsx
<li key={project.localId}>
  <div
    className={`flex items-center px-3 py-2 min-h-[44px] rounded-btn text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary-soft text-primary'
        : 'text-text hover:bg-surface'
    }`}
  >
    <button
      type="button"
      onClick={() => onSelect(project.localId)}
      className="flex-1 text-left cursor-pointer focus:outline-none"
    >
      {project.name ??
        intl.formatMessage(messages.untitledProject)}
    </button>
  </div>
</li>
```

- [ ] **Step 4: Update all existing tests to remove onEdit/onDelete props**

In `tests/unit/screens/Home/ProjectList.test.tsx`, remove `onEdit={vi.fn()}` and `onDelete={vi.fn()}` from every `<ProjectList>` render call. There are 6 occurrences.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/screens/Home/ProjectList.test.tsx --reporter=verbose 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/screens/Home/ProjectList.tsx tests/unit/screens/Home/ProjectList.test.tsx
git commit -m "refactor(sidebar): remove edit/delete buttons from ProjectList component"
```

---

### Task 3: Add action bar to ProjectBannerCard

**Files:**
- Modify: `src/screens/Home/ProjectBannerCard.tsx`
- Create: `tests/unit/screens/Home/ProjectBannerCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/screens/Home/ProjectBannerCard.test.tsx`:

```tsx
import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ProjectBannerCard } from '@/screens/Home/ProjectBannerCard';

describe('ProjectBannerCard', () => {
  const defaultProps = {
    projectName: 'Test Project',
  };

  it('renders project name', () => {
    render(<ProjectBannerCard {...defaultProps} />);
    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });

  it('renders Edit button when onEdit is provided', () => {
    render(<ProjectBannerCard {...defaultProps} onEdit={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /edit project/i }),
    ).toBeInTheDocument();
  });

  it('does not render Edit button when onEdit is not provided', () => {
    render(<ProjectBannerCard {...defaultProps} />);
    expect(
      screen.queryByRole('button', { name: /edit project/i }),
    ).toBeNull();
  });

  it('calls onEdit when Edit button is clicked', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<ProjectBannerCard {...defaultProps} onEdit={onEdit} />);

    await user.click(screen.getByRole('button', { name: /edit project/i }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('renders Delete button when onDelete is provided', () => {
    render(<ProjectBannerCard {...defaultProps} onDelete={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /delete project/i }),
    ).toBeInTheDocument();
  });

  it('does not render Delete button when onDelete is not provided', () => {
    render(<ProjectBannerCard {...defaultProps} />);
    expect(
      screen.queryByRole('button', { name: /delete project/i }),
    ).toBeNull();
  });

  it('calls onDelete when Delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<ProjectBannerCard {...defaultProps} onDelete={onDelete} />);

    await user.click(screen.getByRole('button', { name: /delete project/i }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('renders Import Data button for local projects', () => {
    render(
      <ProjectBannerCard
        {...defaultProps}
        isLocalProject={true}
        projectLocalId="p1"
        onImportComplete={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: /import data/i }),
    ).toBeInTheDocument();
  });

  it('does not render Import Data button for remote projects', () => {
    render(
      <ProjectBannerCard
        {...defaultProps}
        isLocalProject={false}
        projectLocalId="p1"
        onImportComplete={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /import data/i }),
    ).toBeNull();
  });

  it('does not render Import Data button when isLocalProject is not set', () => {
    render(<ProjectBannerCard {...defaultProps} />);
    expect(
      screen.queryByRole('button', { name: /import data/i }),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/screens/Home/ProjectBannerCard.test.tsx --reporter=verbose 2>&1 | tail -30`
Expected: FAIL — `onEdit`, `onDelete`, `isLocalProject` props don't exist yet.

- [ ] **Step 3: Implement the action bar in ProjectBannerCard**

In `src/screens/Home/ProjectBannerCard.tsx`, make these changes:

1. Add imports at the top:

```tsx
import { ImportDataButton } from './ImportDataButton';
```

2. Extend the props interface:

```tsx
interface ProjectBannerCardProps {
  projectName: string;
  description?: string;
  areaSize?: string;
  lastSync?: string | null;
  teamMembersCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  projectLocalId?: string;
  projectName?: string;
  onImportComplete?: (result: { imported: number; skipped: number }) => void;
  isLocalProject?: boolean;
}
```

Note: There's a naming conflict — the existing `projectName` prop (string) and the new `projectName` for ImportDataButton. Use a different prop name for the ImportDataButton's project name. Update the interface to:

```tsx
interface ProjectBannerCardProps {
  projectName: string;
  description?: string;
  areaSize?: string;
  lastSync?: string | null;
  teamMembersCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  projectLocalId?: string;
  onImportComplete?: (result: { imported: number; skipped: number }) => void;
  isLocalProject?: boolean;
}
```

And destructure:

```tsx
export function ProjectBannerCard({
  projectName,
  description,
  areaSize = '0 ha',
  lastSync,
  teamMembersCount = 1,
  onEdit,
  onDelete,
  projectLocalId,
  onImportComplete,
  isLocalProject = false,
}: ProjectBannerCardProps) {
```

3. Add new i18n messages:

```tsx
const messages = defineMessages({
  // ... existing messages ...
  editProject: {
    id: 'dashboard.banner.editProject',
    defaultMessage: 'Edit Project',
  },
  deleteProject: {
    id: 'dashboard.banner.deleteProject',
    defaultMessage: 'Delete Project',
  },
});
```

4. Add the action bar between the description paragraph (`</p>` closing tag at ~line 71) and the stats pills comment (`{/* Stats Pills */}`). Insert:

```tsx
{/* Action Bar */}
{(onEdit || onDelete || isLocalProject) && (
  <div className="flex items-center gap-2 mt-4 mb-4">
    <div className="flex items-center gap-2">
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-btn bg-white/80 backdrop-blur-sm border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-white/90 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
          {intl.formatMessage(messages.editProject)}
        </button>
      )}
      {isLocalProject && projectLocalId && (
        <ImportDataButton
          projectLocalId={projectLocalId}
          projectName={projectName}
          onImportComplete={onImportComplete}
        />
      )}
    </div>
    {onDelete && (
      <button
        type="button"
        onClick={onDelete}
        aria-label={intl.formatMessage(messages.deleteProject)}
        className="ml-auto inline-flex items-center justify-center h-8 w-8 rounded-full text-text-muted hover:text-error hover:bg-white/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/screens/Home/ProjectBannerCard.test.tsx --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Home/ProjectBannerCard.tsx tests/unit/screens/Home/ProjectBannerCard.test.tsx
git commit -m "feat(banner): add action bar with edit, import, delete to ProjectBannerCard"
```

---

### Task 4: Wire action callbacks from HomeScreen to ProjectBannerCard

**Files:**
- Modify: `src/screens/Home/HomeScreen.tsx:840-855` (showNoCoordinates render)
- Modify: `src/screens/Home/HomeScreen.tsx:964-986` (main render)
- Test: `tests/unit/screens/Home/HomeScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test to `tests/unit/screens/Home/HomeScreen.test.tsx` verifying the banner has action buttons:

```tsx
it('shows edit and delete buttons in banner when project is selected', async () => {
  const user = userEvent.setup();
  mockUseProjects.mockReturnValue({
    data: [
      {
        localId: 'p1',
        name: 'Banner Actions Project',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
    status: 'success',
  } as unknown as ReturnType<typeof useProjects>);

  mockUseProjectCoverage.mockReturnValue({
    results: [makeResult('observed', 50000)],
    isCalculating: false,
    error: null,
  });

  renderWithShell(<HomeScreen />);
  await user.click(
    await screen.findByRole('button', { name: 'Banner Actions Project' }),
  );

  expect(
    screen.getByRole('button', { name: /edit project/i }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /delete project/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/screens/Home/HomeScreen.test.tsx --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — ProjectBannerCard doesn't receive onEdit/onDelete yet.

- [ ] **Step 3: Wire callbacks in HomeScreen**

In `src/screens/Home/HomeScreen.tsx`, update every `<ProjectBannerCard>` usage to pass action callbacks.

There are two `<ProjectBannerCard>` instances in the main render path:

**Instance 1** — `showNoCoordinates` branch (around line 843):

```tsx
<ProjectBannerCard
  projectName={
    selectedProject.name ??
    intl.formatMessage(messages.untitledProject)
  }
  areaSize="0 ha"
  teamMembersCount={0}
  onEdit={() => dispatch({ type: 'OPEN_EDIT_DIALOG', id: state.selectedProjectId! })}
  onDelete={() => dispatch({ type: 'OPEN_DELETE_DIALOG', id: state.selectedProjectId! })}
  isLocalProject={!selectedProject?.serverUrl}
  projectLocalId={selectedProject?.localId}
  onImportComplete={handleIncrementRefresh}
/>
```

**Instance 2** — main render branch (around line 966):

```tsx
<ProjectBannerCard
  projectName={
    selectedProject.name ??
    intl.formatMessage(messages.untitledProject)
  }
  areaSize={territoryArea}
  lastSync={(() => {
    const synced = archiveStatus.servers.find((s) => s.lastSyncedAt);
    if (!synced?.lastSyncedAt) return undefined;
    return formatRelativeTime(
      now - new Date(synced.lastSyncedAt).getTime(),
      intl,
    );
  })()}
  teamMembersCount={archiveStatus.servers.length || 1}
  onEdit={() => dispatch({ type: 'OPEN_EDIT_DIALOG', id: state.selectedProjectId! })}
  onDelete={() => dispatch({ type: 'OPEN_DELETE_DIALOG', id: state.selectedProjectId! })}
  isLocalProject={!selectedProject?.serverUrl}
  projectLocalId={selectedProject?.localId}
  onImportComplete={handleIncrementRefresh}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/screens/Home/HomeScreen.test.tsx --reporter=verbose 2>&1 | tail -30`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Home/HomeScreen.tsx tests/unit/screens/Home/HomeScreen.test.tsx
git commit -m "feat(home): wire banner card action buttons to edit/delete/import dialogs"
```

---

### Task 5: Update import integration test and run full test suite

**Files:**
- Modify: `tests/unit/screens/Home/HomeScreen.test.tsx` (import test)

- [ ] **Step 1: Update the import integration test**

The existing test `'refreshes coverage immediately after a successful import'` (line 372-422) clicks an import icon in the sidebar. Since the import button moved to the banner, update it.

The test currently does:
```tsx
const importIcon = await screen.findByRole('button', {
  name: /Import data into/,
});
await user.click(importIcon);
```

This needs to change to find the import button in the banner area instead. The `ImportDataButton` in full mode (not iconOnly) renders with the text "Import Data", so update to:

```tsx
const importBtn = await screen.findByRole('button', {
  name: /import data/i,
});
await user.click(importBtn);
```

Note: The `ImportDataButton` in the banner uses full mode (no `iconOnly` prop), so its `aria-label` will be "Import Data" (the button text), not "Import data into ...". Verify the actual rendered label by checking the component — in full mode, the `<Button>` text is used, which is "Import Data".

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -50`
Expected: All tests PASS.

- [ ] **Step 3: Run type checking**

Run: `npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 4: Run linting**

Run: `npx eslint src/screens/Home/ArchiveBrowser.tsx src/screens/Home/ProjectList.tsx src/screens/Home/ProjectBannerCard.tsx src/screens/Home/HomeScreen.tsx 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/screens/Home/HomeScreen.test.tsx
git commit -m "test(home): update import integration test for banner-based actions"
```

---

### Task 6: Extract i18n messages and verify

- [ ] **Step 1: Run message extraction**

Run: `npm run extract-messages 2>&1 | tail -10`
Expected: Messages extracted successfully.

- [ ] **Step 2: Verify new messages appear in en.json**

Run: `grep -c "dashboard.banner.editProject\|dashboard.banner.deleteProject" src/i18n/en.json`
Expected: 2 (both new messages found).

- [ ] **Step 3: Final commit if any changes**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore(i18n): extract new banner action messages"
```
