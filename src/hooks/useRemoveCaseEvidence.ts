import { useMutation, useQueryClient } from '@tanstack/react-query';

import { removeCaseEvidence } from '@/lib/data-layer';

export function useRemoveCaseEvidence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      caseLocalId: string;
      evidenceLocalId: string;
    }) => removeCaseEvidence(input),
    onSuccess: (_data, variables) => {
      for (const queryKey of [
        ['case-evidence', variables.projectLocalId, variables.caseLocalId],
        [
          'case-evidence-attachments',
          variables.projectLocalId,
          variables.caseLocalId,
        ],
        ['caseActivity', variables.projectLocalId, variables.caseLocalId],
        ['case-evidence-counts', variables.projectLocalId],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
