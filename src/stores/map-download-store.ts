import { create } from 'zustand';

import type { DownloadProgress } from '@/lib/map/smp-download';

interface ActiveMapDownload {
  mapId: string;
  mapName: string;
  progress: DownloadProgress | null;
  cancel: () => void;
}

interface MapDownloadState {
  active: ActiveMapDownload | null;
  start: (download: Omit<ActiveMapDownload, 'progress'>) => void;
  updateProgress: (mapId: string, progress: DownloadProgress) => void;
  clear: (mapId: string) => void;
}

export const useMapDownloadStore = create<MapDownloadState>((set) => ({
  active: null,
  start: (download) => set({ active: { ...download, progress: null } }),
  updateProgress: (mapId, progress) =>
    set((state) =>
      state.active?.mapId === mapId
        ? { active: { ...state.active, progress } }
        : state,
    ),
  clear: (mapId) =>
    set((state) => (state.active?.mapId === mapId ? { active: null } : state)),
}));
