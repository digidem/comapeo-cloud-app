import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteCase } from '@/lib/data-layer';

export function useDeleteCase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { projectLocalId: string; localId: string }) =>
      deleteCase(input.projectLocalId, input.localId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['cases', variables.projectLocalId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['case', variables.projectLocalId, variables.localId],
      });
    },
  });
}
