import { useQuery } from '@tanstack/react-query';

import { getCaseReportDisclosure } from '@/lib/data-layer';
import type { CaseAgency } from '@/lib/db';

export function useCaseReportDisclosure(
  projectLocalId: string | null,
  caseLocalId: string | null,
  agency: CaseAgency,
) {
  return useQuery({
    queryKey: ['case-report-disclosure', projectLocalId, caseLocalId, agency],
    queryFn: () =>
      getCaseReportDisclosure(projectLocalId!, caseLocalId!, agency),
    enabled: projectLocalId !== null && caseLocalId !== null,
  });
}
