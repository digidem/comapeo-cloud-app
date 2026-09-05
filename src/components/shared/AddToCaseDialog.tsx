import { valibotResolver } from '@hookform/resolvers/valibot';
import * as Dialog from '@radix-ui/react-dialog';
import * as v from 'valibot';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/close-icon';
import { Input } from '@/components/ui/input';
import { Select, SelectPortalProvider } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddCaseEvidence } from '@/hooks/useAddCaseEvidence';
import { useCases } from '@/hooks/useCases';
import { useCreateCase } from '@/hooks/useCreateCase';
import type { CaseEvidenceSourceType, CaseType } from '@/lib/db';

const CASE_TYPES = [
  'invasion_occupation',
  'territorial_encroachment',
  'deforestation_logging',
  'illegal_mining',
  'fire',
  'wildlife_exploitation',
  'pollution_contamination',
  'threats_violence',
  'rights_violation',
  'other',
] as const satisfies readonly CaseType[];

const formSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  caseType: v.picklist(CASE_TYPES),
});
type FormData = v.InferInput<typeof formSchema>;

const messages = defineMessages({
  title: { id: 'cases.addEvidence.title', defaultMessage: 'Add to case' },
  description: {
    id: 'cases.addEvidence.description',
    defaultMessage:
      '{count, plural, one {Add # selected record to an existing or new case.} other {Add # selected records to an existing or new case.}}',
  },
  existing: {
    id: 'cases.addEvidence.existing',
    defaultMessage: 'Existing cases',
  },
  noCases: {
    id: 'cases.addEvidence.noCases',
    defaultMessage: 'No cases yet for this project.',
  },
  newCase: { id: 'cases.addEvidence.newCase', defaultMessage: 'New case' },
  back: { id: 'cases.addEvidence.back', defaultMessage: 'Back to cases' },
  createAndAdd: {
    id: 'cases.addEvidence.createAndAdd',
    defaultMessage: 'Create and add',
  },
  titleLabel: { id: 'cases.form.title', defaultMessage: 'Title' },
  titleRequired: {
    id: 'cases.form.titleError',
    defaultMessage: 'Title is required',
  },
  typeLabel: {
    id: 'cases.form.primaryType',
    defaultMessage: 'Primary Type',
  },
  typeRequired: {
    id: 'cases.form.typeError',
    defaultMessage: 'Primary type is required',
  },
  selectType: {
    id: 'cases.form.selectType',
    defaultMessage: 'Select a type',
  },
  close: { id: 'common.close', defaultMessage: 'Close' },
  failed: {
    id: 'cases.addEvidence.failed',
    defaultMessage: 'Could not add the selected evidence. Try again.',
  },
  typeInvasionOccupation: {
    id: 'cases.type.invasion_occupation',
    defaultMessage: 'Invasion / illegal occupation',
  },
  typeTerritorialEncroachment: {
    id: 'cases.type.territorial_encroachment',
    defaultMessage: 'Territorial encroachment or infrastructure impact',
  },
  typeDeforestationLogging: {
    id: 'cases.type.deforestation_logging',
    defaultMessage: 'Deforestation / illegal logging',
  },
  typeIllegalMining: {
    id: 'cases.type.illegal_mining',
    defaultMessage: 'Illegal mining',
  },
  typeFire: { id: 'cases.type.fire', defaultMessage: 'Fire' },
  typeWildlifeExploitation: {
    id: 'cases.type.wildlife_exploitation',
    defaultMessage: 'Illegal hunting / fishing / wildlife exploitation',
  },
  typePollutionContamination: {
    id: 'cases.type.pollution_contamination',
    defaultMessage: 'Pollution / contamination',
  },
  typeThreatsViolence: {
    id: 'cases.type.threats_violence',
    defaultMessage: 'Threats / intimidation / violence',
  },
  typeRightsViolation: {
    id: 'cases.type.rights_violation',
    defaultMessage: 'Other violation of Indigenous or territorial rights',
  },
  typeOther: { id: 'cases.type.other', defaultMessage: 'Other' },
});

function getCaseTypeMessage(caseType: CaseType) {
  switch (caseType) {
    case 'invasion_occupation':
      return messages.typeInvasionOccupation;
    case 'territorial_encroachment':
      return messages.typeTerritorialEncroachment;
    case 'deforestation_logging':
      return messages.typeDeforestationLogging;
    case 'illegal_mining':
      return messages.typeIllegalMining;
    case 'fire':
      return messages.typeFire;
    case 'wildlife_exploitation':
      return messages.typeWildlifeExploitation;
    case 'pollution_contamination':
      return messages.typePollutionContamination;
    case 'threats_violence':
      return messages.typeThreatsViolence;
    case 'rights_violation':
      return messages.typeRightsViolation;
    case 'other':
      return messages.typeOther;
  }
}

export interface AddToCaseSource {
  sourceType: CaseEvidenceSourceType;
  sourceLocalId: string;
}

interface AddToCaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectLocalId: string;
  sources: readonly AddToCaseSource[];
  onAdded?: (caseLocalId: string) => void;
}

