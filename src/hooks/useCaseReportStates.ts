import { useQuery } from '@tanstack/react-query';

import { getCaseReportStates } from '@/lib/data-layer';

export function useCaseReportStates(
  projectLocalId: string | null,
  caseId: string | null,
) {
  return useQuery({
    queryKey: ['caseReportStates', projectLocalId, caseId],
    queryFn: () => getCaseReportStates(projectLocalId!, caseId!),
    enabled: projectLocalId !== null && caseId !== null,
  });
}
