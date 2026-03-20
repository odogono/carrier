import { expect, test } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '16021';
const apiBase = `http://localhost:${apiPort}/api`;

async function seedMapWithSquarePolygon(request: {
  post: (
    url: string,
    options?: { data?: unknown; headers?: Record<string, string> }
  ) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }>;
}): Promise<string> {
  const mapRes = await request.post(`${apiBase}/maps`, {
    data: {
      kind: 'infinite-vector',
      name: 'e2e polygon drag',
      seed: 'e2e-polygon-drag-seed'
    },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(mapRes.ok()).toBeTruthy();
  const map = (await mapRes.json()) as { id: string };
  expect(map.id).toBeTruthy();

  const polyRes = await request.post(`${apiBase}/maps/${map.id}/polygons`, {
    data: {
      expectedRevision: 0,
      mapId: map.id,
      params: {
        maxDisplacementMeters: 16,
        noiseScaleMeters: 96,
        roughness: 0.6
      },
      vertices: [
        { x: 0, z: 0 },
        { x: 200, z: 0 },
        { x: 200, z: 200 },
        { x: 0, z: 200 }
      ]
    },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(polyRes.ok()).toBeTruthy();

  return map.id;
}

test('selected polygon drag tracks pointer without initial jump', async ({
  page,
  request
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const mapId = await seedMapWithSquarePolygon(request);

  const polygonsLoaded = page.waitForResponse(
    response =>
      response.url().includes(`/maps/${mapId}/polygons`) &&
      response.request().method() === 'GET' &&
      response.ok()
  );

  await page.goto(`/maps/${mapId}/editor`);
  await polygonsLoaded;

  await expect(
    page.getByRole('heading', { name: 'Terrain Editor' })
  ).toBeVisible();

  const stage = page.getByTestId('editor-stage');
  await expect
    .poll(async () => {
      const box = await stage.boundingBox();
      return box !== null && box.width >= 2 && box.height >= 2;
    })
    .toBeTruthy();

  const interactionSvg = page.locator('[data-testid="editor-stage"] svg.outline-none');
  await expect(interactionSvg).toBeVisible({ timeout: 60_000 });

  const overlayPolygon = page
    .locator('[data-testid="editor-stage"] svg.outline-none polygon')
    .first();
  await expect(overlayPolygon).toBeVisible({ timeout: 30_000 });
  await overlayPolygon.click({ force: true });

  const yellowDraft = stage.locator('svg polygon[stroke="#facc15"]');
  await expect(yellowDraft).toBeVisible({ timeout: 15_000 });

  const boxBefore = await yellowDraft.boundingBox();
  expect(boxBefore).not.toBeNull();
  const centerX = boxBefore!.x + boxBefore!.width / 2;
  const centerY = boxBefore!.y + boxBefore!.height / 2;

  const deltaPx = 12;
  await page.mouse.move(centerX, centerY);
  await page.mouse.down();
  await page.mouse.move(centerX + deltaPx, centerY, { steps: 5 });
  await page.mouse.up();

  const boxAfter = await yellowDraft.boundingBox();
  expect(boxAfter).not.toBeNull();

  const shiftX =
    boxAfter!.x + boxAfter!.width / 2 - (boxBefore!.x + boxBefore!.width / 2);

  expect(Math.abs(shiftX - deltaPx)).toBeLessThan(4);
});
