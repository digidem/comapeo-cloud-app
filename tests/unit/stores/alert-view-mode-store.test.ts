import { beforeEach, describe, expect, it } from 'vitest';

import { useAlertViewModeStore } from '@/stores/alert-view-mode-store';
import { useViewModeStore } from '@/stores/view-mode-store';

describe('alert view preference', () => {
  beforeEach(() => {
    localStorage.clear();
    useAlertViewModeStore.setState({ viewMode: 'map' });
    useViewModeStore.setState({ viewMode: 'map' });
  });

  it('defaults Alerts to map view', () => {
    expect(useAlertViewModeStore.getState().viewMode).toBe('map');
  });

  it('persists independently from the Data view preference', () => {
    const dataPreferenceBefore = localStorage.getItem('view-mode-preference');
    useAlertViewModeStore.getState().setViewMode('grid');

    expect(useAlertViewModeStore.getState().viewMode).toBe('grid');
    expect(useViewModeStore.getState().viewMode).toBe('map');
    expect(
      localStorage.getItem('comapeo-alert-view-mode-preference'),
    ).toContain('grid');
    expect(localStorage.getItem('alert-view-mode-preference')).toBeNull();
    expect(localStorage.getItem('view-mode-preference')).toBe(
      dataPreferenceBefore,
    );
  });
});
