import { Layer, Source } from 'react-map-gl/maplibre';
import type { LayerProps } from 'react-map-gl/maplibre';

import {
  type AuthoredLayer,
  fragmentLayerIdForAuthoredLayer,
  sourceLayerIdForAuthoredLayer,
} from '@/lib/map/authored-layers';

interface AuthoredLayerCanvasLayersProps {
  layer: AuthoredLayer;
}

function renderFragments(layer: AuthoredLayer, sourceId: string) {
  return layer.render.layers.map((fragment, index) => {
    const props = {
      id: fragmentLayerIdForAuthoredLayer(layer.id, index),
      type: fragment.type,
      source: sourceId,
      ...(fragment.filter === undefined ? {} : { filter: fragment.filter }),
      ...(fragment.minzoom === undefined ? {} : { minzoom: fragment.minzoom }),
      ...(fragment.maxzoom === undefined ? {} : { maxzoom: fragment.maxzoom }),
      ...(fragment.paint === undefined ? {} : { paint: fragment.paint }),
      layout: {
        ...(fragment.layout ?? {}),
        visibility: layer.visible ? 'visible' : 'none',
      },
    } as LayerProps;
    return <Layer key={props.id} {...props} />;
  });
}

/**
 * Render one canonical persisted AuthoredLayer directly from its validated
 * source/render bundle. This keeps the authoring canvas aligned with the same
 * source IDs, fragment IDs, style, visibility, and raster/vector semantics used
 * by the SMP composition path instead of projecting through the legacy
 * GeoJsonOverlay shape.
 */
export function AuthoredLayerCanvasLayers({
  layer,
}: AuthoredLayerCanvasLayersProps) {
  const sourceId = sourceLayerIdForAuthoredLayer(layer.id);
  const fragments = renderFragments(layer, sourceId);

  if (layer.source.type === 'geojson') {
    return (
      <Source id={sourceId} type="geojson" data={layer.source.data}>
        {fragments}
      </Source>
    );
  }

  return (
    <Source
      id={sourceId}
      type="raster"
      tiles={[...layer.source.tiles]}
      tileSize={layer.source.tileSize}
      scheme={layer.source.scheme}
      {...(layer.source.minZoom === undefined
        ? {}
        : { minzoom: layer.source.minZoom })}
      {...(layer.source.maxZoom === undefined
        ? {}
        : { maxzoom: layer.source.maxZoom })}
      {...(layer.source.attribution === undefined
        ? {}
        : { attribution: layer.source.attribution })}
    >
      {fragments}
    </Source>
  );
}

export type { AuthoredLayerCanvasLayersProps };
