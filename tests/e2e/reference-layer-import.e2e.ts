import { expect, test } from '@playwright/test';

import {
  WGS84_PRJ,
  makeArchiveBytes,
  oneRecordDbf,
  pointShp,
} from '../fixtures/reference-import/generated';

test.describe('GIS reference import browser primitives', () => {
  test('converts all Child A formats through native browser APIs', async ({
    page,
  }) => {
    test.skip(
      Boolean(process.env.BASE_URL || process.env.VITE_PREVIEW),
      'Requires the Vite dev server so the browser can import the source module directly',
    );
    const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Village</name><Point><coordinates>-48.5,-1.45</coordinates></Point></Placemark></Document></kml>`;
    const gpx = `<gpx version="1.1" creator="browser"><wpt lat="-1.45" lon="-48.5"><name>Camp</name></wpt></gpx>`;
    const kmzBytes = await makeArchiveBytes([['doc.kml', kml]]);
    const shapefileBytes = await makeArchiveBytes([
      ['territory.shp', pointShp(-48.5, -1.45)],
      ['territory.dbf', oneRecordDbf('community')],
      ['territory.prj', WGS84_PRJ],
    ]);

    await page.goto('/', { waitUntil: 'networkidle' });
    const result = await page.evaluate(
      async ({ kml, gpx, kmzBytes, shapefileBytes }) => {
        const moduleUrl = '/src/lib/map/reference-layer-import.ts';
        const importer = (await import(
          /* @vite-ignore */ moduleUrl
        )) as typeof import('../../src/lib/map/reference-layer-import');
        const context = { minZoom: 0, maxZoom: 22 } as const;

        const kmlResult = await importer.prepareReferenceImportBatch(
          [new File([kml], 'places.kml')],
          context,
        );
        const gpxResult = await importer.prepareReferenceImportBatch(
          [new File([gpx], 'patrol.gpx')],
          context,
        );
        const kmzResult = await importer.prepareReferenceImportBatch(
          [
            new File([new Uint8Array(kmzBytes)], 'places.kmz', {
              type: 'application/vnd.google-earth.kmz',
            }),
          ],
          context,
        );
        const shapefileResult = await importer.prepareReferenceImportBatch(
          [
            new File([new Uint8Array(shapefileBytes)], 'territory.zip', {
              type: 'application/zip',
            }),
          ],
          context,
        );

        function firstFeatureSummary(
          batch: Awaited<
            ReturnType<typeof importer.prepareReferenceImportBatch>
          >,
        ) {
          if (!batch.ok || batch.layers[0]?.source.type !== 'geojson') {
            return { ok: false as const };
          }
          const feature = batch.layers[0].source.data.features[0];
          return {
            ok: true as const,
            geometryType: feature?.geometry.type,
            coordinates:
              feature?.geometry.type === 'Point'
                ? feature.geometry.coordinates.slice(0, 2)
                : undefined,
            properties: feature?.properties,
          };
        }

        return {
          kml: firstFeatureSummary(kmlResult),
          gpx: firstFeatureSummary(gpxResult),
          kmz: firstFeatureSummary(kmzResult),
          shapefile: firstFeatureSummary(shapefileResult),
        };
      },
      {
        kml,
        gpx,
        kmzBytes: Array.from(kmzBytes),
        shapefileBytes: Array.from(shapefileBytes),
      },
    );

    for (const converted of [
      result.kml,
      result.gpx,
      result.kmz,
      result.shapefile,
    ]) {
      expect(converted.ok).toBe(true);
      if (!converted.ok) continue;
      expect(converted.geometryType).toBe('Point');
      expect(converted.coordinates?.[0]).toBeCloseTo(-48.5, 5);
      expect(converted.coordinates?.[1]).toBeCloseTo(-1.45, 5);
    }
    expect(result.kml.ok && result.kml.properties).toMatchObject({
      name: 'Village',
    });
    expect(result.gpx.ok && result.gpx.properties).toMatchObject({
      name: 'Camp',
    });
    expect(result.shapefile.ok && result.shapefile.properties).toMatchObject({
      name: 'community',
    });
  });
});
