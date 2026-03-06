import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { resetMapRepository } from '@/maps/repository';

import { createServer } from './index';

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
      generator: 'diamond-square',
      heightTiles: 64,
      name: 'Contract map',
      seed: 'contract-seed',
      widthTiles: 64
    });
    const created = createdResponse.json as Record<string, unknown>;

    expect(created.name).toBe('Contract map');

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
});
