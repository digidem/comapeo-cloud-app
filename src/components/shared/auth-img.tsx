import { Skeleton } from '@/components/ui/skeleton';
import { useAuthenticatedImageUrl } from '@/hooks/useAuthenticatedImageUrl';

interface AuthImgProps {
  src: string;
  alt: string;
  className?: string;
  /**
   * When true, the image blob is cached in IndexedDB for instant display on
   * subsequent loads. Use only for small, stable assets (e.g. category icons).
   */
  cache?: boolean;
}

/**
 * Renders an image that requires authentication headers.
 *
 * Internally uses useAuthenticatedImageUrl to fetch the image with proper
 * Authorization headers and renders one of three states:
 * - Loading: Skeleton placeholder
 * - Error: Invisible placeholder div (preserves layout)
 * - Success: <img> with blob URL
 */
export function AuthImg({ src, alt, className, cache }: AuthImgProps) {
  const { blobUrl, isLoading, error } = useAuthenticatedImageUrl(src, {
    cache,
  });

  if (isLoading) {
    return (
      <div data-testid="auth-img-skeleton" className={className}>
        <Skeleton width="100%" height="100%" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return <div className={className} data-testid="auth-img-error" />;
  }

  return <img src={blobUrl} alt={alt} className={className} />;
}
