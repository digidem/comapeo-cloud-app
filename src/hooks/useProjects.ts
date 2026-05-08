import { useQuery } from '@tanstack/react-query';

import { getProjects } from '@/lib/data-layer';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });
}
