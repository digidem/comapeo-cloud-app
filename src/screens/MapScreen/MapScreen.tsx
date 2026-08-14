import * as Dialog from '@radix-ui/react-dialog';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import type { MapRef } from 'react-map-gl/maplibre';

import { Link } from '@tanstack/react-router';

import { useShellSlot } from '@/components/layout/shell-slot';
import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/close-icon';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useCreateMap, useMaps } from '@/hooks/useMaps';
import { useProjects } from '@/hooks/useProjects';
import { getProjectPoints } from '@/lib/data-layer';
import type { SavedMap } from '@/lib/db';
import { DEFAULT_BASEMAP_ID, findBasemap } from '@/lib/map/basemaps';
import {
  clampBboxLatitude,
  crossesAntimeridian,
  finalizeBbox,
  spansAntimeridian,
} from '@/lib/map/bbox-utils';
import {
  type GeoJsonOverlay,
  GeoJsonOverlayError,
  readGeoJsonOverlayFile,
} from '@/lib/map/geojson-overlays';
import type { ImageryBasemap } from '@/lib/schemas/imagery-source';
import { uuid } from '@/lib/uuid';
import { useProjectStore } from '@/stores/project-store';

import { BoundsEditor } from './BoundsEditor';
import { DownloadPanel } from './DownloadPanel';
import { DrawBoundsControl } from './DrawBoundsControl';
import { GeoJsonOverlayControl } from './GeoJsonOverlayControl';
import { ImportSmpButton } from './ImportSmpButton';
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
              <CloseIcon size={20} />
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
  const [referenceOverlays, setReferenceOverlays] = useState<GeoJsonOverlay[]>(
    [],
  );
  const [referenceOverlayError, setReferenceOverlayError] = useState<
    string | null
  >(null);
  const [referenceOverlayErrorSurface, setReferenceOverlayErrorSurface] =
    useState<'controls' | 'map' | null>(null);
  const [referenceOverlayLoading, setReferenceOverlayLoading] = useState(false);
  const referenceOverlayImportsRef = useRef(new Set<symbol>());
  const referenceOverlayGenerationRef = useRef(0);
  const referenceOverlayImportSequenceRef = useRef(0);
  const referenceOverlayLatestUiOutcomeRef = useRef(0);
  const [referenceOverlayProjectId, setReferenceOverlayProjectId] =
    useState(selectedProjectId);
  if (referenceOverlayProjectId !== selectedProjectId) {
    setReferenceOverlayProjectId(selectedProjectId);
    setReferenceOverlays([]);
    setReferenceOverlayError(null);
    setReferenceOverlayErrorSurface(null);
    setReferenceOverlayLoading(false);
  }

  useEffect(() => {
    referenceOverlayGenerationRef.current += 1;
    referenceOverlayImportsRef.current.clear();
    referenceOverlayImportSequenceRef.current = 0;
    referenceOverlayLatestUiOutcomeRef.current = 0;
  }, [selectedProjectId]);

  // Track the computed project bbox for hasConfigChanges comparison
  const [projectBbox, setProjectBbox] = useState<
    [number, number, number, number] | null
  >(null);
  const [autoFitBbox, setAutoFitBbox] = useState<
    [number, number, number, number] | null
  >(null);
  // Track if user has explicitly modified bbox (drawing, inputs, current view, project area button)
  const hasUserModifiedBboxRef = useRef(false);
  // Ref to track drawMode without adding it as an effect dependency
  const drawModeRef = useRef(drawMode);
  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Compute project area bbox from observations on mount
  useEffect(() => {
    const projectId = selectedProjectId;
    if (!projectId) return;
    // Reset user-modified flag when project changes
    hasUserModifiedBboxRef.current = false;
    let cancelled = false;
    async function loadProjectBbox() {
      // Reset project bbox when project changes; defer autoFitBbox reset
      // until we know whether there are geolocated points
      setProjectBbox(null);
      try {
        const points = await getProjectPoints(projectId!);
        if (cancelled) return;
        const coords: [number, number][] = [];
        for (const feature of points?.features ?? []) {
          if (
            feature.geometry?.type === 'Point' &&
            Array.isArray(feature.geometry.coordinates) &&
            feature.geometry.coordinates.length === 2
          ) {
            const [lng, lat] = feature.geometry.coordinates as [number, number];
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              coords.push([lng, lat]);
            }
          }
        }
        if (coords.length > 0) {
          const lngs = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);

          // Use finalizeBbox to handle both antimeridian and normal cases consistently
          const finalizedBbox = finalizeBbox(lngs, lats);

          if (finalizedBbox === null) {
            // Invalid bbox - fall back to DEFAULT_BBOX if user hasn't edited
            if (
              !hasUserModifiedBboxRef.current &&
              drawModeRef.current === null
            ) {
              setBbox(DEFAULT_BBOX);
              setAutoFitBbox(DEFAULT_BBOX);
            }
            return;
          }

          // Antimeridian-spanning projects: the camera can render lng > 180,
          // but the editable/savable bbox cannot (schema requires ±180).
          // Keep the shifted bbox camera-only; fall back to DEFAULT_BBOX for
          // the savable bbox and baseline so BoundsEditor shows valid values.
          if (spansAntimeridian(lngs)) {
            setProjectBbox(null);
            if (
              !hasUserModifiedBboxRef.current &&
              drawModeRef.current === null
            ) {
              setBbox(DEFAULT_BBOX);
              setAutoFitBbox(finalizedBbox);
            }
            return;
          }

          setProjectBbox(finalizedBbox);
          // Only apply and fit if user hasn't edited and not in draw mode
          if (!hasUserModifiedBboxRef.current && drawModeRef.current === null) {
            setBbox(finalizedBbox);
            setAutoFitBbox(finalizedBbox);
          }
          // If user edited or in draw mode, don't auto-fit - leave camera alone
        } else {
          // No geolocated observations - reset to default
          if (!hasUserModifiedBboxRef.current && drawModeRef.current === null) {
            setBbox(DEFAULT_BBOX);
            setAutoFitBbox(DEFAULT_BBOX);
          }
          // If user edited or in draw mode, don't auto-fit - leave camera alone
        }
      } catch {
        // Ignore errors, keep DEFAULT_BBOX
        if (cancelled) return;
        if (!hasUserModifiedBboxRef.current && drawModeRef.current === null) {
          setBbox(DEFAULT_BBOX);
          setAutoFitBbox(DEFAULT_BBOX);
        }
        // If user edited or in draw mode, don't auto-fit - leave camera alone
      }
    }
    loadProjectBbox();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  function handleDrawModeChange(
    mode: 'draw_rectangle' | 'simple_select' | null,
  ) {
    if (mode === 'draw_rectangle') setFrameError(null);
    setDrawMode(mode);
  }

  function handleDrawCreate(next: [number, number, number, number]) {
    previousBboxRef.current = bbox;
    setBbox(next);
    hasUserModifiedBboxRef.current = true;
    setShowUndo(true);
    setFrameError(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setShowUndo(false), 6000);
  }

  function handleUndoDraw() {
    if (previousBboxRef.current) setBbox(previousBboxRef.current);
    setShowUndo(false);
  }

  async function handleReferenceOverlayFiles(
    files: File[],
    errorSurface: 'controls' | 'map' = 'controls',
  ) {
    if (files.length === 0) return;
    const importProjectId = selectedProjectId;
    const importGeneration = referenceOverlayGenerationRef.current;
    const importSequence = referenceOverlayImportSequenceRef.current + 1;
    referenceOverlayImportSequenceRef.current = importSequence;
    const importToken = Symbol('reference-overlay-import');
    referenceOverlayImportsRef.current.add(importToken);
    setReferenceOverlayLoading(true);
    setReferenceOverlayError(null);
    setReferenceOverlayErrorSurface(null);

    try {
      const results = await Promise.all(
        files.map(async (file) => {
          try {
            return {
              ok: true as const,
              file,
              data: await readGeoJsonOverlayFile(file),
            };
          } catch (error) {
            return { ok: false as const, file, error };
          }
        }),
      );
      if (
        useProjectStore.getState().selectedProjectId !== importProjectId ||
        referenceOverlayGenerationRef.current !== importGeneration
      ) {
        return;
      }

      const failure = results.find((result) => !result.ok);
      if (failure && !failure.ok) {
        if (importSequence < referenceOverlayLatestUiOutcomeRef.current) {
          return;
        }
        referenceOverlayLatestUiOutcomeRef.current = importSequence;
        const values = { name: failure.file.name };
        if (failure.error instanceof GeoJsonOverlayError) {
          let message = mapMessages.referenceOverlaysInvalid;
          if (failure.error.code === 'invalid-polygon-ring') {
            message = mapMessages.referenceOverlaysInvalidPolygonRing;
          } else if (failure.error.code === 'read') {
            message = mapMessages.referenceOverlaysReadError;
          } else if (failure.error.code === 'too-large') {
            message = mapMessages.referenceOverlaysTooLarge;
          } else if (failure.error.code === 'unsupported') {
            message = mapMessages.referenceOverlaysUnsupported;
          } else if (failure.error.code === 'unsupported-file') {
            message = mapMessages.referenceOverlaysUnsupportedFile;
          }
          setReferenceOverlayError(intl.formatMessage(message, values));
        } else {
          setReferenceOverlayError(
            intl.formatMessage(mapMessages.referenceOverlaysReadError, values),
          );
        }
        setReferenceOverlayErrorSurface(errorSurface);
        return;
      }

      const additions: GeoJsonOverlay[] = results.flatMap((result) =>
        result.ok
          ? [
              {
                id: uuid(),
                name: result.file.name,
                data: result.data,
                visible: true,
              },
            ]
          : [],
      );
      setReferenceOverlays((current) => [...current, ...additions]);
      if (importSequence >= referenceOverlayLatestUiOutcomeRef.current) {
        referenceOverlayLatestUiOutcomeRef.current = importSequence;
        setReferenceOverlayError(null);
        setReferenceOverlayErrorSurface(null);
      }
    } finally {
      if (referenceOverlayGenerationRef.current === importGeneration) {
        referenceOverlayImportsRef.current.delete(importToken);
        if (referenceOverlayImportsRef.current.size === 0) {
          setReferenceOverlayLoading(false);
        }
      }
    }
  }

  function handleReferenceOverlayToggle(id: string) {
    setReferenceOverlays((current) =>
      current.map((overlay) =>
        overlay.id === id ? { ...overlay, visible: !overlay.visible } : overlay,
      ),
    );
  }

  function handleReferenceOverlayRemove(id: string) {
    setReferenceOverlays((current) =>
      current.filter((overlay) => overlay.id !== id),
    );
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

  const hasConfigChanges = useMemo(() => {
    const baseline = projectBbox ?? DEFAULT_BBOX;
    return (
      bbox[0] !== baseline[0] ||
      bbox[1] !== baseline[1] ||
      bbox[2] !== baseline[2] ||
      bbox[3] !== baseline[3] ||
      zoomRange.minZoom !== DEFAULT_ZOOM.minZoom ||
      zoomRange.maxZoom !== DEFAULT_ZOOM.maxZoom ||
      selectedStyle.id !== DEFAULT_BASEMAP_ID
    );
  }, [bbox, zoomRange, selectedStyle, projectBbox]);

  function openNameDialog() {
    setNameError(null);
    setSettingsOpen(false);
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
      origin: 'authored',
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
          onChange={(nextBbox) => {
            hasUserModifiedBboxRef.current = true;
            setBbox(nextBbox);
          }}
          projectLocalId={selectedProjectId}
          mapRef={mapRef}
        />
        <GeoJsonOverlayControl
          overlays={referenceOverlays}
          onFilesSelected={handleReferenceOverlayFiles}
          onToggle={handleReferenceOverlayToggle}
          onRemove={handleReferenceOverlayRemove}
          error={
            referenceOverlayErrorSurface === 'controls'
              ? referenceOverlayError
              : null
          }
          onDismissError={() => {
            setReferenceOverlayError(null);
            setReferenceOverlayErrorSurface(null);
          }}
          loading={referenceOverlayLoading}
        />
        <ZoomSelector value={zoomRange} onChange={setZoomRange} />
        <p className="text-xs text-text-muted">
          {intl.formatMessage(mapMessages.zoomDownloadNote)}
        </p>
        <SavedMapsList projectLocalId={selectedProjectId} />
        <ImportSmpButton projectLocalId={selectedProjectId} />
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
            fitBounds={autoFitBbox}
            overlays={referenceOverlays}
            onOverlayFilesDrop={(files) =>
              handleReferenceOverlayFiles(files, 'map')
            }
          />

          {referenceOverlayError && referenceOverlayErrorSurface === 'map' ? (
            <div
              role="alert"
              data-testid="reference-overlay-map-error"
              className="absolute bottom-16 right-4 z-20 flex max-w-sm items-start gap-2 rounded-btn bg-error px-3 py-2 text-sm text-white shadow-card"
            >
              <span className="min-w-0 flex-1">{referenceOverlayError}</span>
              <button
                type="button"
                onClick={() => {
                  setReferenceOverlayError(null);
                  setReferenceOverlayErrorSurface(null);
                }}
                aria-label={intl.formatMessage(
                  mapMessages.referenceOverlaysDismiss,
                )}
                className="min-h-11 shrink-0 rounded-btn px-2 text-xs font-semibold text-white underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {intl.formatMessage(mapMessages.referenceOverlaysDismissAction)}
              </button>
            </div>
          ) : null}

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
              {/* Intentionally no !hasConfigChanges guard: this quick action
                  may save the current/default map view at any time.
                  Only pending-disable is needed here. */}
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
