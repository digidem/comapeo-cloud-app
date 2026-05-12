import { Skeleton } from '@/components/ui/skeleton';

export function HomeScreenSkeleton() {
  return (
    <div
      data-testid="home-skeleton"
      className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6 motion-safe:animate-pulse"
    >
      {/* 4 stat cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-surface-card rounded-card p-4">
            <Skeleton height={16} width="60%" className="mb-2" />
            <Skeleton height={32} width="40%" />
          </div>
        ))}
      </div>
      {/* Banner card skeleton */}
      <div className="bg-surface-card rounded-card p-6">
        <Skeleton height={20} width="50%" className="mb-3" />
        <div className="flex gap-6">
          <Skeleton height={16} width="20%" />
          <Skeleton height={16} width="20%" />
          <Skeleton height={16} width="20%" />
        </div>
      </div>
      {/* Activity list skeleton */}
      <div className="bg-surface-card rounded-card p-4">
        <Skeleton height={16} width="30%" className="mb-4" />
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 py-3 border-b border-border last:border-0"
          >
            <Skeleton
              width={32}
              height={32}
              className="shrink-0 rounded-full"
            />
            <div className="flex-1">
              <Skeleton height={14} width="60%" className="mb-1" />
              <Skeleton height={12} width="40%" />
            </div>
          </div>
        ))}
      </div>
      {/* Map area skeleton */}
      <div className="bg-surface-card rounded-card p-4">
        <Skeleton height={200} className="rounded-card" />
      </div>
    </div>
  );
}
