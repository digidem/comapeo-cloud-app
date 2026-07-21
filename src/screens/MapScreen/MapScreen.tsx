import * as Dialog from '@radix-ui/react-dialog';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { clampBboxLatitude, crossesAntimeridian } from '@/lib/map/bbox-utils';
import type { ImageryBasemap } from '@/lib/schemas/imagery-source';
import { uuid } from '@/lib/uuid';
import { useProjectStore } from '@/stores/project-store';

import { BoundsEditor } from './BoundsEditor';
import { DownloadPanel } from './DownloadPanel';
import { DrawBoundsControl } from './DrawBoundsControl';
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

// Frame overlay geometry for the mobile "pan-under-frame" draw pattern
const FRAME_LEFT = 0.1; // 10% from left
const FRAME_TOP = 0.2; // 20% from top
const FRAME_WIDTH = 0.8; // 80% of viewport
const FRAME_HEIGHT = 0.6; // 60% of viewport

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
  const [drawMode, setDrawMode] = useState<
    'draw_rectangle' | 'simple_select' | null
  >(null);
  const previousBboxRef = useRef<[number, number, number, number] | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [frameError, setFrameError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  function handleDrawModeChange(
    mode: 'draw_rectangle' | 'simple_select' | null,
  ) {
    if (mode === 'draw_rectangle') setFrameError(null);
    setDrawMode(mode);
  }

  function handleDrawCreate(next: [number, number, number, number]) {
    previousBboxRef.current = bbox;
    setBbox(next);
    setShowUndo(true);
    setFrameError(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setShowUndo(false), 6000);
  }

  function handleUndoDraw() {
    if (previousBboxRef.current) setBbox(previousBboxRef.current);
    setShowUndo(false);
  }

  function handleConfirmFrame() {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const canvas = map.getCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const corners = [
      map.unproject([w * FRAME_LEFT, h * FRAME_TOP]),
      map.unproject([w * (FRAME_LEFT + FRAME_WIDTH), h * FRAME_TOP]),
      map.unproject([
        w * (FRAME_LEFT + FRAME_WIDTH),
        h * (FRAME_TOP + FRAME_HEIGHT),
      ]),
      map.unproject([w * FRAME_LEFT, h * (FRAME_TOP + FRAME_HEIGHT)]),
    ];
    const rawLngs = corners.map((c) => c.lng);
    if (crossesAntimeridian(rawLngs)) {
      setFrameError(intl.formatMessage(mapMessages.antimeridianCrossing));
      return;
    }
    const lngs = corners.map(
      (c) => ((((c.lng + 180) % 360) + 360) % 360) - 180,
    );
    const lats = corners.map((c) => c.lat);
    const candidate: [number, number, number, number] = [
      Math.min(...lngs),
      Math.min(...lats),
      Math.max(...lngs),
      Math.max(...lats),
    ];
    // Clamp to Web Mercator latitude limits and reject zero-area
    const clamped = clampBboxLatitude(candidate);
    if (clamped[1] >= clamped[3] || clamped[0] >= clamped[2]) {
      setFrameError(intl.formatMessage(mapMessages.zeroAreaBounds));
      return;
    }
    setFrameError(null);
    handleDrawCreate(clamped);
    setDrawMode('simple_select');
  }

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

  const hasConfigChanges = useMemo(
    () =>
      bbox[0] !== DEFAULT_BBOX[0] ||
      bbox[1] !== DEFAULT_BBOX[1] ||
      bbox[2] !== DEFAULT_BBOX[2] ||
      bbox[3] !== DEFAULT_BBOX[3] ||
      zoomRange.minZoom !== DEFAULT_ZOOM.minZoom ||
      zoomRange.maxZoom !== DEFAULT_ZOOM.maxZoom ||
      selectedStyle.id !== DEFAULT_BASEMAP_ID,
    [bbox, zoomRange, selectedStyle],
  );

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
        <p className="text-xs text-text-muted">
          {intl.formatMessage(mapMessages.zoomDownloadNote)}
        </p>
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
        <Button
          onClick={openNameDialog}
          className="w-full"
          disabled={createMap.isPending || !hasConfigChanges}
        >
          {intl.formatMessage(mapMessages.saveMap)}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden lg:flex-row">
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-card bg-surface-card shadow-card">
          <MapAuthoringCanvas
            basemap={selectedStyle}
            bbox={drawMode === 'draw_rectangle' ? null : bbox}
            mapRef={mapRef}
            drawMode={isDesktop ? drawMode : null}
            onDrawCreate={handleDrawCreate}
            onDrawModeChange={handleDrawModeChange}
          />

          {drawMode !== 'draw_rectangle' && (
            <div className="absolute bottom-4 left-4 flex gap-2 lg:hidden">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSettingsOpen(true)}
              >
                {intl.formatMessage(mapMessages.settings)}
              </Button>
            </div>
          )}
          <div className="absolute top-4 right-3 z-10">
            <DrawBoundsControl
              drawMode={drawMode}
              onDrawModeChange={handleDrawModeChange}
            />
          </div>
          {drawMode === 'draw_rectangle' ? (
            <div
              className="pointer-events-none absolute left-3 right-16 top-4 z-10 flex items-center gap-2 rounded-btn bg-black/70 px-3 py-2 shadow-card"
              style={{ touchAction: 'manipulation' }}
            >
              <p className="flex-1 text-sm text-white">
                {intl.formatMessage(
                  isDesktop
                    ? mapMessages.drawingInstruction
                    : mapMessages.frameInstruction,
                )}
              </p>
              <button
                type="button"
                onClick={() => handleDrawModeChange('simple_select')}
                className="pointer-events-auto min-h-[44px] shrink-0 px-2 text-sm font-medium text-white underline"
                style={{ touchAction: 'manipulation' }}
              >
                {intl.formatMessage(mapMessages.drawingInstructionCancel)}
              </button>
            </div>
          ) : null}
          {frameError ? (
            <p
              role="alert"
              className="pointer-events-none absolute left-3 right-16 top-16 z-10 rounded-btn bg-error px-3 py-2 text-sm text-white shadow-card"
            >
              {frameError}
            </p>
          ) : null}
          {drawMode === 'draw_rectangle' && !isDesktop ? (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
              >
                <div
                  data-testid="draw-frame"
                  className="h-3/5 w-4/5 rounded-sm border-2 border-dashed border-primary shadow-[0_0_0_9999px_rgba(4,20,92,0.35)]"
                />
              </div>
              <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
                <Button onClick={handleConfirmFrame}>
                  {intl.formatMessage(mapMessages.setThisArea)}
                </Button>
              </div>
            </>
          ) : null}
          {showUndo ? (
            <div
              role="status"
              className="absolute bottom-16 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-btn bg-black/80 px-4 py-2 shadow-card"
            >
              <span className="text-sm text-white">
                {intl.formatMessage(mapMessages.areaUpdated)}
              </span>
              <button
                type="button"
                onClick={handleUndoDraw}
                className="min-h-[44px] text-sm font-semibold text-white underline"
                style={{ touchAction: 'manipulation' }}
              >
                {intl.formatMessage(mapMessages.undo)}
              </button>
            </div>
          ) : null}
          {drawMode !== 'draw_rectangle' && (
            <div className="absolute bottom-4 right-4 lg:hidden">
              <Button
                size="sm"
                onClick={openNameDialog}
                disabled={createMap.isPending}
              >
                {intl.formatMessage(mapMessages.saveMap)}
              </Button>
            </div>
          )}
        </div>

        {isDesktop ? (
          <aside className="flex w-full max-w-[380px] shrink-0 flex-col overflow-y-auto rounded-card bg-surface-card px-4 pb-4 pt-6 shadow-card">
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
