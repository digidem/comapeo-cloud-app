import * as Dialog from '@radix-ui/react-dialog';

import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import type { MapRef } from 'react-map-gl/maplibre';

import { Link } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useCreateMap, useMaps } from '@/hooks/useMaps';
import { useProjects } from '@/hooks/useProjects';
import type { SavedMap } from '@/lib/db';
import { DEFAULT_BASEMAP_ID, findBasemap } from '@/lib/map/basemaps';
import type { ImageryBasemap } from '@/lib/schemas/imagery-source';
import { uuid } from '@/lib/uuid';
import { useProjectStore } from '@/stores/project-store';

import { BoundsEditor } from './BoundsEditor';
import { DownloadPanel } from './DownloadPanel';
import { MapAuthoringCanvas } from './MapAuthoringCanvas';
import { SavedMapsList } from './SavedMapsList';
import { StylePicker } from './StylePicker';
import { ZoomSelector } from './ZoomSelector';
import type { ZoomRange } from './ZoomSelector';
import { mapMessages } from './messages';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

const DEFAULT_BBOX: [number, number, number, number] = [-75, -12, -45, 8];
const DEFAULT_ZOOM: ZoomRange = { minZoom: 0, maxZoom: 14 };

function SettingsSheet({ open, onOpenChange, children }: SettingsSheetProps) {
  const intl = useIntl();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            animation: 'fadeIn 150ms ease-out',
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 z-[51] flex max-h-[85vh] flex-col rounded-t-card bg-surface-card shadow-elevated focus:outline-none"
          style={{
            animation: 'slideUp 200ms ease-out',
          }}
        >
          <Dialog.Title className="sr-only">
            {intl.formatMessage(mapMessages.settings)}
          </Dialog.Title>

          <div className="flex justify-center pt-3 pb-1">
            <div
              aria-hidden="true"
              className="h-1 w-10 rounded-full bg-border"
            />
          </div>

          <div className="flex items-center justify-between border-b border-border/20 px-5 py-3">
            <span className="text-sm font-semibold text-text">
              {intl.formatMessage(mapMessages.settings)}
            </span>
            <Dialog.Close
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={intl.formatMessage(mapMessages.closeSettings)}
              style={{ touchAction: 'manipulation' }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 15 15"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z"
                  fill="currentColor"
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              </svg>
            </Dialog.Close>
          </div>

          <div className="overflow-y-auto p-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function MapScreen() {
  const intl = useIntl();
  const isDesktop = useIsDesktop();
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const projectsQuery = useProjects();
  const createMap = useCreateMap();
  const mapsQuery = useMaps(selectedProjectId);
  const mapRef = useRef<MapRef | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<ImageryBasemap>(() =>
    findBasemap(DEFAULT_BASEMAP_ID),
  );
  const [bbox, setBbox] =
    useState<[number, number, number, number]>(DEFAULT_BBOX);
  const [zoomRange, setZoomRange] = useState<ZoomRange>(DEFAULT_ZOOM);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [mapName, setMapName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const projects = projectsQuery.data ?? [];
  const selectedProject = projects.find(
    (project) => project.localId === selectedProjectId,
  );

  const topbarWorkspaceName =
    selectedProject?.name ?? intl.formatMessage(mapMessages.untitledProject);
  const shellSlot = useMemo(
    () => ({
      topbarWorkspaceName: selectedProjectId ? topbarWorkspaceName : undefined,
      topbarModeLabel: intl.formatMessage(mapMessages.title),
    }),
    [intl, selectedProjectId, topbarWorkspaceName],
  );
  useShellSlot(shellSlot);

  function openNameDialog() {
    setNameError(null);
    setNameDialogOpen(true);
  }

  async function handleSaveMap() {
    const trimmedName = mapName.trim();
    if (!trimmedName) {
      setNameError(intl.formatMessage(mapMessages.nameRequired));
      return;
    }
    if (!selectedProjectId) return;

    const now = new Date().toISOString();
    const map: SavedMap = {
      id: uuid(),
      projectLocalId: selectedProjectId,
      name: trimmedName,
      type: selectedStyle.type,
      styleUrl: selectedStyle.url,
      bbox,
      minZoom: zoomRange.minZoom,
      maxZoom: zoomRange.maxZoom,
      attribution: selectedStyle.attribution,
      ...(selectedStyle.type === 'raster'
        ? { scheme: selectedStyle.scheme ?? 'xyz' }
        : {}),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await createMap.mutateAsync(map);
      setNameDialogOpen(false);
      setMapName('');
      setNameError(null);
    } catch {
      setNameError(intl.formatMessage(mapMessages.saveError));
    }
  }

  if (!selectedProjectId || !selectedProject) {
    if (projectsQuery.isPending) {
      return (
        <div className="flex flex-col gap-4 p-6">
          <Skeleton height={40} width={200} />
          <Skeleton height={200} className="rounded-card" />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <p className="text-sm text-text-muted">
          {intl.formatMessage(mapMessages.noProject)}
        </p>
        <Link
          to="/"
          className="text-sm font-medium text-primary hover:underline"
        >
          {intl.formatMessage(mapMessages.noProjectLink)}
        </Link>
      </div>
    );
  }

  function renderControls() {
    return (
      <div className="flex flex-col gap-5">
        <StylePicker value={selectedStyle} onChange={setSelectedStyle} />
        <BoundsEditor
          bbox={bbox}
          onChange={setBbox}
          projectLocalId={selectedProjectId}
          mapRef={mapRef}
        />
        <ZoomSelector value={zoomRange} onChange={setZoomRange} />
        <SavedMapsList projectLocalId={selectedProjectId} />
        {(() => {
          const maps = mapsQuery.data ?? [];
          const downloadableMaps = maps.filter(
            (m) =>
              m.status === 'draft' ||
              m.status === 'downloading' ||
              m.status === 'error' ||
              m.status === 'ready',
          );
          return downloadableMaps.map((m) => (
            <DownloadPanel key={m.id} map={m} />
          ));
        })()}
        <Button onClick={openNameDialog} className="w-full">
          {intl.formatMessage(mapMessages.saveMap)}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-[640px] flex-col gap-3 overflow-hidden lg:flex-row">
        <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-card bg-surface-card shadow-card lg:min-h-0">
          <MapAuthoringCanvas
            basemap={selectedStyle}
            bbox={bbox}
            mapRef={mapRef}
          />

          <div className="absolute bottom-4 left-4 flex gap-2 lg:hidden">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSettingsOpen(true)}
            >
              {intl.formatMessage(mapMessages.settings)}
            </Button>
          </div>
          <div className="absolute bottom-4 right-4 lg:hidden">
            <Button size="sm" onClick={openNameDialog}>
              {intl.formatMessage(mapMessages.saveMap)}
            </Button>
          </div>
        </div>

        {isDesktop ? (
          <aside className="flex w-full max-w-[380px] shrink-0 flex-col overflow-y-auto rounded-card bg-surface-card p-4 shadow-card">
            {renderControls()}
          </aside>
        ) : null}
      </div>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        {isDesktop ? null : renderControls()}
      </SettingsSheet>

      <Modal
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
        title={intl.formatMessage(mapMessages.nameDialogTitle)}
        description={intl.formatMessage(mapMessages.nameDialogDescription)}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveMap();
          }}
        >
          <Input
            label={intl.formatMessage(mapMessages.nameLabel)}
            placeholder={intl.formatMessage(mapMessages.namePlaceholder)}
            value={mapName}
            onChange={(event) => {
              setMapName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setNameDialogOpen(false)}
            >
              {intl.formatMessage(mapMessages.cancel)}
            </Button>
            <Button type="submit" loading={createMap.isPending}>
              {intl.formatMessage(mapMessages.saveDraft)}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
