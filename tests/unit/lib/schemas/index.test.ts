import { describe, expect, it } from 'vitest';

import * as schemas from '@/lib/schemas';

describe('schemas index', () => {
  it('exports serverInfoResponseSchema', () => {
    expect(schemas.serverInfoResponseSchema).toBeDefined();
  });

  it('exports projectsResponseSchema', () => {
    expect(schemas.projectsResponseSchema).toBeDefined();
  });

  it('exports observationSchema', () => {
    expect(schemas.observationSchema).toBeDefined();
  });

  it('exports observationsResponseSchema', () => {
    expect(schemas.observationsResponseSchema).toBeDefined();
  });

  it('exports alertSchema', () => {
    expect(schemas.alertSchema).toBeDefined();
  });

  it('exports alertsResponseSchema', () => {
    expect(schemas.alertsResponseSchema).toBeDefined();
  });

  it('exports createAlertBodySchema', () => {
    expect(schemas.createAlertBodySchema).toBeDefined();
  });

  it('exports errorResponseSchema', () => {
    expect(schemas.errorResponseSchema).toBeDefined();
  });

  it('exports geometrySchema', () => {
    expect(schemas.geometrySchema).toBeDefined();
  });
});