export function AddToCaseDialog({
  open,
  onOpenChange,
  projectLocalId,
  sources,
  onAdded,
}: AddToCaseDialogProps) {
  const intl = useIntl();
  const casesQuery = useCases(projectLocalId);
  const createCase = useCreateCase();
  const addEvidence = useAddCaseEvidence();
  const [mode, setMode] = useState<'choose' | 'create'>('choose');
  const [submitError, setSubmitError] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: valibotResolver(formSchema),
    defaultValues: { title: '', caseType: undefined },
  });

  const busy = createCase.isPending || addEvidence.isPending;

  function resetDialogState() {
    setMode('choose');
    setSubmitError(false);
    reset({ title: '', caseType: undefined });
  }

  function updateOpen(nextOpen: boolean) {
    if (!nextOpen) resetDialogState();
    onOpenChange(nextOpen);
  }

  async function addSourcesToCase(caseLocalId: string) {
    setSubmitError(false);
    try {
      for (const source of sources) {
        await addEvidence.mutateAsync({
          projectLocalId,
          caseLocalId,
          ...source,
        });
      }
      onAdded?.(caseLocalId);
      updateOpen(false);
    } catch {
      setSubmitError(true);
    }
  }

  const submitNewCase = handleSubmit(async (data) => {
    setSubmitError(false);
    try {
      const created = await createCase.mutateAsync({
        projectLocalId,
        title: data.title,
        caseType: data.caseType,
      });
      await addSourcesToCase(created.localId);
    } catch {
      setSubmitError(true);
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={updateOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          ref={setPortalContainer}
          className="fixed inset-0 z-50 flex h-dvh w-full flex-col overflow-y-auto bg-surface-card p-4 focus:outline-none sm:left-1/2 sm:top-1/2 sm:inset-auto sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:p-6 sm:shadow-modal"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-text">
                {intl.formatMessage(messages.title)}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-text-muted">
                {intl.formatMessage(messages.description, {
                  count: sources.length,
                })}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-text-muted hover:bg-surface hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={intl.formatMessage(messages.close)}
            >
              <CloseIcon size={16} />
            </Dialog.Close>
          </div>

          {submitError ? (
            <p role="alert" className="mt-4 text-sm text-error">
              {intl.formatMessage(messages.failed)}
            </p>
          ) : null}

          {mode === 'choose' ? (
            <div className="mt-6 flex flex-1 flex-col gap-4">
              <h2 className="text-sm font-semibold text-text">
                {intl.formatMessage(messages.existing)}
              </h2>
              {casesQuery.isPending ? (
                <div className="space-y-2">
                  <Skeleton height={56} className="rounded-card" />
                  <Skeleton height={56} className="rounded-card" />
                </div>
              ) : null}
              {!casesQuery.isPending && (casesQuery.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-text-muted">
                  {intl.formatMessage(messages.noCases)}
                </p>
              ) : null}
              <div className="flex flex-col gap-2">
                {(casesQuery.data ?? []).map((caze) => (
                  <button
                    key={caze.localId}
                    type="button"
                    disabled={busy}
                    onClick={() => void addSourcesToCase(caze.localId)}
                    className="flex min-h-[52px] items-center justify-between rounded-card bg-surface-container-low px-4 py-3 text-left text-sm font-medium text-text transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>{caze.title}</span>
                    <span className="text-xs text-text-muted">
                      {caze.status}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-auto border-t border-border pt-4 sm:mt-2">
                <Button
                  variant="primary"
                  onClick={() => setMode('create')}
                  disabled={busy}
                >
                  {intl.formatMessage(messages.newCase)}
                </Button>
              </div>
            </div>
          ) : (
            <SelectPortalProvider container={portalContainer}>
              <form
                onSubmit={(event) => void submitNewCase(event)}
                className="mt-6 flex flex-1 flex-col gap-4"
              >
                <Input
                  label={intl.formatMessage(messages.titleLabel)}
                  error={
                    errors.title
                      ? intl.formatMessage(messages.titleRequired)
                      : undefined
                  }
                  {...register('title')}
                  disabled={busy}
                />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-text">
                    {intl.formatMessage(messages.typeLabel)}
                  </span>
                  <Controller
                    name="caseType"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        placeholder={intl.formatMessage(messages.selectType)}
                        ariaLabel={intl.formatMessage(messages.typeLabel)}
                        disabled={busy}
                      >
                        {CASE_TYPES.map((caseType) => (
                          <Select.Item key={caseType} value={caseType}>
                            {intl.formatMessage(getCaseTypeMessage(caseType))}
                          </Select.Item>
                        ))}
                      </Select>
                    )}
                  />
                  {errors.caseType ? (
                    <p className="text-sm text-error">
                      {intl.formatMessage(messages.typeRequired)}
                    </p>
                  ) : null}
                </div>
                <div className="mt-auto flex flex-wrap gap-3 border-t border-border pt-4 sm:mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMode('choose')}
                    disabled={busy}
                  >
                    {intl.formatMessage(messages.back)}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={busy}
                    disabled={busy}
                  >
                    {intl.formatMessage(messages.createAndAdd)}
                  </Button>
                </div>
              </form>
            </SelectPortalProvider>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
