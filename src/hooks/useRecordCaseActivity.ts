import { useMutation, useQueryClient } from '@tanstack/react-query';

import { recordCaseActivity } from '@/lib/data-layer';
import type { CaseActivityEvent, CaseAgency, CaseStatus } from '@/lib/db';

export function useRecordCaseActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      caseLocalId: string;
      event: CaseActivityEvent;
      status?: CaseStatus;
      agency?: CaseAgency;
      count?: number;
    }) =>
      recordCaseActivity({
        caseLocalId: input.caseLocalId,
        projectLocalId: input.projectLocalId,
        event: input.event,
        status: input.status,
        agency: input.agency,
        count: input.count,
      }),
    onSuccess: (_data, variables) => {
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
