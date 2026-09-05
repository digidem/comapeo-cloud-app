import { useQuery } from '@tanstack/react-query';

import { getCaseEvidenceAttachments } from '@/lib/data-layer';

export function useCaseEvidenceAttachments(
  projectLocalId: string | null,
  caseLocalId: string | null,
) {
  return useQuery({
    queryKey: ['case-evidence-attachments', projectLocalId, caseLocalId],
    queryFn: () => getCaseEvidenceAttachments(projectLocalId!, caseLocalId!),
    enabled: projectLocalId !== null && caseLocalId !== null,
  });
}
