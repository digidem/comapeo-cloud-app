import { useMutation, useQueryClient } from '@tanstack/react-query';

import { upsertCaseReportState } from '@/lib/data-layer';
import type { CaseAgency, CaseReportState } from '@/lib/db';

export function useUpsertCaseReportState() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      caseLocalId: string;
      agency: CaseAgency;
      status: CaseReportState['status'];
      count?: number;
      revision?: number;
    }) =>
      upsertCaseReportState({
        caseLocalId: input.caseLocalId,
        projectLocalId: input.projectLocalId,
        agency: input.agency,
        status: input.status,
        count: input.count,
        revision: input.revision,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'caseReportStates',
          variables.projectLocalId,
          variables.caseLocalId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'caseReportState',
          variables.projectLocalId,
          variables.caseLocalId,
          variables.agency,
        ],
      });
    },
  });
}
