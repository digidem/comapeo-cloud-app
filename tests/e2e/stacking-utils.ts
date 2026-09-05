import { type Locator, expect } from '@playwright/test';

/**
 * Assert that a visible control meets the 44×44 touch-target minimum and that
 * several interior points are browser pointer hit targets. This catches controls
 * that are undersized or partly/fully covered by a higher stacking-context
 * descendant (for example MapLibre's cooperative-gesture layer).
 */
export async function expectControlUnobscured(control: Locator): Promise<void> {
  await expect(control).toBeVisible();

  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  const allPointsHitControl = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const points = [
      [0.5, 0.5],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.5, 0.25],
      [0.5, 0.75],
    ] as const;

    return points.every(([xRatio, yRatio]) => {
      const hit = document.elementFromPoint(
        rect.left + rect.width * xRatio,
        rect.top + rect.height * yRatio,
      );
      return hit === element || (hit !== null && element.contains(hit));
    });
  });

  expect(allPointsHitControl).toBe(true);
}

/**
 * Add a pointer-active, MapLibre-style high-z descendant inside a map wrapper.
 * Internal MapLibre UI can use very high z-index values; this fixture makes the
 * stacking-context regression deterministic even when cooperative-gesture UI is
 * not rendered by a particular headless browser run.
 */
export async function installHighZMapBlocker(
  mapWrapper: Locator,
): Promise<void> {
  // Deliberately require the wrapper itself to establish the containing block;
  // relying on a positioned ancestor would make the fixture geometry ambiguous.
  const wrapperPosition = await mapWrapper.evaluate(
    (wrapper) => getComputedStyle(wrapper).position,
  );
  expect(wrapperPosition).not.toBe('static');

  await mapWrapper.evaluate((wrapper) => {
    const blocker = document.createElement('div');
    blocker.dataset.testid = 'synthetic-maplibre-high-z';
    Object.assign(blocker.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '999999',
    });
    wrapper.appendChild(blocker);
  });
}

export async function removeHighZMapBlocker(
  mapWrapper: Locator,
): Promise<void> {
  await mapWrapper.evaluate((wrapper) => {
    wrapper
      .querySelector<HTMLElement>('[data-testid="synthetic-maplibre-high-z"]')
      ?.remove();
  });
}

/** Prove an overlay geometrically covers every point used by hit-target checks. */
export async function expectOverlayCoversControlHitPoints(
  overlay: Locator,
  control: Locator,
): Promise<void> {
  await expect(overlay).toBeVisible();
  await expect(control).toBeVisible();

  const overlayBox = await overlay.boundingBox();
  const controlBox = await control.boundingBox();
  if (!overlayBox || !controlBox) {
    throw new Error(
      'Expected visible overlay and control to have bounding boxes',
    );
  }

  const points = [
    [0.5, 0.5],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
  ] as const;

  for (const [xRatio, yRatio] of points) {
    const x = controlBox.x + controlBox.width * xRatio;
    const y = controlBox.y + controlBox.height * yRatio;
    expect(x).toBeGreaterThanOrEqual(overlayBox.x);
    expect(x).toBeLessThanOrEqual(overlayBox.x + overlayBox.width);
    expect(y).toBeGreaterThanOrEqual(overlayBox.y);
    expect(y).toBeLessThanOrEqual(overlayBox.y + overlayBox.height);
  }
}
