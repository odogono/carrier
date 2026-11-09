import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  expect,
  test,
  type APIRequestContext,
  type Locator
} from '@playwright/test';

const apiPort = process.env.E2E_API_PORT ?? '16022';
const apiBase = `http://localhost:${apiPort}/api`;
const SCENE_UNITS_PER_TILE = 24;
const shipAssetPath = resolve(
  fileURLToPath(
    new URL('../../../assets/zarch/zarch-player-ship.glb', import.meta.url)
  )
);
const tankAssetPath = resolve(
  fileURLToPath(
    new URL('../../../test-assets/low-poly-tank.glb', import.meta.url)
  )
);

type RuntimeEntityFixture = {
  assetPath: string;
  fileName: string;
  id: 'zarch-player-ship' | 'zarch-player-tank';
  kind: 'player-ship' | 'player-tank';
  lengthMeters: number;
  name: string;
  review?: {
    collisionBox: {
      depthMeters: number;
      heightMeters: number;
      widthMeters: number;
    };
    footprint: { depthMeters: number; widthMeters: number };
    maxHeightDeltaMeters: number;
    obstacleMode: 'solid';
  };
};

const uploadReadyRuntimeEntity = async (
  request: APIRequestContext,
  fixture: RuntimeEntityFixture
) => {
  // Playwright runs specs in a Node worker, even when its CLI is launched by Bun.
  const assetBytes = await readFile(fixture.assetPath);
  const uploadResponse = await request.post(`${apiBase}/maps/assets`, {
    multipart: {
      file: {
        buffer: assetBytes,
        mimeType: 'model/gltf-binary',
        name: fixture.fileName
      }
    }
  });
  expect(uploadResponse.ok()).toBeTruthy();
  const uploaded = (await uploadResponse.json()) as { id: string };

  await expect
    .poll(
      async () => {
        const response = await request.get(
          `${apiBase}/maps/assets/${uploaded.id}`
        );
        expect(response.ok()).toBeTruthy();
        return ((await response.json()) as { status: string }).status;
      },
      { timeout: 30_000 }
    )
    .toBe('review');

  if (fixture.review) {
    const reviewResponse = await request.patch(
      `${apiBase}/maps/assets/${uploaded.id}/review`,
      {
        data: { id: uploaded.id, ...fixture.review },
        headers: { 'Content-Type': 'application/json' }
      }
    );
    expect(reviewResponse.ok()).toBeTruthy();
  }

  const approveResponse = await request.post(
    `${apiBase}/maps/assets/${uploaded.id}/approve`
  );
  expect(approveResponse.ok()).toBeTruthy();

  const bindResponse = await request.put(
    `${apiBase}/zarch/runtime-entities/${fixture.id}`,
    {
      data: {
        assetVersionId: uploaded.id,
        id: fixture.id,
        kind: fixture.kind,
        name: fixture.name,
        renderDimensions: { lengthMeters: fixture.lengthMeters },
        status: 'active'
      },
      headers: { 'Content-Type': 'application/json' }
    }
  );
  expect(bindResponse.ok()).toBeTruthy();
  return uploaded.id;
};

