import { render, screen } from '@tests/mocks/test-utils';
import { describe, expect, it } from 'vitest';

import { ProjectOverviewHeader } from '@/screens/Home/ProjectOverviewHeader';

describe('ProjectOverviewHeader', () => {
  it('renders the project name as a heading', () => {
    render(
      <ProjectOverviewHeader
        projectName="Amazon Monitor"
        observationCount={5}
        sourceType="local"
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Amazon Monitor' }),
    ).toBeInTheDocument();
  });

  it('shows "1 observation" in the singular', () => {
    render(
      <ProjectOverviewHeader
        projectName="Test Project"
        observationCount={1}
        sourceType="local"
      />,
    );
    expect(screen.getByText('1 observation')).toBeInTheDocument();
  });

  it('shows "3 observations" in the plural', () => {
    render(
      <ProjectOverviewHeader
        projectName="Test Project"
        observationCount={3}
        sourceType="local"
      />,
    );
    expect(screen.getByText('3 observations')).toBeInTheDocument();
  });

  it('shows Local badge for local sourceType', () => {
    render(
      <ProjectOverviewHeader
        projectName="Test"
        observationCount={0}
        sourceType="local"
      />,
    );
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.queryByText('Archive')).not.toBeInTheDocument();
  });

  it('shows Archive badge for remoteArchive sourceType', () => {
    render(
      <ProjectOverviewHeader
        projectName="Test"
        observationCount={0}
        sourceType="remoteArchive"
      />,
    );
    expect(screen.getByText('Archive')).toBeInTheDocument();
    expect(screen.queryByText('Local')).not.toBeInTheDocument();
  });

  it('shows last synced timestamp when sourceType is remoteArchive and lastSyncedAt is provided', () => {
    render(
      <ProjectOverviewHeader
        projectName="Test"
        observationCount={0}
        sourceType="remoteArchive"
        lastSyncedAt="2024-01-15T10:30:00Z"
      />,
    );
    expect(screen.getByText(/synced/i)).toBeInTheDocument();
  });

  it('does not show last synced when sourceType is local', () => {
    render(
      <ProjectOverviewHeader
        projectName="Test"
        observationCount={0}
        sourceType="local"
        lastSyncedAt="2024-01-15T10:30:00Z"
      />,
    );
    expect(screen.queryByText(/synced/i)).not.toBeInTheDocument();
  });

  it('does not show last synced when lastSyncedAt is null', () => {
    render(
      <ProjectOverviewHeader
        projectName="Test"
        observationCount={0}
        sourceType="remoteArchive"
        lastSyncedAt={null}
      />,
    );
    expect(screen.queryByText(/synced/i)).not.toBeInTheDocument();
  });
});
