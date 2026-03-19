import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { contract } from 'carrier-contracts/contract';
import { decodeMapChunkBinary } from 'carrier-contracts/types';

import { createORPCClient } from '@orpc/client';
import { type ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';

import { resetMapRepository } from '@/maps/repository';

import { createServer } from './index';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const request = async (
  method: string,
  path: string,
  body?: unknown
) => {
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
    resetMapRepository();
  });

  afterEach(() => {
    resetMapRepository();
    delete process.env.API_DB_PATH;
  });

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

    const fetchedResponse = await request('GET', `/api/maps/${created.id as string}`);
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

    const fetchedResponse = await request('GET', `/api/maps/${created.id as string}`);
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
    expect((islandUpdate.island as Record<string, unknown>).name).toBe('Main Island');

    const chunkResponse = await request(
      'GET',
      `/api/maps/${created.id as string}/chunks/0/0`
    );
    const chunk = chunkResponse.json as Record<string, unknown>;
    expect((chunk.heights as unknown[]).length).toBe(33 * 33);
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
    expect(response.headers.get('access-control-allow-methods')).toContain('PATCH');
  });

  test('package exports resolve to real source files', async () => {
    const packageJson = await Bun.file(resolve(apiRoot, 'package.json')).json() as {
      exports?: Record<string, string>;
    };

    expect(packageJson.exports).toBeDefined();

    for (const entry of Object.values(packageJson.exports ?? {})) {
      expect(existsSync(resolve(apiRoot, entry))).toBe(true);
    }
  });
});