const createWrappedClassicMap = async (
  request: APIRequestContext,
  {
    name = 'Tank mode browser E2E',
    seed = 'tank-mode-browser-e2e',
    sizeMeters = 1280
  }: { name?: string; seed?: string; sizeMeters?: number } = {}
) => {
  const response = await request.post(`${apiBase}/maps`, {
    data: {
      generator: 'island-clusters',
      generatorParams: {
        densityBias: 1.5,
        majorAttractorCount: 8,
        mediumAttractorCount: 16,
        radiusScale: 2.5
      },
      heightMeters: sizeMeters,
      kind: 'wrapped-classic',
      name,
      seed,
      widthMeters: sizeMeters
    },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    extent: { heightTiles: number; widthTiles: number };
    id: string;
    resolution: { metersPerTile: number };
  };
};

const createShellTarget = async ({
  assetVersionId,
  map,
  request
}: {
  assetVersionId: string;
  map: {
    extent: { heightTiles: number; widthTiles: number };
    id: string;
    resolution: { metersPerTile: number };
  };
  request: APIRequestContext;
}) => {
  const archetypeId = 'tank-shell-e2e-target';
  const archetypeResponse = await request.post(`${apiBase}/maps/archetypes`, {
    data: {
      assetVersionId,
      category: 'industrial',
      id: archetypeId,
      name: 'Tank Shell E2E Target',
      status: 'active',
      tags: ['e2e']
    },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(archetypeResponse.ok()).toBeTruthy();

  const targetResponse = await request.post(
    `${apiBase}/maps/${map.id}/entities`,
    {
      data: {
        archetypeId,
        expectedRevision: 0,
        id: 'tank-shell-e2e-target-1',
        label: null,
        mapId: map.id,
        position: {
          x: (map.extent.widthTiles * map.resolution.metersPerTile) / 2,
          z: (map.extent.heightTiles * map.resolution.metersPerTile) / 2
        },
        rotation: { yaw: 0 },
        scale: 1,
        state: 'active',
        yOffset: 2.8
      },
      headers: { 'Content-Type': 'application/json' }
    }
  );
  expect(targetResponse.ok()).toBeTruthy();
};

const createWrappedSeamCorridor = async ({
  map,
  request
}: {
  map: { extent: { heightTiles: number; widthTiles: number }; id: string };
  request: APIRequestContext;
}) => {
  const centerTileX = Math.floor(map.extent.widthTiles / 2);
  const edits = Array.from({ length: map.extent.heightTiles }, (_, tileZ) =>
    [-2, -1, 0, 1, 2].map(offset => ({
      colorIndex: null,
      heightSteps: 0,
      tileX: centerTileX + offset,
      tileZ,
      typeId: 'landing-pad'
    }))
  ).flat();
  const response = await request.patch(`${apiBase}/maps/${map.id}/tiles`, {
    data: { edits, expectedRevision: 0, mapId: map.id },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(response.ok()).toBeTruthy();
};

const parsePair = async (locator: Locator) => {
  const text = (await locator.textContent()) ?? '';
  const match = text.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  expect(
    match,
    `expected a coordinate pair in ${JSON.stringify(text)}`
  ).not.toBeNull();
  return { x: Number(match![1]), z: Number(match![2]) };
};

const parseNumber = async (locator: Locator) => {
  const text = (await locator.textContent()) ?? '';
  const match = text.match(/-?\d+(?:\.\d+)?/);
  expect(match, `expected a number in ${JSON.stringify(text)}`).not.toBeNull();
  return Number(match![0]);
};

const parseTankRuntimeDiagnostics = async (locator: Locator) => {
  const text = (await locator.textContent()) ?? '';
  const match = text.match(
    /Camera yaw:\s*(-?\d+(?:\.\d+)?); Collider tile:\s*(-?\d+|--),\s*(-?\d+|--); Tank bodies:\s*(\d+); Shell bodies:\s*(\d+); Exit:\s*(-?\d+(?:\.\d+)?|--),\s*(-?\d+(?:\.\d+)?|--)/
  );
  expect(
    match,
    `expected Tank runtime diagnostics in ${JSON.stringify(text)}`
  ).not.toBeNull();
  return {
    cameraYaw: Number(match![1]),
    colliderTileX: match![2] === '--' ? null : Number(match![2]),
    colliderTileZ: match![3] === '--' ? null : Number(match![3]),
    lastExitX: match![6] === '--' ? null : Number(match![6]),
    lastExitZ: match![7] === '--' ? null : Number(match![7]),
    shellBodyCount: Number(match![5]),
    tankBodyCount: Number(match![4])
  };
};

const expectDisplayedCoordinateDifference = (
  actual: number,
  expected: number,
  maximumDifference = 0.2
) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    maximumDifference + 1e-9
  );
};

test('Tank provisioning enables a complete browser gameplay journey', async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ height: 900, width: 1600 });

  const shellTargetAssetVersionId = await uploadReadyRuntimeEntity(request, {
    assetPath: shipAssetPath,
    fileName: 'zarch-player-ship.glb',
    id: 'zarch-player-ship',
    kind: 'player-ship',
    lengthMeters: 5,
    name: 'Player Lander',
    review: {
      collisionBox: {
        depthMeters: 2,
        heightMeters: 0.4,
        widthMeters: 80
      },
      footprint: { depthMeters: 2, widthMeters: 80 },
      maxHeightDeltaMeters: 100,
      obstacleMode: 'solid'
    }
  });
  const map = await createWrappedClassicMap(request);
  await createShellTarget({
    assetVersionId: shellTargetAssetVersionId,
    map,
    request
  });

  await page.goto(`/?mapId=${map.id}`);

  const navigationButton = page.getByTestId('zarch-mode-navigation');
  const landerButton = page.getByTestId('zarch-mode-lander');
  const tankButton = page.getByTestId('zarch-mode-tank');
  await expect(navigationButton).toBeVisible();
  await expect(landerButton).toBeVisible();
  await expect(tankButton).toBeVisible();
  await expect(tankButton).toBeDisabled();

  await page.getByRole('button', { name: 'Enter Edit' }).click();
  await expect(navigationButton).toBeDisabled();
  await expect(landerButton).toBeDisabled();
  await expect(tankButton).toBeDisabled();
  await page.getByRole('button', { name: 'Exit Edit' }).click();
  await expect(landerButton).toBeEnabled();

  await uploadReadyRuntimeEntity(request, {
    assetPath: tankAssetPath,
    fileName: 'low-poly-tank.glb',
    id: 'zarch-player-tank',
    kind: 'player-tank',
    lengthMeters: 7,
    name: 'Player Tank'
  });

  await page.reload();
  await expect(tankButton).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId('zarch-hud-height')).toHaveText(
    /Height:\s*-?\d/,
    { timeout: 30_000 }
  );

  const mode = page.getByTestId('zarch-hud-mode');
  const centre = page.getByTestId('zarch-hud-centre');
  const speed = page.getByTestId('zarch-hud-tank-speed');
  const shellCount = page.getByTestId('zarch-hud-shell-count');
  const shellImpact = page.getByTestId('zarch-hud-shell-impact');

  await expect
    .poll(
      async () => {
        const currentMode = (await mode.textContent()) ?? '';
        if (!currentMode.includes('Tank')) {
          await tankButton.dispatchEvent('click');
        }
        return currentMode;
      },
      { timeout: 30_000 }
    )
    .toContain('Tank');
  await expect(speed).toBeVisible();
  await expect(shellCount).toHaveText(/Shells:\s*0/);
  await expect(shellImpact).toHaveText(/Impacts:\s*0; Last:\s*none/);

  await page.keyboard.down('KeyF');
  await expect(shellImpact).toHaveText(/Impacts:\s*1; Last:\s*land/, {
    timeout: 4500
  });
  await page.keyboard.up('KeyF');
  await expect(shellCount).toHaveText(/Shells:\s*0/);

  const centreBeforeDrive = await parsePair(centre);
  await page.keyboard.down('KeyW');
  await expect
    .poll(() => parseNumber(speed), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const current = await parsePair(centre);
      return Math.hypot(
        current.x - centreBeforeDrive.x,
        current.z - centreBeforeDrive.z
      );
    })
    .toBeGreaterThan(0);
  await page.keyboard.up('KeyW');

  await page.keyboard.down('KeyA');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyA');
  const centreBeforePivotDrive = await parsePair(centre);
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => {
      const current = await parsePair(centre);
      return Math.abs(current.x - centreBeforePivotDrive.x);
    })
    .toBeGreaterThan(0.5);
  await page.keyboard.up('KeyW');

  await page.keyboard.down('KeyS');
  let previousSpeed = Number.POSITIVE_INFINITY;
  let minimumSpeed = previousSpeed;
  for (let sample = 0; sample < 200; sample += 1) {
    await page.waitForTimeout(25);
    const currentSpeed = Math.abs(await parseNumber(speed));
    minimumSpeed = Math.min(minimumSpeed, currentSpeed);
    if (currentSpeed > previousSpeed) {
      break;
    }
    previousSpeed = currentSpeed;
  }
  await page.keyboard.up('KeyS');
  expect(minimumSpeed).toBeLessThan(1);
  await page.waitForTimeout(1500);

  const tankFinalCentre = await parsePair(centre);
  await navigationButton.dispatchEvent('click');
  await expect(mode).toHaveText(/Navigation/);
  const navigationCentre = await parsePair(centre);
  expectDisplayedCoordinateDifference(navigationCentre.x, tankFinalCentre.x);
  expectDisplayedCoordinateDifference(navigationCentre.z, tankFinalCentre.z);
});

