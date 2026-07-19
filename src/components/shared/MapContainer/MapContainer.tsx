import 'maplibre-gl/dist/maplibre-gl.css';

import {
  type CSSProperties,
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';
import type { MapRef } from 'react-map-gl/maplibre';
import Map from 'react-map-gl/maplibre';

import { basemapToMapStyle } from '@/lib/map/basemap-utils';
import { BASEMAP_CATALOG, findBasemap } from '@/lib/map/basemaps';
import type { BasemapId, ImageryBasemap } from '@/lib/schemas/imagery-source';
import { useMapStore } from '@/stores/map-store';

import { BasemapSwitcher } from './BasemapSwitcher';

const messages = defineMessages({
  viewOnly: {
    id: 'mapContainer.viewOnly',
    defaultMessage: 'View only',
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

  // Seed the store with defaultBasemapId once on mount (uncontrolled only)
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (defaultBasemapId && !controlledBasemapId && !hasSeededRef.current) {
      hasSeededRef.current = true;
      storeSetBasemap(defaultBasemapId);
    }
  }, [defaultBasemapId, controlledBasemapId, storeSetBasemap]);

  // Controlled basemapId takes priority; uncontrolled uses the store
  const activeBasemapId = controlledBasemapId ?? storeBasemapId;

  const basemap = useMemo(
    () => findBasemap(activeBasemapId, basemaps),
    [activeBasemapId, basemaps],
  );

  const mapStyle = useMemo(() => basemapToMapStyle(basemap), [basemap]);

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

  return (
    <div
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
        onLoad={onLoad}
        attributionControl={{ compact: true }}
        {...mapPassthrough}
      >
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

      {/* Basemap switcher overlay */}
      {showBasemapSwitcher && (
        <div className={`absolute z-10 ${positionClass}`}>
          {basemapSwitcherSlot ?? (
            <BasemapSwitcher
              value={basemap.id as BasemapId}
              onChange={handleBasemapChange}
              basemaps={basemaps}
            />
          )}
        </div>
      )}
    </div>
  );
}

export { MapContainer };
