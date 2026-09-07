import { useQuery } from '@tanstack/react-query';

import { getCaseEvidenceCounts } from '@/lib/data-layer';

export function useCaseEvidenceCounts(projectLocalId: string | null) {
  return useQuery({
    queryKey: ['case-evidence-counts', projectLocalId],
    queryFn: () => getCaseEvidenceCounts(projectLocalId!),
    enabled: projectLocalId !== null,
  });
}
