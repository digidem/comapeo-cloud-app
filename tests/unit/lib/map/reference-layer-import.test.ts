import {
  WGS84_PRJ as FIXTURE_WGS84_PRJ,
  SIRGAS_2000_UTM_23S_PRJ,
  WEB_MERCATOR_PRJ,
  WGS84_UTM_23S_PRJ,
  corruptZipEntryBody,
  dbfWithDeclaredRecordCount,
  oneRecordDbf as fixtureOneRecordDbf,
  pointShp as fixturePointShp,
  makeArchiveBytes,
  makeArchiveFile,
  oneCp1252Dbf,
  oneDateDbf,
  oneNonFiniteNumberDbf,
  patchZipEntryCompression,
  patchZipEntryFlags,
  patchZipEntryNameSameLength,
  patchZipEntryUncompressedSize,
  promoteZipToZip64,
} from '@tests/fixtures/reference-import/generated';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_AUTHORED_JSON_STRING_BYTES,
  MAX_AUTHORED_LAYERS,
} from '@/lib/map/authored-layers';
import { MAX_GEOJSON_OVERLAY_BYTES } from '@/lib/map/geojson-overlays';
import {
  MAX_REFERENCE_ARCHIVE_ENTRIES,
  MAX_REFERENCE_ARCHIVE_ENTRY_BYTES,
  MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES,
  MAX_REFERENCE_IMPORT_SOURCE_BYTES,
  MAX_REFERENCE_TEXT_METADATA_BYTES,
  MAX_REFERENCE_XML_DEPTH,
  MAX_REFERENCE_XML_ELEMENTS,
  MAX_REFERENCE_XML_MARKUP_TOKENS,
  REFERENCE_IMPORT_ACCEPT,
  ReferenceLayerImportError,
  SUPPORTED_REFERENCE_IMPORT_EXTENSIONS,
  detectReferenceImportFormat,
  prepareReferenceImportBatch,
} from '@/lib/map/reference-layer-import';

function namedFile(name: string, type = ''): File {
  return new File([''], name, { type });
}

