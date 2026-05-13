import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountUp } from '@/hooks/useCountUp';
import { ProjectBannerCard } from '@/screens/Home/ProjectBannerCard';

// Mock useCountUp to pass through values directly — animation is tested in useCountUp.test.ts
vi.mock('@/hooks/useCountUp', () => ({
  useCountUp: vi.fn((value: string | number) => value),
}));

describe('ProjectBannerCard', () => {
  const defaultProps = {
    projectName: 'Test Project',
  };

  beforeEach(() => {
    vi.mocked(useCountUp).mockClear();
  });

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
    expect(screen.queryByRole('button', { name: /edit project/i })).toBeNull();
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
    expect(screen.queryByRole('button', { name: /import data/i })).toBeNull();
  });

  it('does not render Import Data button when isLocalProject is not set', () => {
    render(<ProjectBannerCard {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /import data/i })).toBeNull();
  });

  it('shows skeleton in Territory Area pill when isAreaLoading is true', () => {
    render(
      <ProjectBannerCard {...defaultProps} areaSize="5 ha" isAreaLoading />,
    );
    expect(screen.getByText('Territory Area')).toBeInTheDocument();
    // Should show a skeleton for the area value
    const skeletons = screen.getAllByTestId('skeleton');
    const areaSkeleton = skeletons.find((el) =>
      el.closest('[data-testid="territory-area-pill"]'),
    );
    expect(areaSkeleton).toBeTruthy();
  });

  it('shows area value when isAreaLoading is false', () => {
    render(
      <ProjectBannerCard
        {...defaultProps}
        areaSize="5 ha"
        isAreaLoading={false}
      />,
    );
    expect(screen.getByText('Territory Area')).toBeInTheDocument();
    expect(screen.getByText('5 ha')).toBeInTheDocument();
  });

  it('shows area value by default without loading state', () => {
    render(<ProjectBannerCard {...defaultProps} areaSize="10 ha" />);
    expect(screen.getByText('10 ha')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton')).toBeNull();
  });
});