test('Tank crosses a wrapped seam and cleans up through direct mode changes', async ({
  page,
  request
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ height: 900, width: 1600 });

  await uploadReadyRuntimeEntity(request, {
    assetPath: shipAssetPath,
    fileName: 'zarch-player-ship.glb',
    id: 'zarch-player-ship',
    kind: 'player-ship',
    lengthMeters: 5,
    name: 'Player Lander'
  });
  await uploadReadyRuntimeEntity(request, {
    assetPath: tankAssetPath,
    fileName: 'low-poly-tank.glb',
    id: 'zarch-player-tank',
    kind: 'player-tank',
    lengthMeters: 7,
    name: 'Player Tank'
  });
  const map = await createWrappedClassicMap(request, {
    name: 'Tank wrapped seam E2E',
    seed: 'tank-seam-241',
    sizeMeters: 160
  });
  await createWrappedSeamCorridor({ map, request });

  await page.goto(`/?mapId=${map.id}`);

  const navigationButton = page.getByTestId('zarch-mode-navigation');
  const landerButton = page.getByTestId('zarch-mode-lander');
  const tankButton = page.getByTestId('zarch-mode-tank');
  const mode = page.getByTestId('zarch-hud-mode');
  const centre = page.getByTestId('zarch-hud-centre');
  const speed = page.getByTestId('zarch-hud-tank-speed');
  const shellCount = page.getByTestId('zarch-hud-shell-count');
  const runtimeDiagnostics = page.getByTestId(
    'zarch-hud-tank-runtime-diagnostics'
  );

  await expect(tankButton).toBeEnabled({ timeout: 30_000 });
  await expect(page.getByTestId('zarch-hud-height')).toHaveText(
    /Height:\s*-?\d/,
    { timeout: 30_000 }
  );
  await tankButton.dispatchEvent('click');
  await expect(mode).toHaveText(/Tank/);
  const initialCameraYaw = (
    await parseTankRuntimeDiagnostics(runtimeDiagnostics)
  ).cameraYaw;

  await page.keyboard.down('KeyW');
  await expect.poll(() => parseNumber(speed)).toBeGreaterThan(0);
  await expect
    .poll(async () => (await parsePair(centre)).z, { timeout: 15_000 })
    .toBeLessThan(0);
  const unwrappedCentre = await parsePair(centre);
  await page.waitForTimeout(500);
  await expect
    .poll(async () => (await parsePair(centre)).z)
    .toBeLessThan(unwrappedCentre.z);
  const seamDiagnostics = await parseTankRuntimeDiagnostics(runtimeDiagnostics);
  expect(seamDiagnostics.colliderTileZ).toBeLessThan(0);
  expect(seamDiagnostics.tankBodyCount).toBe(1);
  expect(seamDiagnostics.cameraYaw).toBeCloseTo(initialCameraYaw, 6);
  await page.keyboard.up('KeyW');

  await page.keyboard.down('KeyF');
  await expect.poll(() => parseNumber(shellCount)).toBeGreaterThan(0);
  await page.keyboard.up('KeyF');
  await landerButton.dispatchEvent('click');
  await expect(mode).toHaveText(/Lander/);
  await expect
    .poll(() => parseTankRuntimeDiagnostics(runtimeDiagnostics))
    .toMatchObject({ shellBodyCount: 0, tankBodyCount: 0 });
  await tankButton.dispatchEvent('click');
  await expect(mode).toHaveText(/Tank/);
  await expect(shellCount).toHaveText(/Shells:\s*0/);
  await expect(speed).toBeVisible();
  await page.waitForTimeout(1500);

  await navigationButton.dispatchEvent('click');
  await expect(mode).toHaveText(/Navigation/);
  await expect
    .poll(async () => (await parsePair(centre)).z)
    .toBeGreaterThanOrEqual(0);
  const navigationCentre = await parsePair(centre);
  const exitDiagnostics = await parseTankRuntimeDiagnostics(runtimeDiagnostics);
  const wrappedWidth = map.extent.widthTiles * SCENE_UNITS_PER_TILE;
  const wrappedHeight = map.extent.heightTiles * SCENE_UNITS_PER_TILE;
  expectDisplayedCoordinateDifference(
    navigationCentre.x,
    ((exitDiagnostics.lastExitX! % wrappedWidth) + wrappedWidth) % wrappedWidth
  );
  expectDisplayedCoordinateDifference(
    navigationCentre.z,
    ((exitDiagnostics.lastExitZ! % wrappedHeight) + wrappedHeight) %
      wrappedHeight
  );
});
