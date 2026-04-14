import { expect, test } from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '16021';
const apiBase = `http://localhost:${apiPort}/api`;

type SeedRequest = {
  get: (
    url: string,
    options?: { headers?: Record<string, string> }
  ) => Promise<{ json: () => Promise<unknown>; ok: () => boolean }>;
  post: (
    url: string,
    options?: { data?: unknown; headers?: Record<string, string> }
  ) => Promise<{ json: () => Promise<unknown>; ok: () => boolean }>;
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

const seedMapWithPolygonAndControl = async (
  request: SeedRequest
): Promise<{ islandIds: string[]; mapId: string }> => {
  const seeded = await seedMapWithSquarePolygon(request);

  const controlRes = await request.post(
    `${apiBase}/maps/${seeded.mapId}/controls`,
    {
      data: {
        elevationMeters: 90,
        expectedRevision: 1,
        influenceMeters: 120,
        mapId: seeded.mapId,
        strength: 1,
        type: 'peak',
        x: 100,
        z: 100
      },
      headers: { 'Content-Type': 'application/json' }
    }
  );
  expect(controlRes.ok()).toBeTruthy();

  return seeded;
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
  await page.setViewportSize({ height: 900, width: 1600 });
  const { mapId } = await seedMapWithSquarePolygon(request);

  const polygonsLoaded = page.waitForResponse(
    response =>
      response.url().includes(`/maps/${mapId}/polygons`) &&
      response.request().method() === 'GET' &&
      response.ok()
  );

  await page.goto(`/maps/${mapId}/editor`);
  await polygonsLoaded;

  await expect(page.getByRole('heading', { name: 'Inspector' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Selection', exact: true })
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

  await expect(
    page.getByRole('heading', { name: 'Polygon', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Terrain Parameters' })
  ).toBeVisible();
  await expect(page.getByText('1 polygon selected').first()).toBeVisible();

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
  await page.setViewportSize({ height: 900, width: 1600 });
  const { islandIds, mapId } = await seedMapWithTwoIslands(request);

  await page.goto(`/maps/${mapId}/editor`);
  await expect(page.getByRole('heading', { name: 'Inspector' })).toBeVisible();

  const stage = page.getByTestId('editor-stage');
  await page.getByRole('button', { name: 'Islands' }).click();
  const islandRows = page.locator('[data-testid^="derived-island-row-"]');
  await expect(islandRows).toHaveCount(2);

  await page.getByTestId(`derived-island-row-${islandIds[0]}`).click();
  await expect(stage.locator('svg polygon[stroke="#facc15"]')).toBeVisible();

  await page
    .getByTestId(`derived-island-row-${islandIds[1]}`)
    .click({ modifiers: ['Shift'] });

  await page.getByRole('button', { name: 'Selection', exact: true }).click();
  await expect(
    page.getByText(
      '2 islands selected. Use the canvas to drag them together or use the boolean tools above when the selection order matters.'
    )
  ).toBeVisible();
  await expect(stage.locator('svg polygon[stroke="#facc15"]')).toHaveCount(0);

  const selectedPolygons = stage.locator(
    'svg [data-polygon-id][stroke="#a855f7"]'
  );
  await expect(selectedPolygons).toHaveCount(2);

  const firstBefore = await selectedPolygons.nth(0).boundingBox();
  const secondBefore = await selectedPolygons.nth(1).boundingBox();
  expect(firstBefore).not.toBeNull();
  expect(secondBefore).not.toBeNull();

  const deltaPx = 18;

  await selectedPolygons.nth(0).dragTo(selectedPolygons.nth(0), {
    force: true,
    targetPosition: {
      x: firstBefore!.width / 2 + deltaPx,
      y: firstBefore!.height / 2
    }
  });

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

test('selecting a control point switches the inspector context', async ({
  page,
  request
}): Promise<void> => {
  test.setTimeout(90_000);
  await page.setViewportSize({ height: 900, width: 1600 });
  const { mapId } = await seedMapWithPolygonAndControl(request);

  await page.goto(`/maps/${mapId}/editor`);
  await expect(page.getByRole('heading', { name: 'Inspector' })).toBeVisible();

  const controlPoint = page.getByTestId('editor-control-point-handle').first();
  await expect(controlPoint).toBeVisible({ timeout: 30_000 });
  await controlPoint.click({ force: true });

  await expect(
    page.getByRole('heading', { name: 'Control Point', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Type')).toBeVisible();
  await expect(page.getByLabel('Strength')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Polygon', exact: true })
  ).toHaveCount(0);
});

test('terrain editing exposes canvas-first controls and shortcuts', async ({
  page,
  request
}): Promise<void> => {
  test.setTimeout(90_000);
  await page.setViewportSize({ height: 900, width: 1600 });
  const { mapId } = await seedMapWithSquarePolygon(request);

  await page.goto(`/maps/${mapId}/editor`);
  const stage = page.getByTestId('editor-stage');
  await expect(stage).toBeVisible();

  await stage.getByRole('button', { name: 'Terrain', exact: true }).click();

  await expect(stage.getByTestId('editor-canvas-status')).toContainText(
    'Terrain Height'
  );
  await expect(stage.getByTestId('editor-canvas-status')).toContainText(
    'Drag across the map to select terrain tiles'
  );
  await expect(stage.getByTestId('editor-terrain-dock')).toBeVisible();
  await expect(stage.getByLabel('Canvas terrain render layer')).toBeVisible();
  await expect(stage.getByLabel('Canvas terrain tool')).toBeVisible();
  await expect(stage.getByTestId('terrain-selection-count')).toContainText(
    '0 selected'
  );
  await expect(stage.getByRole('button', { name: 'Flatten' })).toBeDisabled();
  await expect(page.getByText(/from the sidebar/i)).toHaveCount(0);

  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(
    box!.x + box!.width / 2 - 24,
    box!.y + box!.height / 2 - 24
  );
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 24,
    box!.y + box!.height / 2 + 24,
    {
      steps: 6
    }
  );
  await page.mouse.up();

  await expect(stage.getByRole('button', { name: 'Flatten' })).toBeEnabled();
  await stage.getByRole('button', { name: 'Flatten' }).click();
  await expect(stage.getByTestId('terrain-dirty-count')).not.toContainText(
    '0 pending'
  );
  await expect(
    stage.getByRole('button', { name: 'Save terrain edits' })
  ).toBeEnabled();
  await expect(
    stage.getByRole('button', { name: 'Cancel terrain edits' })
  ).toBeEnabled();

  await stage.getByRole('button', { name: 'Shortcuts' }).click();
  await expect(stage.getByText('Ctrl/Cmd+Z')).toBeVisible();
  await expect(stage.getByText('Esc clears drafts or selection')).toBeVisible();
});
