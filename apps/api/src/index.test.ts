import { existsSync, mkdtempSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { contract } from 'carrier-contracts/contract';
import { decodeMapChunkBinary } from 'carrier-contracts/types';

import { resetAssetPipeline } from '@/maps/assets';
import { getMapRepository, resetMapRepository } from '@/maps/repository';
import { createORPCClient } from '@orpc/client';
import { type ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';

import { createServer } from './index';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const request = async (method: string, path: string, body?: unknown) => {
  const { app } = await createServer();
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      method
    })
  );

  return {
    json: await response.json(),
    response
  };
};

const requestRaw = async (request: Request) => {
  const { app } = await createServer();
  return app.handle(request);
};

const createTestClient = async () => {
  const { app } = await createServer();
  const link = new OpenAPILink(contract, {
    fetch: (request, init) =>
      app.handle(
        new Request(request, {
          ...init
        })
      ),
    url: 'http://localhost/api'
  });

  return createORPCClient(link) as JsonifiedClient<
    ContractRouterClient<typeof contract>
  >;
};

describe('API server map routes', () => {
  beforeEach(() => {
    process.env.API_DB_PATH = ':memory:';
    process.env.API_ASSET_STORAGE_ROOT = mkdtempSync('/tmp/carrier-assets-');
    resetMapRepository();
    resetAssetPipeline();
  });

  afterEach(() => {
    resetAssetPipeline();
    resetMapRepository();
    delete process.env.API_ASSET_STORAGE_ROOT;
    delete process.env.API_DB_PATH;
  });

  const waitForAssetStatus = async (id: string, expectedStatuses: string[]) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await request('GET', `/api/maps/assets/${id}`);
      const assetVersion = response.json as Record<string, unknown>;
      const status = assetVersion.status;

      if (typeof status === 'string' && expectedStatuses.includes(status)) {
        return assetVersion;
      }

      await Bun.sleep(10);
    }

    throw new Error(
      `Timed out waiting for asset ${id} to reach ${expectedStatuses.join(', ')}`
    );
  };

  test('supports create/list/find/getChunk/delete through the public contract', async () => {
    const createdResponse = await request('POST', '/api/maps', {
      kind: 'wrapped-classic',
      generator: 'diamond-square',
      heightMeters: 640,
      name: 'Contract map',
      seed: 'contract-seed',
      widthMeters: 640
    });
    const created = createdResponse.json as Record<string, unknown>;

    expect(created.name).toBe('Contract map');
    expect((created.extent as Record<string, unknown>).wrapX).toBe(true);
    expect((created.extent as Record<string, unknown>).wrapZ).toBe(true);

    const listedResponse = await request('GET', '/api/maps');
    const listed = listedResponse.json as Array<Record<string, unknown>>;
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);

    const fetchedResponse = await request(
      'GET',
      `/api/maps/${created.id as string}`
    );
    const fetched = fetchedResponse.json as Record<string, unknown>;
    expect(fetched.seed).toBe('contract-seed');

    const chunkResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/chunks/0/0`
    );
    const chunk = chunkResponse.json as Record<string, unknown>;
    expect(chunk.samplesWide).toBe(33);
    expect(chunk.samplesHigh).toBe(33);
    expect((chunk.heights as unknown[]).length).toBe(33 * 33);

    const deletedResponse = await request(
      'DELETE',
      `/api/maps/${created.id as string}`
    );
    const deleted = deletedResponse.json as Record<string, unknown>;
    expect(deleted.deleted).toBe(true);

    const finalList = await request('GET', '/api/maps');
    expect((finalList.json as unknown[]).length).toBe(0);
  });

  test('supports creating island preset maps through the public contract', async () => {
    const createdResponse = await request('POST', '/api/maps', {
      kind: 'wrapped-classic',
      generator: 'island-clusters',
      heightMeters: 960,
      name: 'Island contract map',
      seed: 'contract-islands',
      widthMeters: 1280
    });
    const created = createdResponse.json as Record<string, unknown>;

    expect(created.generator).toBe('island-clusters');

    const fetchedResponse = await request(
      'GET',
      `/api/maps/${created.id as string}`
    );
    const fetched = fetchedResponse.json as Record<string, unknown>;
    expect(fetched.generator).toBe('island-clusters');

    const chunkResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/chunks/1/1`
    );
    const chunk = chunkResponse.json as Record<string, unknown>;
    expect(chunk.mapId).toBe(created.id);
    expect((chunk.heights as unknown[]).length).toBe(33 * 33);
  });

  test('supports signed wrapped-classic chunk requests through canonical lookup', async () => {
    const createdResponse = await request('POST', '/api/maps', {
      kind: 'wrapped-classic',
      generator: 'diamond-square',
      heightMeters: 640,
      name: 'Toroidal map',
      seed: 'toroidal-seed',
      widthMeters: 640
    });
    const created = createdResponse.json as Record<string, unknown>;

    const canonicalResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/chunks/1/0`
    );
    const aliasedResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/chunks/-1/0`
    );
    const canonical = canonicalResponse.json as Record<string, unknown>;
    const aliased = aliasedResponse.json as Record<string, unknown>;

    expect(aliased.chunkX).toBe(canonical.chunkX);
    expect(aliased.chunkZ).toBe(canonical.chunkZ);
    expect(aliased.heights).toEqual(canonical.heights);
  });

  test('supports binary chunk downloads through the oRPC client', async () => {
    const createdResponse = await request('POST', '/api/maps', {
      kind: 'wrapped-classic',
      generator: 'diamond-square',
      heightMeters: 640,
      name: 'Binary map',
      seed: 'binary-seed',
      widthMeters: 640
    });
    const created = createdResponse.json as Record<string, unknown>;
    const client = await createTestClient();

    const chunk = await decodeMapChunkBinary(
      await client.maps.getChunkBinary({
        chunkX: 0,
        chunkZ: 0,
        mapId: created.id as string
      })
    );

    expect(chunk.layers.height.encoding).toBe('uint16');
    expect(chunk.layers.material?.encoding).toBe('uint8');
    expect(chunk.samplesWide).toBe(33);
    expect(chunk.samplesHigh).toBe(33);
    expect(chunk.heights).toBeInstanceOf(Float32Array);
    expect(chunk.heights.length).toBe(33 * 33);
    expect(chunk.materials?.length).toBe(32 * 32);
    expect(chunk.staticEntities).toEqual([]);
  });

  test('supports archetype catalog reads and updates through the public contract', async () => {
    const repository = getMapRepository();
    const map = repository.createMap({
      kind: 'infinite-vector',
      name: 'Archetype map',
      seed: 'archetype-seed'
    });
    const readyAsset = repository.createAssetVersion({
      collisionBox: {
        depthMeters: 10,
        heightMeters: 12,
        widthMeters: 8
      },
      collisionClass: 'building-solid',
      diagnostics: [],
      footprint: {
        depthMeters: 10,
        widthMeters: 8
      },
      groundingPolicy: 'terrain-average-footprint',
      id: 'tower-v1',
      instancingEligible: false,
      maxHeightDeltaMeters: 1,
      originalFile: {
        contentType: 'model/gltf-binary',
        path: 'uploads/tower.glb',
        sizeBytes: 256
      },
      runtimeFile: {
        contentType: 'model/gltf-binary',
        path: 'runtime/tower-v1.glb',
        sizeBytes: 128
      },
      status: 'ready'
    });
    const archetype = repository.createArchetype({
      assetVersionId: readyAsset.id,
      category: 'landmark',
      id: 'tower',
      name: 'Tower',
      status: 'active',
      tags: ['stone']
    });
    repository.createStaticEntity({
      archetypeId: archetype.id,
      expectedRevision: 0,
      id: 'tower-1',
      label: null,
      mapId: map.id,
      position: {
        x: 5,
        z: 5
      },
      rotation: {
        yaw: 0
      },
      scale: 1,
      state: 'active',
      yOffset: 0
    });

    const client = await createTestClient();

    expect(await client.maps.listArchetypes({})).toEqual([archetype]);
    expect(await client.maps.getArchetype({ id: archetype.id })).toEqual(
      archetype
    );

    const updated = await client.maps.updateArchetype({
      category: 'building',
      id: archetype.id,
      name: 'Tower Keep',
      status: 'deprecated',
      tags: ['stone', 'legacy']
    });
    expect(updated.status).toBe('deprecated');
    expect(updated.assetVersionId).toBe(readyAsset.id);

    expect(await client.maps.listArchetypes({ status: 'deprecated' })).toEqual([
      updated
    ]);
    expect(
      await client.maps.listReferencedArchetypes({
        mapId: map.id
      })
    ).toEqual([updated]);
  });

  test('supports infinite-vector authored routes through the public API', async () => {
    const createdResponse = await request('POST', '/api/maps', {
      kind: 'infinite-vector',
      name: 'Authoring map',
      seed: 'authoring-seed'
    });
    const created = createdResponse.json as Record<string, unknown>;

    const polygonResponse = await request(
      'POST',
      `/api/maps/${created.id as string}/polygons`,
      {
        expectedRevision: 0,
        mapId: created.id,
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
      }
    );
    const polygonPayload = polygonResponse.json as Record<string, unknown>;
    expect(polygonPayload.mapRevision).toBe(1);
    expect(polygonPayload.dirtyBounds).toEqual({
      maxX: 216,
      maxZ: 216,
      minX: -16,
      minZ: -16
    });

    const staleControlResponse = await request(
      'POST',
      `/api/maps/${created.id as string}/controls`,
      {
        elevationMeters: 90,
        expectedRevision: 0,
        influenceMeters: 120,
        mapId: created.id,
        strength: 1,
        type: 'peak',
        x: 100,
        z: 100
      }
    );
    expect(staleControlResponse.response.status).toBe(409);

    const controlResponse = await request(
      'POST',
      `/api/maps/${created.id as string}/controls`,
      {
        elevationMeters: 90,
        expectedRevision: 1,
        influenceMeters: 120,
        mapId: created.id,
        strength: 1,
        type: 'peak',
        x: 100,
        z: 100
      }
    );
    const controlPayload = controlResponse.json as Record<string, unknown>;
    expect(controlPayload.mapRevision).toBe(2);
    expect(controlPayload.dirtyBounds).toEqual({
      maxX: 356,
      maxZ: 356,
      minX: -156,
      minZ: -156
    });

    const overviewResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/overview`
    );
    const overview = overviewResponse.json as Record<string, unknown>;
    const counts = overview.counts as Record<string, unknown>;
    expect(counts.sourcePolygons).toBe(1);
    expect(counts.controlPoints).toBe(1);
    expect(counts.derivedIslands).toBe(1);

    const islandsResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/islands`
    );
    const islands = islandsResponse.json as Array<Record<string, unknown>>;
    expect(islands).toHaveLength(1);

    const islandUpdateResponse = await request(
      'PATCH',
      `/api/maps/${created.id as string}/islands/${islands[0]?.id as string}`,
      {
        defaultFaction: 'blue',
        expectedRevision: 2,
        id: islands[0]?.id,
        mapId: created.id,
        name: 'Main Island'
      }
    );
    const islandUpdate = islandUpdateResponse.json as Record<string, unknown>;
    expect((islandUpdate.island as Record<string, unknown>).name).toBe(
      'Main Island'
    );

    const repository = getMapRepository();
    const assetVersion = repository.createAssetVersion({
      collisionBox: {
        depthMeters: 16,
        heightMeters: 20,
        widthMeters: 16
      },
      collisionClass: 'building-solid',
      diagnostics: [],
      footprint: {
        depthMeters: 16,
        widthMeters: 16
      },
      groundingPolicy: 'terrain-average-footprint',
      id: 'lighthouse-v1',
      instancingEligible: true,
      maxHeightDeltaMeters: 1,
      originalFile: {
        contentType: 'model/gltf-binary',
        path: 'uploads/lighthouse.glb',
        sizeBytes: 123
      },
      runtimeFile: {
        contentType: 'model/gltf-binary',
        path: 'runtime/lighthouse.glb',
        sizeBytes: 456
      },
      status: 'ready'
    });
    const archetype = repository.createArchetype({
      assetVersionId: assetVersion.id,
      category: 'landmark',
      id: 'lighthouse',
      name: 'Lighthouse',
      status: 'active',
      tags: []
    });
    repository.createStaticEntity({
      archetypeId: archetype.id,
      expectedRevision: 3,
      id: 'lighthouse-1',
      label: 'Harbor lighthouse',
      mapId: created.id as string,
      position: {
        x: 100,
        z: 100
      },
      rotation: {
        yaw: 15
      },
      scale: 1,
      state: 'active',
      yOffset: 0
    });

    const chunkResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/chunks/0/0`
    );
    const chunk = chunkResponse.json as Record<string, unknown>;
    expect((chunk.heights as unknown[]).length).toBe(33 * 33);
    expect(chunk.staticEntities as unknown[]).toHaveLength(1);
    expect(
      (chunk.staticEntities as Array<Record<string, unknown>>)[0]?.id
    ).toBe('lighthouse-1');

    const binaryChunk = await decodeMapChunkBinary(
      await (
        await createTestClient()
      ).maps.getChunkBinary({
        chunkX: 0,
        chunkZ: 0,
        mapId: created.id as string
      })
    );
    expect(binaryChunk.staticEntities).toHaveLength(1);
    expect(binaryChunk.staticEntities[0]?.rotation.yaw).toBe(15);
  });

  test('supports exported slice routes through the public API', async () => {
    const createdResponse = await request('POST', '/api/maps', {
      kind: 'infinite-vector',
      name: 'Export source',
      seed: 'export-api-seed'
    });
    const created = createdResponse.json as Record<string, unknown>;

    const polygonResponse = await request(
      'POST',
      `/api/maps/${created.id as string}/polygons`,
      {
        expectedRevision: 0,
        mapId: created.id,
        params: {
          maxDisplacementMeters: 16,
          noiseScaleMeters: 96,
          roughness: 0.6
        },
        vertices: [
          { x: 0, z: 0 },
          { x: 320, z: 0 },
          { x: 320, z: 320 },
          { x: 0, z: 320 }
        ]
      }
    );
    expect((polygonResponse.json as Record<string, unknown>).mapRevision).toBe(
      1
    );

    const exportResponse = await request(
      'POST',
      `/api/maps/${created.id as string}/exports`,
      {
        bounds: {
          maxX: 320,
          maxZ: 320,
          minX: 0,
          minZ: 0
        },
        chunkSizeTiles: 16,
        expectedRevision: 1,
        kind: 'finite-vector-slice',
        mapId: created.id,
        metersPerTile: 10,
        name: 'Slice A'
      }
    );
    const exported = exportResponse.json as Record<string, unknown>;
    expect(exported.kind).toBe('finite-vector-slice');
    expect((exported.export as Record<string, unknown>).sourceMapId).toBe(
      created.id
    );

    const listedExportsResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/exports`
    );
    const listedExports = listedExportsResponse.json as Array<
      Record<string, unknown>
    >;
    expect(listedExports).toHaveLength(1);
    expect(listedExports[0]?.id).toBe(exported.id);

    const fetchedExportResponse = await request(
      'GET',
      `/api/maps/exports/${exported.id as string}`
    );
    const fetchedExport = fetchedExportResponse.json as Record<string, unknown>;
    expect(
      (fetchedExport.export as Record<string, unknown>).sourceRevision
    ).toBe(1);

    const chunk = await decodeMapChunkBinary(
      await (
        await createTestClient()
      ).maps.getChunkBinary({
        chunkX: 0,
        chunkZ: 0,
        mapId: exported.id as string
      })
    );
    expect(chunk.mapId).toBe(exported.id as string);
    expect(chunk.tileWidth).toBe(16);

    const outOfBoundsChunkResponse = await request(
      'GET',
      `/api/maps/${exported.id as string}/chunks/2/0`
    );
    expect(outOfBoundsChunkResponse.response.status).toBe(404);
  });

  test('processes uploaded GLBs into reviewable runtime assets', async () => {
    const header = new Uint8Array([
      0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x14, 0x00, 0x00, 0x00
    ]);
    const payload = new Uint8Array([
      ...header,
      0x4a,
      0x53,
      0x4f,
      0x4e,
      0x04,
      0x00,
      0x00,
      0x00,
      0x7b,
      0x7d,
      0x20,
      0x20
    ]);
    const formData = new FormData();
    formData.set(
      'file',
      new File([payload], 'watchtower.glb', {
        type: 'model/gltf-binary'
      })
    );

    const uploadResponse = await requestRaw(
      new Request('http://localhost/api/maps/assets', {
        body: formData,
        method: 'POST'
      })
    );
    expect(uploadResponse.status).toBe(201);
    const uploaded = (await uploadResponse.json()) as Record<string, unknown>;
    expect(uploaded.status).toBe('uploaded');

    const finalAsset = await waitForAssetStatus(uploaded.id as string, [
      'review'
    ]);
    expect(finalAsset.runtimeFile).toEqual({
      contentType: 'model/gltf-binary',
      path: `runtime/${uploaded.id as string}.glb`,
      sizeBytes: payload.byteLength
    });
    expect(finalAsset.diagnostics).toEqual([
      'Candidate metadata auto-derived from uploaded asset',
      'Normalization pipeline completed'
    ]);

    const runtimeResponse = await requestRaw(
      new Request(
        `http://localhost/api/maps/assets/${uploaded.id as string}/runtime`
      )
    );
    expect(runtimeResponse.status).toBe(200);
    expect(new Uint8Array(await runtimeResponse.arrayBuffer())).toEqual(
      payload
    );
  });

  test('marks invalid uploads as failed with diagnostics', async () => {
    const formData = new FormData();
    formData.set(
      'file',
      new File([new TextEncoder().encode('not-a-glb')], 'broken.glb', {
        type: 'model/gltf-binary'
      })
    );

    const uploadResponse = await requestRaw(
      new Request('http://localhost/api/maps/assets', {
        body: formData,
        method: 'POST'
      })
    );
    expect(uploadResponse.status).toBe(201);
    const uploaded = (await uploadResponse.json()) as Record<string, unknown>;

    const finalAsset = await waitForAssetStatus(uploaded.id as string, [
      'failed'
    ]);
    expect(finalAsset.runtimeFile).toBeNull();
    expect(finalAsset.diagnostics).toEqual([
      'Candidate metadata auto-derived from uploaded asset',
      'Uploaded asset is too small to be a valid GLB'
    ]);
  });

  test('supports review approval and archetype creation for uploaded assets', async () => {
    const repository = getMapRepository();
    const assetVersion = repository.createAssetVersion({
      collisionBox: {
        depthMeters: 18,
        heightMeters: 20,
        widthMeters: 18
      },
      collisionClass: 'building-solid',
      diagnostics: ['Candidate metadata auto-derived from uploaded asset'],
      footprint: {
        depthMeters: 18,
        widthMeters: 18
      },
      groundingPolicy: 'terrain-average-footprint',
      id: 'refinery-v1',
      instancingEligible: false,
      maxHeightDeltaMeters: 1.5,
      originalFile: {
        contentType: 'model/gltf-binary',
        path: 'uploads/refinery.glb',
        sizeBytes: 512
      },
      runtimeFile: {
        contentType: 'model/gltf-binary',
        path: 'runtime/refinery-v1.glb',
        sizeBytes: 512
      },
      status: 'review'
    });

    const client = await createTestClient();
    const listed = await client.maps.listAssetVersions({});
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(assetVersion.id);

    const reviewed = await client.maps.updateAssetVersionReview({
      collisionBox: {
        depthMeters: 16,
        heightMeters: 24,
        widthMeters: 20
      },
      diagnostics: ['Candidate metadata auto-derived from uploaded asset', 'Admin adjusted footprint'],
      footprint: {
        depthMeters: 16,
        widthMeters: 20
      },
      id: assetVersion.id,
      instancingEligible: true,
      maxHeightDeltaMeters: 0.75
    });
    expect(reviewed.footprint.widthMeters).toBe(20);
    expect(reviewed.instancingEligible).toBe(true);

    const ready = await client.maps.approveAssetVersion({
      id: assetVersion.id
    });
    expect(ready.status).toBe('ready');

    const archetype = await client.maps.createArchetype({
      assetVersionId: assetVersion.id,
      category: 'industrial',
      id: 'refinery',
      name: 'Refinery',
      status: 'active',
      tags: ['fuel', 'steel']
    });
    expect(archetype.assetVersionId).toBe(assetVersion.id);

    await expect(
      client.maps.updateAssetVersionReview({
        id: assetVersion.id,
        maxHeightDeltaMeters: 1
      })
    ).rejects.toThrow('Asset version refinery-v1 is not in review');
  });

  test('allows PATCH in CORS preflight responses for admin authoring routes', async () => {
    const { app } = await createServer();
    const response = await app.handle(
      new Request('http://localhost/api/maps/test-map/polygons/test-polygon', {
        headers: {
          'Access-Control-Request-Headers': 'content-type',
          'Access-Control-Request-Method': 'PATCH',
          Origin: 'http://localhost:5179'
        },
        method: 'OPTIONS'
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:5179'
    );
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'PATCH'
    );
  });

  test('package exports resolve to real source files', async () => {
    const packageJson = (await Bun.file(
      resolve(apiRoot, 'package.json')
    ).json()) as {
      exports?: Record<string, string>;
    };

    expect(packageJson.exports).toBeDefined();

    for (const entry of Object.values(packageJson.exports ?? {})) {
      expect(existsSync(resolve(apiRoot, entry))).toBe(true);
    }
  });
});
