/**
 * Canonical list of coverage method identifiers shown in the MethodSelector.
 * Extracted to its own module so tests can mock it separately from the
 * component, allowing the `!meta` guard branch to be exercised with real
 * source coverage tracking.
 */
export const METHOD_IDS: string[] = [
  'observed',
  'connectivity10',
  'connectivity30',
  'clusterHull',
  'grid',
];
