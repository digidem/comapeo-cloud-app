import { useMutation, useQueryClient } from '@tanstack/react-query';

import { addCaseEvidence } from '@/lib/data-layer';
import type { CaseEvidenceSourceType } from '@/lib/db';

export function useAddCaseEvidence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      caseLocalId: string;
      sourceType: CaseEvidenceSourceType;
      sourceLocalId: string;
    }) => addCaseEvidence(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'case-evidence',
          variables.projectLocalId,
          variables.caseLocalId,
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
