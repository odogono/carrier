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
};

const createWrappedClassicMap = async (request: APIRequestContext) => {
  const response = await request.post(`${apiBase}/maps`, {
    data: {
      generator: 'island-clusters',
      generatorParams: {
        densityBias: 1.5,
        majorAttractorCount: 8,
        mediumAttractorCount: 16,
        radiusScale: 2.5
      },
      heightMeters: 1280,
      kind: 'wrapped-classic',
      name: 'Tank mode browser E2E',
      seed: 'tank-mode-browser-e2e',
      widthMeters: 1280
    },
    headers: { 'Content-Type': 'application/json' }
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string };
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

test('Tank provisioning enables a complete browser gameplay journey', async ({
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
  const map = await createWrappedClassicMap(request);

  await page.goto(`/?mapId=${map.id}`);

  const navigationButton = page.getByTestId('zarch-mode-navigation');
  const landerButton = page.getByTestId('zarch-mode-lander');
  const tankButton = page.getByTestId('zarch-mode-tank');
  await expect(navigationButton).toBeVisible();
  await expect(landerButton).toBeVisible();
  await expect(tankButton).toBeVisible();
  await expect(tankButton).toBeDisabled();

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
  const surface = page.getByTestId('zarch-gameplay-surface');

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

  const surfaceBox = await surface.boundingBox();
  expect(surfaceBox).not.toBeNull();
  await page.mouse.move(
    surfaceBox!.x + surfaceBox!.width * 0.65,
    surfaceBox!.y + surfaceBox!.height * 0.55
  );
  await page.keyboard.down('KeyF');
  await expect
    .poll(() => parseNumber(shellCount), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await page.keyboard.up('KeyF');
  await expect(shellCount).toHaveText(/Shells:\s*0/, { timeout: 7000 });

  const tankFinalCentre = await parsePair(centre);
  await navigationButton.dispatchEvent('click');
  await expect(mode).toHaveText(/Navigation/);
  const navigationCentre = await parsePair(centre);
  expect(Math.abs(navigationCentre.x - tankFinalCentre.x)).toBeLessThanOrEqual(
    0.2
  );
  expect(Math.abs(navigationCentre.z - tankFinalCentre.z)).toBeLessThanOrEqual(
    0.2
  );
});
