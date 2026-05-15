import { Skeleton } from '@/components/ui/skeleton';
import { useAuthenticatedImageUrl } from '@/hooks/useAuthenticatedImageUrl';

interface AuthImgProps {
  src: string;
  alt: string;
  className?: string;
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
export function AuthImg({ src, alt, className }: AuthImgProps) {
  const { blobUrl, isLoading, error } = useAuthenticatedImageUrl(src);

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
