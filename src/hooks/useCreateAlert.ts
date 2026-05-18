import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createAlert } from '@/lib/data-layer';

export function useCreateAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      geometry?: { type: string; coordinates: unknown };
      metadata?: Record<string, unknown>;
      detectionDateStart?: string;
      detectionDateEnd?: string;
    }) => createAlert(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['alerts', variables.projectLocalId],
      });
    },
  });
}