describe('reference layer import public contract', () => {
  it('exports the reviewed source, archive, XML, and metadata bounds', () => {
    expect(MAX_REFERENCE_IMPORT_SOURCE_BYTES).toBe(MAX_GEOJSON_OVERLAY_BYTES);
    expect(MAX_REFERENCE_ARCHIVE_ENTRIES).toBe(64);
    expect(MAX_REFERENCE_ARCHIVE_ENTRY_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_REFERENCE_XML_MARKUP_TOKENS).toBe(200_000);
    expect(MAX_REFERENCE_XML_ELEMENTS).toBe(100_000);
    expect(MAX_REFERENCE_XML_DEPTH).toBe(64);
    expect(MAX_REFERENCE_TEXT_METADATA_BYTES).toBe(64 * 1024);
  });

  it('exports the exact picker contract reviewed for Child A', () => {
    expect(SUPPORTED_REFERENCE_IMPORT_EXTENSIONS).toEqual([
      '.geojson',
      '.json',
      '.kml',
      '.kmz',
      '.zip',
      '.gpx',
    ]);
    expect(REFERENCE_IMPORT_ACCEPT).toBe(
      '.geojson,.json,.kml,.kmz,.zip,.gpx,application/geo+json,application/json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/gpx+xml,application/zip',
    );
  });

  it.each([
    ['territory.geojson', 'geojson'],
    ['territory.JSON', 'geojson'],
    ['territory.KmL', 'kml'],
    ['territory.kmz', 'kmz'],
    ['territory.ZIP', 'shapefile-zip'],
    ['territory.GPX', 'gpx'],
  ] as const)('detects %s by its final extension', (name, expected) => {
    expect(detectReferenceImportFormat(namedFile(name))).toBe(expected);
  });

  it('does not allow MIME type to override an unsupported filename extension', () => {
    expect(() =>
      detectReferenceImportFormat(
        namedFile('territory.txt', 'application/geo+json'),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ReferenceLayerImportError>>({
        code: 'unsupported-format',
        fileName: 'territory.txt',
      }),
    );
  });

  it('does not cross-sniff a mismatched supported container extension', () => {
    expect(
      detectReferenceImportFormat(
        namedFile('territory.zip', 'application/vnd.google-earth.kmz'),
      ),
    ).toBe('shapefile-zip');
    expect(
      detectReferenceImportFormat(
        namedFile('territory.kmz', 'application/zip'),
      ),
    ).toBe('kmz');
  });
});

describe('GeoJSON reference import batch', () => {
  const context = { minZoom: 0, maxZoom: 22 } as const;

  function geoJsonFile(name: string, contents: unknown): File {
    return new File([JSON.stringify(contents)], name, {
      type: 'application/geo+json',
    });
  }

  it('converts direct GeoJSON files in selection order and strips the extension from layer names', async () => {
    const result = await prepareReferenceImportBatch(
      [
        geoJsonFile(' First territory.GEOJSON', {
          type: 'Point',
          coordinates: [-48.5, -1.45],
        }),
        geoJsonFile('second.json', {
          type: 'LineString',
          coordinates: [
            [-48.5, -1.45],
            [-48.4, -1.4],
          ],
        }),
      ],
      context,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layers).toHaveLength(2);
    expect(result.layers.map((layer) => layer.name)).toEqual([
      'First territory',
      'second',
    ]);
    expect(result.layers.map((layer) => layer.source.type)).toEqual([
      'geojson',
      'geojson',
    ]);
  });

  it('maps direct GeoJSON parser failures into structured conversion errors with the original index', async () => {
    const result = await prepareReferenceImportBatch(
      [
        geoJsonFile('valid.geojson', {
          type: 'Point',
          coordinates: [-48.5, -1.45],
        }),
        new File(['not json'], 'broken.geojson', {
          type: 'application/geo+json',
        }),
      ],
      context,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          index: 1,
          fileName: 'broken.geojson',
          format: 'geojson',
          kind: 'conversion',
          error: expect.objectContaining({
            code: 'invalid-geojson',
            fileName: 'broken.geojson',
            format: 'geojson',
          }),
        }),
      ],
    });
  });

  it('rejects a source above the 5 MiB cap before parsing and returns no partial layers', async () => {
    const oversized = new File(
      [new Uint8Array(MAX_REFERENCE_IMPORT_SOURCE_BYTES + 1)],
      'oversized.geojson',
      { type: 'application/geo+json' },
    );
    const result = await prepareReferenceImportBatch(
      [
        geoJsonFile('valid.geojson', {
          type: 'Point',
          coordinates: [-48.5, -1.45],
        }),
        oversized,
      ],
      context,
    );

    expect(result).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({
          index: 1,
          kind: 'conversion',
          error: expect.objectContaining({ code: 'source-too-large' }),
        }),
      ],
    });
  });

  it('accepts a valid direct GeoJSON source exactly at the 5 MiB boundary', async () => {
    const json = JSON.stringify({
      type: 'Point',
      coordinates: [-48.5, -1.45],
    });
    const paddingBytes =
      MAX_REFERENCE_IMPORT_SOURCE_BYTES -
      new TextEncoder().encode(json).byteLength;
    const file = new File(
      [json, ' '.repeat(paddingBytes)],
      'boundary.geojson',
      {
        type: 'application/geo+json',
      },
    );

    expect(file.size).toBe(MAX_REFERENCE_IMPORT_SOURCE_BYTES);
    const result = await prepareReferenceImportBatch([file], context);
    expect(result.ok).toBe(true);
  });

  it('surfaces #279 per-layer canonical failures without reimplementing its JSON limits', async () => {
    const file = geoJsonFile('large-property.geojson', {
      type: 'Feature',
      properties: { note: 'x'.repeat(MAX_AUTHORED_JSON_STRING_BYTES + 1) },
      geometry: { type: 'Point', coordinates: [-48.5, -1.45] },
    });

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      index: 0,
      kind: 'canonical',
    });
  });

  it('maps final canonical batch errors back to original sparse selection indexes', async () => {
    const files: File[] = [];
    files.length = MAX_AUTHORED_LAYERS + 2;
    for (let index = 1; index < files.length; index += 1) {
      files[index] = geoJsonFile(`layer-${index}.geojson`, {
        type: 'Point',
        coordinates: [-48.5, -1.45],
      });
    }

    const result = await prepareReferenceImportBatch(files, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      index: MAX_AUTHORED_LAYERS + 1,
      fileName: `layer-${MAX_AUTHORED_LAYERS + 1}.geojson`,
      kind: 'canonical',
    });
  });

  it('checks cancellation between sequential top-level files before reading the next one', async () => {
    const controller = new AbortController();
    const selected = [
      geoJsonFile('first.geojson', {
        type: 'Point',
        coordinates: [-48.5, -1.45],
      }),
      geoJsonFile('second.geojson', {
        type: 'Point',
        coordinates: [-48.4, -1.4],
      }),
    ];
    let lengthReads = 0;
    const files = new Proxy(selected, {
      get(target, property, receiver) {
        if (property === 'length') {
          lengthReads += 1;
          if (lengthReads === 2) controller.abort();
        }
        return Reflect.get(target, property, receiver);
      },
    });

    await expect(
      prepareReferenceImportBatch(files, context, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws an AbortError when cancellation is already requested', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      prepareReferenceImportBatch(
        [
          geoJsonFile('territory.geojson', {
            type: 'Point',
            coordinates: [-48.5, -1.45],
          }),
        ],
        context,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('XML reference imports', () => {
  const context = { minZoom: 0, maxZoom: 22 } as const;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('converts a local KML placemark and preserves ordinary properties', async () => {
    const file = new File(
      [
        `<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
          <name>Village</name><ExtendedData><Data name="kind"><value>community</value></Data></ExtendedData>
          <Point><coordinates>-48.5,-1.45,0</coordinates></Point>
        </Placemark></Document></kml>`,
      ],
      'places.kml',
      { type: 'application/vnd.google-earth.kml+xml' },
    );

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layers[0]?.name).toBe('places');
    expect(result.layers[0]?.source).toMatchObject({
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          expect.objectContaining({
            geometry: { type: 'Point', coordinates: [-48.5, -1.45, 0] },
            properties: expect.objectContaining({
              name: 'Village',
              kind: 'community',
            }),
          }),
        ],
      },
    });
  });

  it('converts GPX waypoints through the same canonical authored-layer boundary', async () => {
    const file = new File(
      [
        `<?xml version="1.0" encoding="UTF-8"?>
        <gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
          <wpt lat="-1.45" lon="-48.5"><name>Camp</name><type>base</type></wpt>
        </gpx>`,
      ],
      'field.GPX',
      { type: 'application/gpx+xml' },
    );

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.layers[0]?.name).toBe('field');
    expect(result.layers[0]?.source.type).toBe('geojson');
    if (result.layers[0]?.source.type !== 'geojson') return;
    expect(result.layers[0].source.data.features[0]).toMatchObject({
      geometry: { type: 'Point', coordinates: [-48.5, -1.45] },
      properties: expect.objectContaining({ name: 'Camp', type: 'base' }),
    });
  });

  it.each([
    ['doctype', '<!DOCTYPE kml><kml xmlns="http://www.opengis.net/kml/2.2" />'],
    ['entity', '<!ENTITY x "y"><kml xmlns="http://www.opengis.net/kml/2.2" />'],
  ])(
    'rejects forbidden XML %s declarations before conversion',
    async (_label, xml) => {
      const result = await prepareReferenceImportBatch(
        [new File([xml], 'unsafe.kml')],
        context,
      );

      expect(result).toEqual({
        ok: false,
        errors: [
          expect.objectContaining({
            index: 0,
            format: 'kml',
            kind: 'conversion',
            error: expect.objectContaining({ code: 'xml-forbidden-doctype' }),
          }),
        ],
      });
    },
  );

  it('rejects malformed XML and a format-mismatched document root', async () => {
    const malformed = await prepareReferenceImportBatch(
      [new File(['<kml><Placemark></kml>'], 'broken.kml')],
      context,
    );
    const wrongRoot = await prepareReferenceImportBatch(
      [new File(['<gpx version="1.1" />'], 'wrong.kml')],
      context,
    );

    for (const result of [malformed, wrongRoot]) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0]).toMatchObject({
        kind: 'conversion',
        error: { code: 'xml-invalid' },
      });
    }
  });

  it('rejects invalid UTF-8 and explicit non-UTF-8 declarations', async () => {
    const invalidUtf8 = await prepareReferenceImportBatch(
      [new File([new Uint8Array([195, 40])], 'invalid.kml')],
      context,
    );
    const nonUtf8Declaration = await prepareReferenceImportBatch(
      [
        new File(
          ['<?xml version="1.0" encoding="ISO-8859-1"?><kml/>'],
          'latin1.kml',
        ),
      ],
      context,
    );

    for (const result of [invalidUtf8, nonUtf8Declaration]) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0]).toMatchObject({
        kind: 'conversion',
        error: { code: 'xml-invalid' },
      });
    }
  });

  it('rejects XML beyond the markup-token and nesting-depth limits before conversion', async () => {
    const tooManyTokens =
      '<kml>' + '<'.repeat(MAX_REFERENCE_XML_MARKUP_TOKENS) + '</kml>';
    const deep =
      '<kml>' +
      '<Folder>'.repeat(MAX_REFERENCE_XML_DEPTH) +
      '</Folder>'.repeat(MAX_REFERENCE_XML_DEPTH) +
      '</kml>';

    const tokenResult = await prepareReferenceImportBatch(
      [new File([tooManyTokens], 'tokens.kml')],
      context,
    );
    const depthResult = await prepareReferenceImportBatch(
      [new File([deep], 'deep.kml')],
      context,
    );

    for (const result of [tokenResult, depthResult]) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0]).toMatchObject({
        kind: 'conversion',
        error: { code: 'xml-too-complex' },
      });
    }
  });

  it('rejects a parsed document beyond the element-count limit before converter work', async () => {
    const leaf = {
      localName: 'Folder',
      children: { length: 0, item: () => null },
    } as unknown as Element;
    const children = {
      length: MAX_REFERENCE_XML_ELEMENTS,
      item: (index: number) =>
        index < MAX_REFERENCE_XML_ELEMENTS ? leaf : null,
    };
    const root = { localName: 'kml', children } as unknown as Element;
    vi.spyOn(DOMParser.prototype, 'parseFromString').mockReturnValue({
      documentElement: root,
      getElementsByTagName: () => [] as unknown as HTMLCollectionOf<Element>,
    } as unknown as Document);

    const result = await prepareReferenceImportBatch(
      [new File(['<kml/>'], 'elements.kml')],
      context,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      kind: 'conversion',
      error: { code: 'xml-too-complex' },
    });
  });

  it('normalizes mixed KML geometry while dropping GroundOverlay and NetworkLink features', async () => {
    const file = new File(
      [
        `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
          <Placemark><name>Point</name><Point><coordinates>-48.5,-1.45</coordinates></Point></Placemark>
          <Placemark><name>Line</name><LineString><coordinates>-48.5,-1.45 -48.4,-1.4</coordinates></LineString></Placemark>
          <Placemark><name>Polygon</name><Polygon><outerBoundaryIs><LinearRing><coordinates>-48.5,-1.45 -48.4,-1.45 -48.4,-1.35 -48.5,-1.45</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
          <Placemark><name>Mixed</name><MultiGeometry><Point><coordinates>-48.3,-1.3</coordinates></Point><LineString><coordinates>-48.3,-1.3 -48.2,-1.2</coordinates></LineString></MultiGeometry></Placemark>
          <Placemark><name>Null geometry</name></Placemark>
          <GroundOverlay><name>Image</name><Icon><href>https://example.invalid/overlay.png</href></Icon><LatLonBox><north>-1</north><south>-2</south><east>-48</east><west>-49</west></LatLonBox></GroundOverlay>
          <NetworkLink><name>Remote</name><Link><href>https://example.invalid/network.kml</href></Link></NetworkLink>
        </Document></kml>`,
      ],
      'mixed.kml',
    );

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
    const features = result.layers[0].source.data.features;
    const names = features.map((feature) => feature.properties?.name);
    expect(features.map((feature) => feature.geometry.type)).toEqual(
      expect.arrayContaining(['Point', 'LineString', 'Polygon']),
    );
    expect(names.filter((name) => name === 'Mixed')).toHaveLength(2);
    expect(names).not.toContain('Null geometry');
    expect(names).not.toContain('Image');
    expect(names).not.toContain('Remote');
  });

  it('returns no-supported-geometry when KML contains only dropped external-resource constructs', async () => {
    const file = new File(
      [
        `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
          <GroundOverlay><Icon><href>https://example.invalid/overlay.png</href></Icon><LatLonBox><north>-1</north><south>-2</south><east>-48</east><west>-49</west></LatLonBox></GroundOverlay>
          <NetworkLink><Link><href>https://example.invalid/network.kml</href></Link></NetworkLink>
        </Document></kml>`,
      ],
      'external-only.kml',
    );

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      kind: 'conversion',
      error: { code: 'no-supported-geometry' },
    });
  });

  it('converts GPX waypoint, route, and track features with ordinary metadata', async () => {
    const file = new File(
      [
        `<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
          <wpt lat="-1.45" lon="-48.5"><name>Camp</name><type>base</type></wpt>
          <rte><name>Patrol route</name><rtept lat="-1.45" lon="-48.5"/><rtept lat="-1.4" lon="-48.4"/></rte>
          <trk><name>Patrol track</name><trkseg><trkpt lat="-1.45" lon="-48.5"/><trkpt lat="-1.35" lon="-48.35"/></trkseg></trk>
        </gpx>`,
      ],
      'patrol.gpx',
    );

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
    const features = result.layers[0].source.data.features;
    expect(features.map((feature) => feature.properties?.name)).toEqual(
      expect.arrayContaining(['Camp', 'Patrol route', 'Patrol track']),
    );
    expect(features.map((feature) => feature.geometry.type)).toEqual(
      expect.arrayContaining(['Point', 'LineString']),
    );
  });

  it('never uses browser network primitives for malicious local KML and GPX resource references', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network use is forbidden'));
    const xhrOpenSpy = vi
      .spyOn(XMLHttpRequest.prototype, 'open')
      .mockImplementation(() => undefined);
    const xhrSendSpy = vi
      .spyOn(XMLHttpRequest.prototype, 'send')
      .mockImplementation(() => undefined);
    const xhrConstructorSpy = vi.fn();
    const guardedXhr = new Proxy(XMLHttpRequest, {
      construct(target, args, newTarget) {
        xhrConstructorSpy();
        return Reflect.construct(target, args, newTarget);
      },
    });
    vi.stubGlobal('XMLHttpRequest', guardedXhr);
    const imageConstructorSpy = vi.fn();
    const guardedImage = new Proxy(Image, {
      construct(target, args, newTarget) {
        imageConstructorSpy();
        return Reflect.construct(target, args, newTarget);
      },
    });
    vi.stubGlobal('Image', guardedImage);

    const kmlResult = await prepareReferenceImportBatch(
      [
        new File(
          [
            `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
              <Placemark><Style><IconStyle><Icon><href>https://example.invalid/icon.png</href></Icon></IconStyle></Style><Point><coordinates>-48.5,-1.45</coordinates></Point></Placemark>
              <NetworkLink><Link><href>https://example.invalid/network.kml</href></Link></NetworkLink>
            </Document></kml>`,
          ],
          'network.kml',
        ),
      ],
      context,
    );
    const gpxResult = await prepareReferenceImportBatch(
      [
        new File(
          [
            `<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="-1.45" lon="-48.5"><link href="https://example.invalid/photo.jpg"/></wpt></gpx>`,
          ],
          'network.gpx',
        ),
      ],
      context,
    );

    expect(kmlResult.ok).toBe(true);
    expect(gpxResult.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrConstructorSpy).not.toHaveBeenCalled();
    expect(xhrOpenSpy).not.toHaveBeenCalled();
    expect(xhrSendSpy).not.toHaveBeenCalled();
    expect(imageConstructorSpy).not.toHaveBeenCalled();
  });

  it('stops at retained feature 50,001 before a converter can materialize a larger collection', async () => {
    vi.doMock('@tmcw/togeojson', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@tmcw/togeojson')>();
      return {
        ...actual,
        gpxGen: function* () {
          for (let index = 0; index <= 50_000; index += 1) {
            yield {
              type: 'Feature' as const,
              properties: { index },
              geometry: { type: 'Point' as const, coordinates: [0, 0] },
            };
          }
        },
      };
    });

    try {
      const result = await prepareReferenceImportBatch(
        [new File(['<gpx version="1.1" creator="test"/>'], 'too-many.gpx')],
        context,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]).toMatchObject({
        kind: 'conversion',
        error: { code: 'too-many-features' },
      });
    } finally {
      vi.doUnmock('@tmcw/togeojson');
    }
  });

  it('rechecks caller cancellation immediately after synchronous DOM parsing', async () => {
    const controller = new AbortController();
    const originalParse = DOMParser.prototype.parseFromString;
    vi.spyOn(DOMParser.prototype, 'parseFromString').mockImplementation(
      function (this: DOMParser, input, type) {
        const document = originalParse.call(this, input, type);
        controller.abort();
        return document;
      },
    );

    await expect(
      prepareReferenceImportBatch(
        [
          new File(
            [
              '<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><Point><coordinates>-48.5,-1.45</coordinates></Point></Placemark></kml>',
            ],
            'cancel.kml',
          ),
        ],
        context,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('KMZ reference imports', () => {
  const context = { minZoom: 0, maxZoom: 22 } as const;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const kmlPoint = (name: string, lon: number) =>
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${name}</name><Point><coordinates>${lon},-1.45</coordinates></Point></Placemark></Document></kml>`;

  async function makeKmz(
    entries: ReadonlyArray<readonly [string, string]>,
    name = 'archive.kmz',
  ): Promise<File> {
    return makeArchiveFile(entries, {
      name,
      type: 'application/vnd.google-earth.kmz',
    });
  }

  function kmzFromBytes(bytes: Uint8Array, name = 'archive.kmz'): File {
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    return new File([body], name, {
      type: 'application/vnd.google-earth.kmz',
    });
  }

  it('prefers a unique root doc.kml over other KML entries', async () => {
    const file = await makeKmz([
      ['nested/other.kml', kmlPoint('Other', -47)],
      ['doc.kml', kmlPoint('Chosen', -48.5)],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
    expect(result.layers[0].name).toBe('archive');
    expect(result.layers[0].source.data.features[0]).toMatchObject({
      properties: expect.objectContaining({ name: 'Chosen' }),
      geometry: { type: 'Point', coordinates: [-48.5, -1.45] },
    });
  });

  it('uses the only nested KML when no root doc.kml exists', async () => {
    const file = await makeKmz([
      ['nested/map.KML', kmlPoint('Nested', -48.25)],
      ['icons/readme.txt', 'ignored'],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
    expect(result.layers[0].source.data.features[0]?.properties).toMatchObject({
      name: 'Nested',
    });
  });

  it.each([
    ['no KML', [['readme.txt', 'none']] as const, 'kmz-no-kml'],
    [
      'ambiguous KML',
      [
        ['a.kml', kmlPoint('A', -48)],
        ['b.kml', kmlPoint('B', -49)],
      ] as const,
      'kmz-ambiguous-kml',
    ],
  ])('rejects %s archives deterministically', async (_label, entries, code) => {
    const file = await makeKmz(entries);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      format: 'kmz',
      kind: 'conversion',
      error: { code, format: 'kmz' },
    });
  });

  it('rejects nested archives before reading a KML body', async () => {
    const file = await makeKmz([
      ['doc.kml', kmlPoint('Chosen', -48.5)],
      ['nested.zip', 'not really a zip'],
    ]);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      format: 'kmz',
      error: { code: 'archive-nested' },
    });
  });

  it('enforces the 64-entry metadata limit before conversion', async () => {
    const entries: Array<readonly [string, string]> = [
      ['doc.kml', kmlPoint('Chosen', -48.5)],
    ];
    for (let index = 0; index < 64; index += 1) {
      entries.push([`resources/${index}.txt`, 'x']);
    }
    const file = await makeKmz(entries);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      error: { code: 'archive-too-many-entries' },
    });
  });

  it('accepts exactly 64 archive entries', async () => {
    const entries: Array<readonly [string, string]> = [
      ['doc.kml', kmlPoint('Chosen', -48.5)],
    ];
    for (let index = 0; index < 63; index += 1) {
      entries.push([`resource-${index}.txt`, 'x']);
    }

    const result = await prepareReferenceImportBatch(
      [await makeKmz(entries)],
      context,
    );

    expect(result.ok).toBe(true);
  });

  it('enforces declared per-entry and aggregate uncompressed bounds at their exact byte boundaries', async () => {
    const doc = kmlPoint('Chosen', -48.5);
    const docBytes = new TextEncoder().encode(doc).byteLength;
    const base = await makeArchiveBytes([
      ['doc.kml', doc],
      ['a.txt', 'a'],
      ['b.txt', 'b'],
    ]);

    const entryExact = patchZipEntryUncompressedSize(
      base,
      'a.txt',
      MAX_REFERENCE_ARCHIVE_ENTRY_BYTES,
    );
    const entryExactResult = await prepareReferenceImportBatch(
      [kmzFromBytes(entryExact)],
      context,
    );
    expect(entryExactResult.ok).toBe(true);

    const entryTooLarge = patchZipEntryUncompressedSize(
      base,
      'a.txt',
      MAX_REFERENCE_ARCHIVE_ENTRY_BYTES + 1,
    );
    const entryTooLargeResult = await prepareReferenceImportBatch(
      [kmzFromBytes(entryTooLarge)],
      context,
    );
    expect(entryTooLargeResult).toMatchObject({
      ok: false,
      errors: [{ error: { code: 'archive-entry-too-large' } }],
    });

    let aggregateExact = patchZipEntryUncompressedSize(
      base,
      'a.txt',
      MAX_REFERENCE_ARCHIVE_ENTRY_BYTES,
    );
    aggregateExact = patchZipEntryUncompressedSize(
      aggregateExact,
      'b.txt',
      MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES -
        MAX_REFERENCE_ARCHIVE_ENTRY_BYTES -
        docBytes,
    );
    const aggregateExactResult = await prepareReferenceImportBatch(
      [kmzFromBytes(aggregateExact)],
      context,
    );
    expect(aggregateExactResult.ok).toBe(true);

    const aggregateTooLarge = patchZipEntryUncompressedSize(
      aggregateExact,
      'b.txt',
      MAX_REFERENCE_ARCHIVE_UNCOMPRESSED_BYTES -
        MAX_REFERENCE_ARCHIVE_ENTRY_BYTES -
        docBytes +
        1,
    );
    const aggregateTooLargeResult = await prepareReferenceImportBatch(
      [kmzFromBytes(aggregateTooLarge)],
      context,
    );
    expect(aggregateTooLargeResult).toMatchObject({
      ok: false,
      errors: [{ error: { code: 'archive-uncompressed-too-large' } }],
    });
  });

  it.each([
    [
      'encrypted entries',
      async () =>
        patchZipEntryFlags(
          await makeArchiveBytes([['doc.kml', kmlPoint('Chosen', -48.5)]]),
          'doc.kml',
          0x1,
        ),
      'archive-unsupported',
    ],
    [
      'unsupported compression',
      async () =>
        patchZipEntryCompression(
          await makeArchiveBytes([['doc.kml', kmlPoint('Chosen', -48.5)]]),
          'doc.kml',
          12,
        ),
      'archive-unsupported',
    ],
    [
      'ZIP64 containers',
      async () =>
        promoteZipToZip64(
          await makeArchiveBytes([['doc.kml', kmlPoint('Chosen', -48.5)]]),
        ),
      'archive-unsupported',
    ],
  ] as const)(
    'rejects %s before materializing an entry body',
    async (_label, build, code) => {
      const result = await prepareReferenceImportBatch(
        [kmzFromBytes(await build())],
        context,
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]).toMatchObject({
        kind: 'conversion',
        error: { code },
      });
    },
  );

  it('rejects unsafe archive names through the ZIP reader safe-filename boundary', async () => {
    const safe = await makeArchiveBytes([
      ['aa/doc.kml', kmlPoint('Chosen', -48.5)],
    ]);
    const unsafe = patchZipEntryNameSameLength(
      safe,
      'aa/doc.kml',
      '../doc.kml',
    );
    const result = await prepareReferenceImportBatch(
      [kmzFromBytes(unsafe)],
      context,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      error: { code: 'archive-invalid' },
    });
  });

  it('maps corrupt streamed bodies and malformed ZIPs to archive-invalid', async () => {
    const valid = await makeArchiveBytes(
      [['doc.kml', kmlPoint('Chosen', -48.5)]],
      'STORE',
    );
    const corrupt = corruptZipEntryBody(valid, 'doc.kml');
    const corruptResult = await prepareReferenceImportBatch(
      [kmzFromBytes(corrupt)],
      context,
    );
    const malformedResult = await prepareReferenceImportBatch(
      [kmzFromBytes(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))],
      context,
    );

    for (const result of [corruptResult, malformedResult]) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0]).toMatchObject({
        error: { code: 'archive-invalid' },
      });
    }
  });

  it('fails closed when streamed output disagrees with declared entry size', async () => {
    const bytes = await makeArchiveBytes([
      ['doc.kml', kmlPoint('Chosen', -48.5)],
    ]);
    const lyingMetadata = patchZipEntryUncompressedSize(bytes, 'doc.kml', 1);
    const result = await prepareReferenceImportBatch(
      [kmzFromBytes(lyingMetadata)],
      context,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      error: { code: 'archive-invalid' },
    });
  });

  it('cancels and releases the entry reader when the caller aborts during streamed body reading', async () => {
    const controller = new AbortController();
    const originalGetReader = ReadableStream.prototype.getReader;
    const cancelSpy = vi.fn();
    let wrappedReader = false;

    vi.spyOn(ReadableStream.prototype, 'getReader').mockImplementation(
      function (this: ReadableStream<Uint8Array>) {
        const reader = originalGetReader.call(
          this,
        ) as ReadableStreamDefaultReader<Uint8Array>;
        if (wrappedReader) return reader;
        wrappedReader = true;
        const originalRead = reader.read.bind(reader);
        const originalCancel = reader.cancel.bind(reader);
        return {
          get closed() {
            return reader.closed;
          },
          read: async () => {
            const result = await originalRead();
            controller.abort();
            return result;
          },
          cancel: async (reason?: unknown) => {
            cancelSpy(reason);
            return originalCancel(reason);
          },
          releaseLock: reader.releaseLock.bind(reader),
        } as ReadableStreamDefaultReader<Uint8Array>;
      } as typeof ReadableStream.prototype.getReader,
    );

    await expect(
      prepareReferenceImportBatch(
        [await makeKmz([['doc.kml', kmlPoint('Chosen', -48.5)]])],
        context,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('never dereferences external KML resources embedded in KMZ', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network use is forbidden'));
    const xhrOpenSpy = vi
      .spyOn(XMLHttpRequest.prototype, 'open')
      .mockImplementation(() => undefined);
    const xhrSendSpy = vi
      .spyOn(XMLHttpRequest.prototype, 'send')
      .mockImplementation(() => undefined);
    const imageConstructorSpy = vi.fn();
    const guardedImage = new Proxy(Image, {
      construct(target, args, newTarget) {
        imageConstructorSpy();
        return Reflect.construct(target, args, newTarget);
      },
    });
    vi.stubGlobal('Image', guardedImage);

    const file = await makeKmz([
      [
        'doc.kml',
        `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
          <Placemark><Style><IconStyle><Icon><href>https://example.invalid/icon.png</href></Icon></IconStyle></Style><Point><coordinates>-48.5,-1.45</coordinates></Point></Placemark>
          <NetworkLink><Link><href>https://example.invalid/network.kml</href></Link></NetworkLink>
        </Document></kml>`,
      ],
    ]);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpenSpy).not.toHaveBeenCalled();
    expect(xhrSendSpy).not.toHaveBeenCalled();
    expect(imageConstructorSpy).not.toHaveBeenCalled();
  });

  it('preserves kmz as the public format when the selected KML body is invalid', async () => {
    const file = await makeKmz([['doc.kml', '<kml><Placemark></kml>']]);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      format: 'kmz',
      error: { code: 'xml-invalid', format: 'kmz' },
    });
  });
});

describe('zipped Shapefile reference imports', () => {
  const context = { minZoom: 0, maxZoom: 22 } as const;
  const WGS84_PRJ = FIXTURE_WGS84_PRJ;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const pointShp = fixturePointShp;
  const oneRecordDbf = fixtureOneRecordDbf;

  async function shapefileZip(
    entries: ReadonlyArray<readonly [string, string | Uint8Array]>,
  ): Promise<File> {
    return makeArchiveFile(entries, {
      name: 'reference.zip',
      type: 'application/zip',
    });
  }

  it('converts a nested case-insensitive WGS84 Shapefile dataset and uses the dataset stem as its layer name', async () => {
    const file = await shapefileZip([
      ['nested/Territory.SHP', pointShp(-48.5, -1.45)],
      ['nested/Territory.DBF', oneRecordDbf()],
      ['nested/Territory.PRJ', WGS84_PRJ],
      ['nested/Territory.CPG', 'UTF-8'],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
    expect(result.layers[0].name).toBe('Territory');
    expect(result.layers[0].source.data.features).toEqual([
      expect.objectContaining({
        geometry: { type: 'Point', coordinates: [-48.5, -1.45] },
        properties: expect.objectContaining({ name: 'community' }),
      }),
    ]);
  });

  it('reports exactly which required Shapefile sidecars are missing', async () => {
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
    ]);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      format: 'shapefile-zip',
      kind: 'conversion',
      error: {
        code: 'shapefile-missing-components',
        missingComponents: ['dbf', 'prj'],
      },
    });
  });

  it('rejects archives with more than one Shapefile dataset', async () => {
    const file = await shapefileZip([
      ['a.shp', pointShp(-48.5, -1.45)],
      ['a.dbf', oneRecordDbf('a')],
      ['a.prj', WGS84_PRJ],
      ['b.shp', pointShp(-48.4, -1.4)],
      ['b.dbf', oneRecordDbf('b')],
      ['b.prj', WGS84_PRJ],
    ]);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      error: { code: 'shapefile-ambiguous-dataset' },
    });
  });

  it('rejects duplicate case-insensitive sidecars for the selected dataset', async () => {
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.dbf', oneRecordDbf()],
      ['territory.DBF', oneRecordDbf('duplicate')],
      ['territory.prj', WGS84_PRJ],
    ]);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      error: { code: 'shapefile-ambiguous-dataset' },
    });
  });

  it('fails closed on an unknown or malformed CRS instead of assuming WGS84', async () => {
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.dbf', oneRecordDbf()],
      ['territory.prj', 'NOT_A_REAL_CRS'],
    ]);
    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      error: { code: 'shapefile-unsupported-crs' },
    });
  });

  it('accepts .shx as optional inert metadata and decodes DBF text through the selected CPG', async () => {
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.shx', new Uint8Array([1, 2, 3])],
      ['territory.dbf', oneCp1252Dbf()],
      ['territory.prj', WGS84_PRJ],
      ['territory.cpg', 'windows-1252'],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
    expect(result.layers[0].source.data.features[0]?.properties).toMatchObject({
      name: 'Café',
    });
  });

  it('coerces DBF date fields to canonical YYYY-MM-DD strings without timezone drift', async () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
    try {
      const file = await shapefileZip([
        ['territory.shp', pointShp(-48.5, -1.45)],
        ['territory.dbf', oneDateDbf()],
        ['territory.prj', WGS84_PRJ],
      ]);

      const result = await prepareReferenceImportBatch([file], context);

      expect(result.ok).toBe(true);
      if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
      expect(
        result.layers[0].source.data.features[0]?.properties,
      ).toMatchObject({
        surveyed: '2026-09-06',
      });
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });

  it('preserves blank DBF date fields as null instead of throwing outside the structured boundary', async () => {
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.dbf', oneDateDbf('')],
      ['territory.prj', WGS84_PRJ],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(true);
    if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
    expect(result.layers[0].source.data.features[0]?.properties).toMatchObject({
      surveyed: null,
    });
  });

  it('rejects a DBF declaring more than 50,000 records before Shapefile conversion', async () => {
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.dbf', dbfWithDeclaredRecordCount(50_001)],
      ['territory.prj', WGS84_PRJ],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      kind: 'conversion',
      error: { code: 'too-many-features' },
    });
  });

  it('rejects PRJ/CPG metadata above the 64 KiB text bound before reading converter inputs', async () => {
    const oversizedCpg = new Uint8Array(MAX_REFERENCE_TEXT_METADATA_BYTES + 1);
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.dbf', oneRecordDbf()],
      ['territory.prj', WGS84_PRJ],
      ['territory.cpg', oversizedCpg],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      kind: 'conversion',
      error: { code: 'archive-entry-too-large' },
    });
  });

  it.each([
    '+proj=longlat +datum=WGS84 +nadgrids=foo.gsb +no_defs',
    'PARAMETERFILE["Latitude and longitude difference file","foo.gsb"]',
    'NTv2 grid foo.gsb',
  ])('fails closed on grid-dependent CRS text: %s', async (prj) => {
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.dbf', oneRecordDbf()],
      ['territory.prj', prj],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({
      error: { code: 'shapefile-unsupported-crs' },
    });
  });

  it('surfaces non-finite DBF values through the canonical validation boundary', async () => {
    const file = await shapefileZip([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.dbf', oneNonFiniteNumberDbf()],
      ['territory.prj', WGS84_PRJ],
    ]);

    const result = await prepareReferenceImportBatch([file], context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.kind).toBe('canonical');
  });

  it('never uses browser network primitives while converting a local Shapefile archive', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network use is forbidden'));
    const xhrOpenSpy = vi
      .spyOn(XMLHttpRequest.prototype, 'open')
      .mockImplementation(() => undefined);
    const xhrSendSpy = vi
      .spyOn(XMLHttpRequest.prototype, 'send')
      .mockImplementation(() => undefined);
    const imageConstructorSpy = vi.fn();
    const guardedImage = new Proxy(Image, {
      construct(target, args, newTarget) {
        imageConstructorSpy();
        return Reflect.construct(target, args, newTarget);
      },
    });
    vi.stubGlobal('Image', guardedImage);

    const result = await prepareReferenceImportBatch(
      [
        await shapefileZip([
          ['territory.shp', pointShp(-48.5, -1.45)],
          ['territory.dbf', oneRecordDbf()],
          ['territory.prj', WGS84_PRJ],
        ]),
      ],
      context,
    );

    expect(result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpenSpy).not.toHaveBeenCalled();
    expect(xhrSendSpy).not.toHaveBeenCalled();
    expect(imageConstructorSpy).not.toHaveBeenCalled();
  });

  it('leaves non-Date class instances for canonical validation to reject', async () => {
    class UnsupportedDbfValue {
      readonly value = 'must-not-be-flattened';
    }

    vi.resetModules();
    vi.doMock('shpjs', () => ({
      default: vi.fn(async () => ({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { unsafe: new UnsupportedDbfValue() },
            geometry: { type: 'Point', coordinates: [-48.5, -1.45] },
          },
        ],
      })),
    }));

    try {
      const { prepareReferenceImportBatch: freshPrepare } =
        await import('@/lib/map/reference-layer-import');
      const file = await shapefileZip([
        ['territory.shp', pointShp(-48.5, -1.45)],
        ['territory.dbf', oneRecordDbf()],
        ['territory.prj', WGS84_PRJ],
      ]);

      const result = await freshPrepare([file], context);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]).toMatchObject({
        kind: 'canonical',
      });
    } finally {
      vi.doUnmock('shpjs');
      vi.resetModules();
    }
  });

  it('rechecks caller cancellation immediately after Shapefile conversion returns', async () => {
    const controller = new AbortController();
    vi.resetModules();
    vi.doMock('shpjs', async () => {
      const actual = (await vi.importActual('shpjs')) as unknown as {
        default: (input: unknown) => Promise<unknown>;
      };
      const actualDefault = actual.default;
      return {
        ...actual,
        default: async (input: unknown) => {
          const result = await actualDefault(input);
          controller.abort();
          return result;
        },
      };
    });

    try {
      const { prepareReferenceImportBatch: freshPrepare } =
        await import('@/lib/map/reference-layer-import');
      const file = await shapefileZip([
        ['territory.shp', pointShp(-48.5, -1.45)],
        ['territory.dbf', oneRecordDbf()],
        ['territory.prj', WGS84_PRJ],
      ]);

      await expect(
        freshPrepare([file], context, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      vi.doUnmock('shpjs');
      vi.resetModules();
    }
  });

  it.each([
    ['Web Mercator', -5191196.100565891, -2698731.8848331273, WEB_MERCATOR_PRJ],
    [
      'WGS84 / UTM zone 23S',
      333287.12361776334,
      7394586.094486862,
      WGS84_UTM_23S_PRJ,
    ],
    [
      'SIRGAS 2000 / UTM zone 23S',
      333287.1236173264,
      7394586.094565781,
      SIRGAS_2000_UTM_23S_PRJ,
    ],
  ])(
    'reprojects %s control coordinates to WGS84 within 1e-5 degrees',
    async (_label, x, y, prj) => {
      const expected = [-46.633308, -23.55052] as const;
      const file = await shapefileZip([
        ['control.shp', pointShp(x, y)],
        ['control.dbf', oneRecordDbf('control')],
        ['control.prj', prj],
      ]);

      const result = await prepareReferenceImportBatch([file], context);

      expect(result.ok).toBe(true);
      if (!result.ok || result.layers[0]?.source.type !== 'geojson') return;
      const geometry = result.layers[0].source.data.features[0]?.geometry;
      expect(geometry?.type).toBe('Point');
      if (geometry?.type !== 'Point') return;
      const longitude = geometry.coordinates[0];
      const latitude = geometry.coordinates[1];
      expect(longitude).toBeDefined();
      expect(latitude).toBeDefined();
      if (longitude === undefined || latitude === undefined) return;
      expect(Math.abs(longitude - expected[0])).toBeLessThanOrEqual(1e-5);
      expect(Math.abs(latitude - expected[1])).toBeLessThanOrEqual(1e-5);
    },
  );
});
