# GIS reference-import fixtures

These fixtures are repository-owned synthetic data for issue #311. They do not contain third-party GIS data.

- `generated.ts` builds the smallest useful point Shapefile/DBF datasets, CRS strings, KMZ/Shapefile ZIP containers, and metadata-patched ZIP variants used by the safety matrix.
- Shapefile geometry is written directly from the public `.shp` binary layout for one Point record so control coordinates are explicit and reproducible.
- DBF records are generated directly from the dBASE header/field layout, including date, code-page, malformed/non-finite, and declared-record-count cases.
- ZIP/KMZ inputs are generated with JSZip **only in tests**. Adversarial fixtures patch central/local metadata bytes to exercise encryption flags, unsupported compression, ZIP64, declared-size limits, unsafe names, and corrupt bodies without committing large bomb archives. Production import code continues to use `@gmaclennan/zip-reader` exclusively.
- CRS control coordinates use the canonical Child A matrix: WGS84 geographic, Web Mercator Auxiliary Sphere, WGS84 / UTM zone 23S, and SIRGAS 2000 / UTM zone 23S. Expected WGS84 points are asserted in the unit tests with absolute error `<= 1e-5` degrees.

Large limit fixtures are intentionally synthesized or metadata-patched at test time so the repository does not carry multi-megabyte archives solely for adversarial coverage.
