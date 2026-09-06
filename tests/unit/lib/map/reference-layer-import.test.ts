import { afterEach, describe, expect, it, vi } from 'vitest';

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
});

describe('KMZ reference imports', () => {
  const context = { minZoom: 0, maxZoom: 22 } as const;
  const kmlPoint = (name: string, lon: number) =>
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${name}</name><Point><coordinates>${lon},-1.45</coordinates></Point></Placemark></Document></kml>`;

  async function makeKmz(
    entries: ReadonlyArray<readonly [string, string]>,
    name = 'archive.kmz',
  ): Promise<File> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const [path, body] of entries) zip.file(path, body);
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
    });
    return new File([blob], name, { type: 'application/vnd.google-earth.kmz' });
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
  const WGS84_PRJ =
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

  function pointShp(x: number, y: number): Uint8Array {
    const bytes = new Uint8Array(128);
    const view = new DataView(bytes.buffer);
    view.setInt32(0, 9994, false);
    view.setInt32(24, 64, false);
    view.setInt32(28, 1000, true);
    view.setInt32(32, 1, true);
    view.setFloat64(36, x, true);
    view.setFloat64(44, y, true);
    view.setFloat64(52, x, true);
    view.setFloat64(60, y, true);
    view.setInt32(100, 1, false);
    view.setInt32(104, 10, false);
    view.setInt32(108, 1, true);
    view.setFloat64(112, x, true);
    view.setFloat64(120, y, true);
    return bytes;
  }

  function oneRecordDbf(value = 'community'): Uint8Array {
    const fieldLength = 20;
    const headerLength = 65;
    const recordLength = 1 + fieldLength;
    const bytes = new Uint8Array(headerLength + recordLength + 1);
    const view = new DataView(bytes.buffer);
    bytes[0] = 0x03;
    bytes[1] = 126;
    bytes[2] = 9;
    bytes[3] = 4;
    view.setUint32(4, 1, true);
    view.setUint16(8, headerLength, true);
    view.setUint16(10, recordLength, true);
    new TextEncoder().encodeInto('name', bytes.subarray(32, 43));
    bytes[43] = 'C'.charCodeAt(0);
    bytes[48] = fieldLength;
    bytes[64] = 0x0d;
    bytes[65] = 0x20;
    const encoded = new TextEncoder().encode(value);
    bytes.fill(0x20, 66, 66 + fieldLength);
    bytes.set(encoded.subarray(0, fieldLength), 66);
    bytes[bytes.length - 1] = 0x1a;
    return bytes;
  }

  async function shapefileZip(
    entries: ReadonlyArray<readonly [string, string | Uint8Array]>,
  ): Promise<File> {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const [name, body] of entries) zip.file(name, body);
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
    });
    return new File([blob], 'reference.zip', { type: 'application/zip' });
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

  it.each([
    [
      'Web Mercator',
      -5191196.100565891,
      -2698731.8848331273,
      'PROJCS["WGS_1984_Web_Mercator_Auxiliary_Sphere",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]],PROJECTION["Mercator_Auxiliary_Sphere"],PARAMETER["False_Easting",0],PARAMETER["False_Northing",0],PARAMETER["Central_Meridian",0],PARAMETER["Standard_Parallel_1",0],PARAMETER["Auxiliary_Sphere_Type",0],UNIT["Meter",1]]',
    ],
    [
      'WGS84 / UTM zone 23S',
      333287.12361776334,
      7394586.094486862,
      'PROJCS["WGS 84 / UTM zone 23S",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-45],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1]]',
    ],
    [
      'SIRGAS 2000 / UTM zone 23S',
      333287.1236173264,
      7394586.094565781,
      'PROJCS["SIRGAS 2000 / UTM zone 23S",GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-45],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1]]',
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
      expect(
        Math.abs(geometry.coordinates[0] - expected[0]),
      ).toBeLessThanOrEqual(1e-5);
      expect(
        Math.abs(geometry.coordinates[1] - expected[1]),
      ).toBeLessThanOrEqual(1e-5);
    },
  );
});
