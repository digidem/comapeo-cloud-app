import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateCase } from '@/lib/data-layer';
import type { CaseUpdates } from '@/lib/local-repositories';

export function useUpdateCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      localId: string;
      updates: CaseUpdates;
    }) => updateCase(input.projectLocalId, input.localId, input.updates),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['case', variables.projectLocalId, variables.localId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['cases', variables.projectLocalId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['caseActivity', variables.projectLocalId, variables.localId],
      });
    },
  });
}
