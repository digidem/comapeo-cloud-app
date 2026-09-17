import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { CaseReportDisclosure } from '@/lib/case-disclosure';
import { upsertCaseReportDisclosure } from '@/lib/data-layer';
import type { CaseAgency } from '@/lib/db';

export function useUpsertCaseReportDisclosure() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      caseLocalId: string;
      agency: CaseAgency;
      disclosure: CaseReportDisclosure;
    }) => upsertCaseReportDisclosure(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'case-report-disclosure',
          variables.projectLocalId,
          variables.caseLocalId,
          variables.agency,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'caseActivity',
          variables.projectLocalId,
          variables.caseLocalId,
        ],
      });
    },
  });
}
