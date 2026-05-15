import { render, screen } from '@tests/mocks/test-utils';
import { userEvent } from '@tests/mocks/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { PhotoGallery } from '@/components/shared/photo-gallery';
import { getAttachmentUrl } from '@/lib/api-client';

vi.mock('@/lib/api-client', () => ({
  getAttachmentUrl: vi.fn(
    (
      _projectId: string,
      driveId: string,
      type: string,
      name: string,
      variant?: string,
    ) =>
      `https://example.com/attachments/${driveId}/${type}/${name}${variant ? `/${variant}` : ''}`,
  ),
}));

// Mock useAuthenticatedImageUrl to return instant success for synchronous testing
vi.mock('@/hooks/useAuthenticatedImageUrl', () => ({
  useAuthenticatedImageUrl: vi.fn(() => ({
    blobUrl: 'blob:test',
    isLoading: false,
    error: null,
  })),
}));

describe('PhotoGallery', () => {
  const photos = [
    { driveId: 'drive1', name: 'photo1.jpg', type: 'image/jpeg' },
    { driveId: 'drive2', name: 'photo2.png', type: 'image/png' },
  ];
  const projectId = 'proj1';

  it('renders thumbnail grid from photos array', () => {
    render(<PhotoGallery photos={photos} projectId={projectId} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
  });

  it('each thumbnail has correct alt text', () => {
    render(<PhotoGallery photos={photos} projectId={projectId} />);
    expect(screen.getByAltText('photo1.jpg')).toBeInTheDocument();
    expect(screen.getByAltText('photo2.png')).toBeInTheDocument();
  });

  it('builds thumbnail URLs using getAttachmentUrl with thumbnail variant', () => {
    render(<PhotoGallery photos={photos} projectId={projectId} />);
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'image/jpeg',
      'photo1.jpg',
      'thumbnail',
    );
    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive2',
      'image/png',
      'photo2.png',
      'thumbnail',
    );
  });

  it('shows empty state when no photos', () => {
    render(<PhotoGallery photos={[]} projectId={projectId} />);
    expect(screen.getByText('No photos')).toBeInTheDocument();
  });

  it('clicking thumbnail shows preview', async () => {
    const user = userEvent.setup();
    render(<PhotoGallery photos={photos} projectId={projectId} />);

    // Preview should not be visible initially
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Click first thumbnail
    const firstThumb = screen.getByAltText('photo1.jpg');
    await user.click(firstThumb);

    // Preview dialog should appear
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Preview should contain a larger image with original variant
    const previewImg = screen.getByAltText('photo1.jpg preview');
    expect(previewImg).toBeInTheDocument();
  });

  it('preview uses original variant URL', async () => {
    const user = userEvent.setup();
    render(<PhotoGallery photos={photos} projectId={projectId} />);

    await user.click(screen.getByAltText('photo1.jpg'));

    expect(getAttachmentUrl).toHaveBeenCalledWith(
      'proj1',
      'drive1',
      'image/jpeg',
      'photo1.jpg',
      'original',
    );
  });

  it('closes preview when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<PhotoGallery photos={photos} projectId={projectId} />);

    await user.click(screen.getByAltText('photo1.jpg'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const closeButton = screen.getByRole('button', { name: 'Close preview' });
    await user.click(closeButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
