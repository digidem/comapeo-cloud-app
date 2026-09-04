import { type Locator, expect } from '@playwright/test';

/**
 * Assert that the center of a visible control is the browser's pointer hit target.
 * This catches overlays that are technically visible but covered by a higher
 * stacking-context descendant (for example MapLibre's cooperative-gesture layer).
 */
export async function expectControlUnobscured(control: Locator): Promise<void> {
  await expect(control).toBeVisible();

  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  const isHitTarget = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return hit === element || (hit !== null && element.contains(hit));
  });

  expect(isHitTarget).toBe(true);
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
  await mapWrapper.evaluate((wrapper) => {
    const blocker = document.createElement('div');
    blocker.dataset.testid = 'synthetic-maplibre-high-z';
    Object.assign(blocker.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '999999',
      pointerEvents: 'auto',
    });
    wrapper.appendChild(blocker);
  });
}
