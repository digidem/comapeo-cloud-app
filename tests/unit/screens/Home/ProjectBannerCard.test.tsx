import { render, screen, userEvent } from '@tests/mocks/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountUp } from '@/hooks/useCountUp';
import { ProjectBannerCard } from '@/screens/Home/ProjectBannerCard';

// Mock useCountUp to pass through values directly — animation is tested in useCountUp.test.ts
vi.mock('@/hooks/useCountUp', () => ({
  useCountUp: vi.fn((value: string | number) => value),
}));

// Mock useAuthenticatedImageUrl to return instant success for synchronous testing
vi.mock('@/hooks/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: vi.fn(() => ({
    blobUrl: 'blob:test',
    isLoading: false,
    error: null,
  })),
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

  it('shows project description when provided', () => {
    render(
      <ProjectBannerCard
        {...defaultProps}
        description="Monitoring deforestation in the Amazon"
      />,
    );
    expect(
      screen.getByText('Monitoring deforestation in the Amazon'),
    ).toBeInTheDocument();
  });

  it('shows derived description from project name when description is empty', () => {
    render(<ProjectBannerCard {...defaultProps} projectName="Forest Watch" />);
    expect(
      screen.getByText('Forest Watch monitoring and data collection project.'),
    ).toBeInTheDocument();
  });

  it('shows generic fallback when neither name nor description exists', () => {
    render(<ProjectBannerCard projectName="" />);
    expect(
      screen.getByText(
        'A controlled environment for onboarding new rangers and testing field data collection protocols.',
      ),
    ).toBeInTheDocument();
  });

  it('renders photo collage when photoUrls has items', () => {
    render(
      <ProjectBannerCard
        {...defaultProps}
        photoUrls={['/photo1.jpg', '/photo2.jpg', '/photo3.jpg']}
      />,
    );
    expect(screen.getByTestId('photo-collage')).toBeInTheDocument();
    const images = screen.getAllByRole('presentation');
    expect(images).toHaveLength(3);
    // AuthImg renders blob URLs, not the original src
    expect(images[0]).toHaveAttribute('src', 'blob:test');
    expect(images[1]).toHaveAttribute('src', 'blob:test');
    expect(images[2]).toHaveAttribute('src', 'blob:test');
  });

  it('renders default background when photoUrls is empty', () => {
    render(<ProjectBannerCard {...defaultProps} photoUrls={[]} />);
    expect(screen.getByTestId('default-banner-bg')).toBeInTheDocument();
    expect(screen.queryByTestId('photo-collage')).not.toBeInTheDocument();
  });

  it('renders default background when photoUrls is undefined', () => {
    render(<ProjectBannerCard {...defaultProps} />);
    expect(screen.getByTestId('default-banner-bg')).toBeInTheDocument();
  });

  it('collage shows at most 4 photos', () => {
    render(
      <ProjectBannerCard
        {...defaultProps}
        photoUrls={['/1.jpg', '/2.jpg', '/3.jpg', '/4.jpg', '/5.jpg', '/6.jpg']}
      />,
    );
    const images = screen.getAllByRole('presentation');
    expect(images).toHaveLength(4);
  });
});
