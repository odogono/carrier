import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { MapRepository } from '../maps/repository';

const ASSET_VERSION_ID = 'zarch-player-tank-v1';
const RUNTIME_ENTITY_ID = 'zarch-player-tank';
const sourcePath = resolve(
  import.meta.dir,
  '../../../../assets/zarch/zarch-player-tank.glb'
);
const storageRoot = resolve(
  process.env.API_ASSET_STORAGE_ROOT ??
    resolve(import.meta.dir, '../../../.data/assets')
);
const originalPath = `originals/${ASSET_VERSION_ID}.glb`;
const runtimePath = `runtime/${ASSET_VERSION_ID}.glb`;
const bytes = new Uint8Array(await Bun.file(sourcePath).arrayBuffer());

if (bytes.byteLength === 0) {
  throw new Error(`Tank runtime artifact is empty: ${sourcePath}`);
}

for (const path of [originalPath, runtimePath]) {
  const absolute = resolve(storageRoot, path);
  mkdirSync(dirname(absolute), { recursive: true });
  await Bun.write(absolute, bytes);
}

const repository = new MapRepository();
try {
  const existingAsset = repository.getAssetVersion(ASSET_VERSION_ID);
  if (!existingAsset) {
    repository.createAssetVersion({
      collisionBox: {
        depthMeters: 6.8,
        heightMeters: 2.8,
        widthMeters: 4.2
      },
      collisionClass: 'vehicle-player',
      diagnostics: ['Generated articulated Tank runtime asset'],
      footprint: { depthMeters: 7, widthMeters: 5 },
      groundingPolicy: 'terrain-average-footprint',
      id: ASSET_VERSION_ID,
      instancingEligible: false,
      maxHeightDeltaMeters: 4,
      obstacleMode: 'none',
      originalFile: {
        contentType: 'model/gltf-binary',
        path: originalPath,
        sizeBytes: bytes.byteLength
      },
      runtimeFile: {
        contentType: 'model/gltf-binary',
        path: runtimePath,
        sizeBytes: bytes.byteLength
      },
      status: 'review'
    });
    repository.approveAssetVersion(ASSET_VERSION_ID);
  } else if (
    existingAsset.status !== 'ready' ||
    existingAsset.runtimeFile?.path !== runtimePath ||
    existingAsset.obstacleMode !== 'none'
  ) {
    throw new Error(
      `${ASSET_VERSION_ID} already exists with a different immutable contract`
    );
  }

  const existingBinding = repository.getZarchRuntimeEntity(RUNTIME_ENTITY_ID);
  if (
    existingBinding &&
    (existingBinding.assetVersionId !== ASSET_VERSION_ID ||
      existingBinding.kind !== 'player-tank')
  ) {
    throw new Error(
      `${RUNTIME_ENTITY_ID} is already bound to ${existingBinding.assetVersionId}`
    );
  }

  const binding = repository.upsertZarchRuntimeEntity({
    assetVersionId: ASSET_VERSION_ID,
    id: RUNTIME_ENTITY_ID,
    kind: 'player-tank',
    name: 'Player Tank',
    renderDimensions: { lengthMeters: 7 },
    status: 'active'
  });
  console.log(
    `Provisioned ${binding.id} -> ${binding.assetVersionId} (${bytes.byteLength} bytes)`
  );
} finally {
  repository.close();
}
