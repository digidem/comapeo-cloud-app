import { useQuery } from '@tanstack/react-query';

import { getAttachmentsForProject } from '@/lib/data-layer';

export function useAttachmentsForProject(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['attachments', projectLocalId],
    queryFn: () => getAttachmentsForProject(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
