import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createCase } from '@/lib/data-layer';
import type { CaseType } from '@/lib/db';

export function useCreateCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      title: string;
      caseType: CaseType;
      status?: 'draft' | 'active' | 'closed';
    }) => createCase(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['cases', variables.projectLocalId],
      });
    },
  });
}
