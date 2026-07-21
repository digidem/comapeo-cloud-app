import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  type CSSProperties,
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';
import type { MapRef } from 'react-map-gl/maplibre';
import Map, { AttributionControl } from 'react-map-gl/maplibre';

import { useQuery } from '@tanstack/react-query';

import { type SavedMap, getDb } from '@/lib/db';
import { basemapToMapStyle } from '@/lib/map/basemap-utils';
import { BASEMAP_CATALOG, findBasemap } from '@/lib/map/basemaps';
import {
  closeSmpReader,
  getSmpReader,
  registerSmpProtocol,
  resolveSmpStyle,
} from '@/lib/map/smp-serve';
import type { BasemapId, ImageryBasemap } from '@/lib/schemas/imagery-source';
import { useMapStore } from '@/stores/map-store';

import { BasemapSwitcher } from './BasemapSwitcher';

const messages = defineMessages({
  viewOnly: {
    id: 'mapContainer.viewOnly',
    defaultMessage: 'View only',
  },
  activeMapBadge: {
    id: 'map.activeMap.badge',
    defaultMessage: 'Active offline map: {name}',
  },
  activeMapOnlineBadge: {
    id: 'map.activeMap.onlineBadge',
    defaultMessage: 'Active map (online): {name}',
  },
  basemapDisabledHint: {
    id: 'map.basemapSwitcher.disabledHint',
    defaultMessage: 'Basemap used when offline map is turned off',
  },
});

type SwitcherPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left';

/** Props forwarded to the underlying react-map-gl Map component. */
export type MapPassthroughProps = Omit<
  ComponentProps<typeof Map>,
  | 'ref'
  | 'initialViewState'
  | 'mapStyle'
  | 'interactive'
  | 'onLoad'
  | 'children'
>;

export interface MapContainerProps extends MapPassthroughProps {
  /** Initial view state for the map */
  initialViewState?: {
    longitude?: number;
    latitude?: number;
    zoom?: number;
    pitch?: number;
    bearing?: number;
  };

  /** Whether the map is interactive (default: true) */
  interactive?: boolean;

  /** Whether to show a "View only" badge while non-interactive (default: true).
   *  Renders only when `interactive` is false; gives the otherwise
   *  behavior-only state a visible affordance (also distinguishes screenshots). */
  showViewOnlyBadge?: boolean;

  /** Controlled basemap selection — overrides the store */
  basemapId?: BasemapId;

  /** Initial basemap when uncontrolled (default: store value).
   *  Seeds the store once on mount; subsequent switcher changes persist. */
  defaultBasemapId?: BasemapId;

  /** Callback when basemap changes (fires in both controlled and uncontrolled) */
  onBasemapChange?: (id: BasemapId) => void;

  /** Override the basemap catalog per-instance */
  basemaps?: ImageryBasemap[];

  /** Whether to show the basemap switcher (default: true) */
  showBasemapSwitcher?: boolean;

  /** Position of the basemap switcher overlay */
  basemapSwitcherPosition?: SwitcherPosition;

  /** Escape hatch: render a custom basemap switcher instead of the built-in one */
  basemapSwitcherSlot?: ReactNode;

  /** Ref to the underlying MapRef for imperative access */
  mapRef?: React.Ref<MapRef>;

  /** Map load callback */
  onLoad?: () => void;

  /** Container className */
  className?: string;

  /** Container inline style */
  style?: CSSProperties;

  /** Container height (default: '100%') */
  height?: string | number;

  /** Children (Source, Layer, Marker, Popup, etc.) */
  children?: ReactNode;
}

const POSITION_CLASSES: Record<SwitcherPosition, string> = {
  'top-right': 'top-3 right-3',
  'top-left': 'top-3 left-3',
  'bottom-right': 'bottom-3 right-3',
  'bottom-left': 'bottom-3 left-3',
};

