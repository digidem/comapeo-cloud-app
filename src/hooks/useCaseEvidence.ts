import { useQuery } from '@tanstack/react-query';

import { getCaseEvidence } from '@/lib/data-layer';

export function useCaseEvidence(
  projectLocalId: string | null,
  caseLocalId: string | null,
) {
  return useQuery({
    queryKey: ['case-evidence', projectLocalId, caseLocalId],
    queryFn: () => getCaseEvidence(projectLocalId!, caseLocalId!),
    enabled: projectLocalId !== null && caseLocalId !== null,
  });
}
