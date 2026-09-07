import { useMutation, useQueryClient } from '@tanstack/react-query';

import { setCaseEvidenceAttachmentSelected } from '@/lib/data-layer';

export function useSetCaseEvidenceAttachmentSelected() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      projectLocalId: string;
      caseLocalId: string;
      evidenceLocalId: string;
      attachmentLocalId: string;
      selected: boolean;
    }) => setCaseEvidenceAttachmentSelected(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'case-evidence-attachments',
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