function MapContainer({
  initialViewState,
  interactive = true,
  showViewOnlyBadge = true,
  basemapId: controlledBasemapId,
  defaultBasemapId,
  onBasemapChange,
  basemaps = BASEMAP_CATALOG,
  showBasemapSwitcher = true,
  basemapSwitcherPosition = 'top-right',
  basemapSwitcherSlot,
  mapRef,
  onLoad,
  className,
  style,
  height = '100%',
  children,
  ...mapPassthrough
}: MapContainerProps) {
  const intl = useIntl();
  const storeBasemapId = useMapStore((s) => s.basemapId);
  const storeSetBasemap = useMapStore((s) => s.setBasemap);
  const activeMapId = useMapStore((s) => s.activeMapId);

  const { data: activeSavedMap } = useQuery<SavedMap | undefined>({
    queryKey: ['map', activeMapId],
    queryFn: () =>
      activeMapId ? getDb().maps.get(activeMapId) : Promise.resolve(undefined),
    enabled: !!activeMapId,
  });

  const [smpStyle, setSmpStyle] = useState<StyleSpecification | null>(null);

  // Build an ImageryBasemap from the active map's saved style settings
  // so the user sees the same layer/settings across the app immediately
  // when they set a map active, even before the SMP blob downloads.
  const activeMapStyle = useMemo(() => {
    if (!activeSavedMap?.styleUrl) return undefined;
    return {
      id: `active:${activeSavedMap.id}` as BasemapId,
      name: activeSavedMap.name,
      category: 'street' as const,
      type: activeSavedMap.type as 'raster' | 'style',
      url: activeSavedMap.styleUrl,
      attribution: activeSavedMap.attribution,
      ...(activeSavedMap.type === 'raster'
        ? {
            scheme:
              (
                activeSavedMap as typeof activeSavedMap & {
                  scheme?: 'xyz' | 'tms';
                }
              ).scheme ?? 'xyz',
          }
        : {}),
    } satisfies ImageryBasemap;
  }, [activeSavedMap]);

  // Seed the store with defaultBasemapId once on mount (uncontrolled only)
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (defaultBasemapId && !controlledBasemapId && !hasSeededRef.current) {
      hasSeededRef.current = true;
      storeSetBasemap(defaultBasemapId);
    }
  }, [defaultBasemapId, controlledBasemapId, storeSetBasemap]);

  // SMP reader lifecycle — register protocol, open reader, resolve style.
  // Only activates when the blob is downloaded (status === 'ready').
  useEffect(() => {
    const mapId = activeSavedMap?.id;
    const smpBlob = activeSavedMap?.smpBlob;
    const status = activeSavedMap?.status;

    if (!mapId || !smpBlob || status !== 'ready') return;

    let cancelled = false;
    registerSmpProtocol();
    getSmpReader(mapId, smpBlob).then((reader) => {
      if (cancelled) return;
      resolveSmpStyle(reader, mapId).then((style) => {
        if (cancelled) return;
        setSmpStyle(style);
      });
    });
    return () => {
      cancelled = true;
      closeSmpReader(mapId);
      setSmpStyle(null);
    };
  }, [activeSavedMap?.id, activeSavedMap?.smpBlob, activeSavedMap?.status]);

  // Controlled basemapId takes priority; uncontrolled uses the store
  const activeBasemapId = controlledBasemapId ?? storeBasemapId;

  const basemap = useMemo(
    () => findBasemap(activeBasemapId, basemaps),
    [activeBasemapId, basemaps],
  );

  // Basemap resolution: SMP style > active map style > store/controlled basemap
  const effectiveBasemap = useMemo(() => {
    if (activeMapStyle) return activeMapStyle;
    return basemap;
  }, [activeMapStyle, basemap]);

  const mapStyle = useMemo(
    () => smpStyle ?? basemapToMapStyle(effectiveBasemap),
    [smpStyle, effectiveBasemap],
  );

  const isOnlineActive = activeMapStyle !== undefined && !smpStyle;

  const handleBasemapChange = (id: BasemapId) => {
    if (onBasemapChange) {
      onBasemapChange(id);
    }
    // Only update store if uncontrolled
    if (!controlledBasemapId) {
      storeSetBasemap(id);
    }
  };

  const positionClass = POSITION_CLASSES[basemapSwitcherPosition];

  const containerStyle: CSSProperties = {
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  const containerClassName = className
    ? `relative overflow-hidden ${className}`
    : 'relative overflow-hidden';

  const containerRef = useRef<HTMLDivElement>(null);

  // Start compact attribution collapsed — MapLibre initializes with
  // both `maplibregl-compact` and `maplibregl-compact-show`, which shows
  // the full text. Remove `compact-show` on mount so the info button
  // starts collapsed and expands on click.
  const handleMapLoad = useCallback(() => {
    const el = containerRef.current?.querySelector(
      '.maplibregl-ctrl-attrib.maplibregl-compact',
    );
    el?.classList.remove('maplibregl-compact-show');
    onLoad?.();
  }, [onLoad]);

  return (
    <div
      ref={containerRef}
      data-testid="map-container"
      className={containerClassName}
      style={containerStyle}
    >
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: initialViewState?.longitude ?? 0,
          latitude: initialViewState?.latitude ?? 0,
          zoom: initialViewState?.zoom ?? 1,
          pitch: initialViewState?.pitch ?? 0,
          bearing: initialViewState?.bearing ?? 0,
        }}
        mapStyle={mapStyle}
        interactive={interactive}
        onLoad={handleMapLoad}
        attributionControl={false}
        {...mapPassthrough}
      >
        <AttributionControl position="top-left" compact />
        {children}
      </Map>

      {/* View-only affordance for the non-interactive state. Without this the
          difference between interactive and non-interactive maps is behavior
          only (pan/zoom) and invisible in static screenshots. The z-20
          keeps the badge above the basemap switcher (z-10) when both are
          positioned top-left. */}
      {!interactive && showViewOnlyBadge && (
        <div className="absolute top-3 left-3 z-20">
          <span
            data-testid="map-view-only-badge"
            className="inline-flex items-center gap-1 rounded-full bg-[#04145C]/85 px-2.5 py-1 text-xs font-medium text-white shadow-[0_8px_24px_rgba(9,30,66,0.08)] backdrop-blur-sm"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5"
            >
              <path
                d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="3"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            {intl.formatMessage(messages.viewOnly)}
          </span>
        </div>
      )}

      {/* Active offline map badge — bottom-left, visible when SMP tiles are active */}
      {smpStyle && (
        <div className="absolute bottom-3 left-3 z-20">
          <span
            data-testid="map-active-map-badge"
            className="inline-flex items-center gap-1 rounded-full bg-[#04145C]/85 px-2.5 py-1 text-xs font-medium text-white shadow-[0_8px_24px_rgba(9,30,66,0.08)] backdrop-blur-sm"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5"
            >
              <path
                d="M9 2L3 5v17l6-3 6 3 6-3V2l-6 3-6-3z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 2v17M15 5v17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {intl.formatMessage(messages.activeMapBadge, {
              name: activeSavedMap?.name ?? '',
            })}
          </span>
        </div>
      )}

      {/* Online active map badge — visible when using active map style but SMP not yet ready */}
      {isOnlineActive && (
        <div className="absolute bottom-3 left-3 z-20">
          <span
            data-testid="map-online-active-badge"
            className="inline-flex items-center gap-1 rounded-full bg-[#04145C]/85 px-2.5 py-1 text-xs font-medium text-white shadow-[0_8px_24px_rgba(9,30,66,0.08)] backdrop-blur-sm"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="12" cy="12" r="4" fill="currentColor" />
              <path
                d="M12 2v4M12 18v4M2 12h4M18 12h4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {intl.formatMessage(messages.activeMapOnlineBadge, {
              name: activeSavedMap?.name ?? '',
            })}
          </span>
        </div>
      )}

      {/* Basemap switcher overlay */}
      {showBasemapSwitcher && (
        <div className={`absolute z-10 ${positionClass}`}>
          {basemapSwitcherSlot ?? (
            <BasemapSwitcher
              value={basemap.id as BasemapId}
              onChange={handleBasemapChange}
              basemaps={basemaps}
              title={
                isOnlineActive || smpStyle
                  ? intl.formatMessage(messages.basemapDisabledHint)
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

export { MapContainer };
