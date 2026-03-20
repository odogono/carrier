import { expect, test } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '16021';
const apiBase = `http://localhost:${apiPort}/api`;

type SeedRequest = {
  get: (
    url: string,
    options?: { headers?: Record<string, string> }
  ) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }>;
  post: (
    url: string,
    options?: { data?: unknown; headers?: Record<string, string> }
  ) => Promise<{ ok: () => boolean; json: () => Promise<unknown> }>;
};

const fetchIslandIds = async (
  request: SeedRequest,
  mapId: string
): Promise<string[]> => {
  const islandsRes = await request.get(`${apiBase}/maps/${mapId}/islands`);
  expect(islandsRes.ok()).toBeTruthy();
  const islands = (await islandsRes.json()) as Array<{ id: string }>;
  return islands.map(island => island.id);
};

const seedMapWithSquarePolygon = async (
  request: SeedRequest
): Promise<{ islandIds: string[]; mapId: string }> => {
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

  return { islandIds: await fetchIslandIds(request, map.id), mapId: map.id };
};

const seedMapWithTwoIslands = async (
  request: SeedRequest
): Promise<{ islandIds: string[]; mapId: string }> => {
  const mapRes = await request.post(`${apiBase}/maps`, {
    data: {
      kind: 'infinite-vector',
      name: 'e2e multi island drag',
      seed: 'e2e-multi-island-drag-seed'
    },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(mapRes.ok()).toBeTruthy();
  const map = (await mapRes.json()) as { id: string };

  for (const [index, minX] of [0, 420].entries()) {
    const polyRes = await request.post(`${apiBase}/maps/${map.id}/polygons`, {
      data: {
        expectedRevision: index,
        mapId: map.id,
        params: {
          maxDisplacementMeters: 16,
          noiseScaleMeters: 96,
          roughness: 0.6
        },
        vertices: [
          { x: minX, z: 0 },
          { x: minX + 200, z: 0 },
          { x: minX + 200, z: 200 },
          { x: minX, z: 200 }
        ]
      },
      headers: { 'Content-Type': 'application/json' }
    });
    expect(polyRes.ok()).toBeTruthy();
  }

  const islandIds = await fetchIslandIds(request, map.id);
  expect(islandIds).toHaveLength(2);

  return { islandIds, mapId: map.id };
};

test('selected polygon drag tracks pointer without initial jump', async ({
  page,
  request
}): Promise<void> => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const { mapId } = await seedMapWithSquarePolygon(request);

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

  const interactionSvg = page.locator(
    '[data-testid="editor-stage"] svg.outline-none'
  );
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

test('derived island rows match map selection and multi-island drag moves both islands', async ({
  page,
  request
}): Promise<void> => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 900 });
  const { islandIds, mapId } = await seedMapWithTwoIslands(request);

  await page.goto(`/maps/${mapId}/editor`);
  await expect(
    page.getByRole('heading', { name: 'Terrain Editor' })
  ).toBeVisible();

  const stage = page.getByTestId('editor-stage');
  const islandRows = page.locator('[data-testid^="derived-island-row-"]');
  await expect(islandRows).toHaveCount(2);

  await page.getByTestId(`derived-island-row-${islandIds[0]}`).click();
  await expect(stage.locator('svg polygon[stroke="#facc15"]')).toBeVisible();

  await page
    .getByTestId(`derived-island-row-${islandIds[1]}`)
    .click({ modifiers: ['Shift'] });

  await expect(
    page.getByText(
      '2 islands selected. Drag any selected polygon to move the group together.'
    )
  ).toBeVisible();
  await expect(stage.locator('svg polygon[stroke="#facc15"]')).toHaveCount(0);

  const selectedPolygons = stage.locator(
    'svg [data-polygon-id][stroke="#f472b6"]'
  );
  await expect(selectedPolygons).toHaveCount(2);

  const firstBefore = await selectedPolygons.nth(0).boundingBox();
  const secondBefore = await selectedPolygons.nth(1).boundingBox();
  expect(firstBefore).not.toBeNull();
  expect(secondBefore).not.toBeNull();

  const startX = firstBefore!.x + firstBefore!.width / 2;
  const startY = firstBefore!.y + firstBefore!.height / 2;
  const deltaPx = 18;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaPx, startY, { steps: 5 });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const firstAfter = await selectedPolygons.nth(0).boundingBox();
      const secondAfter = await selectedPolygons.nth(1).boundingBox();
      if (!firstAfter || !secondAfter) {
        return null;
      }

      return {
        first:
          firstAfter.x +
          firstAfter.width / 2 -
          (firstBefore!.x + firstBefore!.width / 2),
        second:
          secondAfter.x +
          secondAfter.width / 2 -
          (secondBefore!.x + secondBefore!.width / 2)
      };
    })
    .toEqual({
      first: expect.closeTo(deltaPx, 4),
      second: expect.closeTo(deltaPx, 4)
    });
});
