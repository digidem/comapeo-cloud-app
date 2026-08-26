import { useQuery } from '@tanstack/react-query';

import { getCaseActivity } from '@/lib/data-layer';

export function useCaseActivity(
  projectLocalId: string | null,
  caseId: string | null,
) {
  return useQuery({
    queryKey: ['caseActivity', projectLocalId, caseId],
    queryFn: () => getCaseActivity(projectLocalId!, caseId!),
    enabled: projectLocalId !== null && caseId !== null,
  });
}
