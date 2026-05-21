import { defineMessages, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';

const messages = defineMessages({
  title: {
    id: 'home.intro.title',
    defaultMessage: 'Welcome to CoMapeo Cloud',
  },
  description: {
    id: 'home.intro.description',
    defaultMessage:
      'Connect your team\u2019s CoMapeo data in one place. Add a remote archive server to sync field projects, or create a local project to get started.',
  },
  addServerLabel: {
    id: 'home.intro.addServerLabel',
    defaultMessage: 'Add remote archive server',
  },
  addServerDesc: {
    id: 'home.intro.addServerDesc',
    defaultMessage:
      'Connect to an existing CoMapeo Cloud server and sync projects, observations, and alerts.',
  },
  addServerCta: {
    id: 'home.intro.addServerCta',
    defaultMessage: 'Add server',
  },
  createProjectLabel: {
    id: 'home.intro.createProjectLabel',
    defaultMessage: 'Start a project',
  },
  createProjectDesc: {
    id: 'home.intro.createProjectDesc',
    defaultMessage:
      'Start a new project on this device. You can connect it to a remote archive later.',
  },
  createProjectCta: {
    id: 'home.intro.createProjectCta',
    defaultMessage: 'Create project',
  },
  howItWorks: {
    id: 'home.intro.howItWorks',
    defaultMessage: 'How it works',
  },
  step1: {
    id: 'home.intro.step1',
    defaultMessage: 'Add a server or start locally.',
  },
  step2: {
    id: 'home.intro.step2',
    defaultMessage: 'Select or create a project.',
  },
  step3: {
    id: 'home.intro.step3',
    defaultMessage: 'Review observations, alerts, and territory data.',
  },
});

interface IntroPageProps {
  onAddServer: () => void;
  onCreateProject: () => void;
}

function IntroPage({ onAddServer, onCreateProject }: IntroPageProps) {
  const intl = useIntl();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto px-5 py-8 sm:px-8 lg:px-10">
      {/* Welcome card */}
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-card bg-surface-card p-6 shadow-soft text-center">
        {/* CoMapeo Cloud logo */}
        <img
          src="/comapeo_cloud_app.svg"
          alt="CoMapeo Cloud"
          className="h-10 w-auto"
        />

        <h2 className="text-lg font-semibold text-text">
          {intl.formatMessage(messages.title)}
        </h2>
        <p className="text-sm leading-relaxed text-text-muted max-w-sm">
          {intl.formatMessage(messages.description)}
        </p>
      </div>

      {/* Action cards */}
      <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
        {/* Add server card */}
        <div className="flex flex-1 flex-col items-center gap-3 rounded-card bg-surface-card p-5 shadow-soft text-center">
          <div className="flex flex-col items-center gap-1">
            <h3 className="text-sm font-semibold text-text">
              {intl.formatMessage(messages.addServerLabel)}
            </h3>
            <p className="text-xs leading-relaxed text-text-muted max-w-[260px]">
              {intl.formatMessage(messages.addServerDesc)}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={onAddServer}>
            {intl.formatMessage(messages.addServerCta)}
          </Button>
        </div>

        {/* Create project card */}
        <div className="flex flex-1 flex-col items-center gap-3 rounded-card bg-surface-card p-5 shadow-soft text-center">
          <div className="flex flex-col items-center gap-1">
            <h3 className="text-sm font-semibold text-text">
              {intl.formatMessage(messages.createProjectLabel)}
            </h3>
            <p className="text-xs leading-relaxed text-text-muted max-w-[260px]">
              {intl.formatMessage(messages.createProjectDesc)}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={onCreateProject}>
            {intl.formatMessage(messages.createProjectCta)}
          </Button>
        </div>
      </div>

      {/* How it works */}
      <div className="flex w-full max-w-md flex-col gap-2 rounded-card bg-surface-card p-5 shadow-soft">
        <h3 className="text-sm font-semibold text-text">
          {intl.formatMessage(messages.howItWorks)}
        </h3>
        <ol className="flex list-inside list-decimal flex-col gap-1.5 text-xs leading-relaxed text-text-muted">
          <li>{intl.formatMessage(messages.step1)}</li>
          <li>{intl.formatMessage(messages.step2)}</li>
          <li>{intl.formatMessage(messages.step3)}</li>
        </ol>
      </div>
    </div>
  );
}

export { IntroPage };
export type { IntroPageProps };
