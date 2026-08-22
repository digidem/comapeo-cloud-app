import { useMemo, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { useNavigate } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateCase } from '@/hooks/useCreateCase';
import { useProjects } from '@/hooks/useProjects';
import type { CaseType } from '@/lib/db';
import { useProjectStore } from '@/stores/project-store';

const messages = defineMessages({
  title: { id: 'cases.createTitle', defaultMessage: 'Create Case' },
  casesLabel: { id: 'cases.title', defaultMessage: 'Cases' },
  untitledProject: {
    id: 'cases.untitledProject',
    defaultMessage: 'Untitled Project',
  },
  titleLabel: { id: 'cases.form.title', defaultMessage: 'Title' },
  typeLabel: {
    id: 'cases.form.primaryType',
    defaultMessage: 'Primary Type',
  },
  selectTypePlaceholder: {
    id: 'cases.form.selectType',
    defaultMessage: 'Select a type',
  },
  createButton: { id: 'cases.form.create', defaultMessage: 'Create Case' },
  titleError: {
    id: 'cases.form.titleError',
    defaultMessage: 'Title is required',
  },
  typeError: {
    id: 'cases.form.typeError',
    defaultMessage: 'Primary type is required',
  },
  noProject: {
    id: 'cases.form.noProject',
    defaultMessage: 'Select a project first',
  },
  creationError: {
    id: 'cases.form.creationError',
    defaultMessage: 'Could not create the case. Try again.',
  },
  placeholderTitle: {
    id: 'cases.form.titlePlaceholder',
    defaultMessage: 'Enter a descriptive title',
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

const CASE_TYPES: CaseType[] = [
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
];

function getCaseTypeLabelDescriptor(caseType: CaseType) {
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

export function CreateCaseScreen() {
  const intl = useIntl();
  const navigate = useNavigate();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const projectsQuery = useProjects();
  const createCase = useCreateCase();

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find((p) => p.localId === selectedProjectId);

  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(messages.untitledProject);
  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(messages.casesLabel),
    }),
    [intl, selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  const [title, setTitle] = useState('');
  const [caseType, setCaseType] = useState<CaseType | ''>('');
  const [titleError, setTitleError] = useState(false);
  const [typeError, setTypeError] = useState(false);

  const validate = (): boolean => {
    let valid = true;
    if (title.trim() === '') {
      setTitleError(true);
      valid = false;
    } else {
      setTitleError(false);
    }
    if (caseType === '') {
      setTypeError(true);
      valid = false;
    } else {
      setTypeError(false);
    }
    return valid;
  };

  const handleSubmit = () => {
    if (!selectedProjectId) return;
    if (!validate()) return;

    createCase.mutate(
      {
        projectLocalId: selectedProjectId,
        title: title.trim(),
        caseType: caseType as CaseType,
      },
      {
        onSuccess: (createdCase) => {
          // Navigate to the detail page for the created Case.
          void navigate({ to: `/cases/${createdCase.localId}` });
        },
      },
    );
  };

  // Skeleton while projects load
  if (projectsQuery.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton height={24} width={200} />
        <Skeleton height={100} className="rounded-card" />
        <Skeleton height={100} className="rounded-card" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-3 sm:p-4 lg:p-6">
      <h1 className="text-2xl font-bold text-text">
        {intl.formatMessage(messages.title)}
      </h1>
      <Card className="p-6">
        <div className="flex flex-col gap-4">
          <Input
            label={intl.formatMessage(messages.titleLabel)}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={
              titleError ? intl.formatMessage(messages.titleError) : undefined
            }
            placeholder={intl.formatMessage(messages.placeholderTitle)}
          />
          <Select
            value={caseType}
            onValueChange={(v) => setCaseType(v as CaseType)}
            placeholder={intl.formatMessage(messages.selectTypePlaceholder)}
            ariaLabel={intl.formatMessage(messages.typeLabel)}
            disabled={createCase.isPending}
          >
            {CASE_TYPES.map((type) => (
              <Select.Item key={type} value={type}>
                {intl.formatMessage(getCaseTypeLabelDescriptor(type))}
              </Select.Item>
            ))}
          </Select>
          {typeError && (
            <p className="text-sm text-error">
              {intl.formatMessage(messages.typeError)}
            </p>
          )}
          {!selectedProjectId && (
            <p className="text-sm text-error">
              {intl.formatMessage(messages.noProject)}
            </p>
          )}
          {createCase.isError && (
            <p className="text-sm text-error">
              {intl.formatMessage(messages.creationError)}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!selectedProjectId || createCase.isPending}
              loading={createCase.isPending}
            >
              {intl.formatMessage(messages.createButton)}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
