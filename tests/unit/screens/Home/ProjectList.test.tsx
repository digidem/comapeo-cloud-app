import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { ProjectList } from '@/screens/Home/ProjectList';

describe('ProjectList', () => {
  const projects = [
    { localId: 'p1', name: 'Alpha Project' },
    { localId: 'p2', name: 'Beta Project' },
  ];

  it('renders project names', () => {
    render(
      <ProjectList
        projects={projects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    expect(screen.getByText('Alpha Project')).toBeDefined();
    expect(screen.getByText('Beta Project')).toBeDefined();
  });

  it('clicking project calls onSelect with id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <ProjectList
        projects={projects}
        selectedProjectId={null}
        onSelect={onSelect}
        onCreateNew={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Alpha Project'));
    expect(onSelect).toHaveBeenCalledWith('p1');
  });

  it('active project has highlighted styles', () => {
    render(
      <ProjectList
        projects={projects}
        selectedProjectId="p1"
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    const activeItem = screen.getByRole('button', { name: 'Alpha Project' });
    expect(activeItem.className).toContain('bg-[#EAF2FF]');
    expect(activeItem.className).toContain('text-[#1F6FFF]');
  });

  it('shows empty state when no projects', () => {
    render(
      <ProjectList
        projects={[]}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );

    expect(screen.getByText('No projects yet')).toBeDefined();
  });

  it('shows skeleton placeholders when isLoading', () => {
    render(
      <ProjectList
        projects={[]}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        isLoading
      />,
    );

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('calls onCreateNew when new project button is clicked', async () => {
    const user = userEvent.setup();
    const onCreateNew = vi.fn();

    render(
      <ProjectList
        projects={[]}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onCreateNew={onCreateNew}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Create new project from project list',
      }),
    );
    expect(onCreateNew).toHaveBeenCalledOnce();
  });
});
