import { describe, expect, test } from 'bun:test';
import type { MapMetadata, RuntimeMapChunk } from 'carrier-contracts/types';
import { layers, rigidBody } from 'crashcat';

import {
  createZarchChunkColliderBridge,
  createZarchPhysicsWorld,
  type ZarchPhysicsOwner
} from './zarch-physics-world';

const triangle = {
  indices: [0, 2, 1],
  positions: [0, 0, 0, 1, 0, 0, 0, 0, 1]
};

describe('zarch physics world', () => {
  test('uses the agreed Tank and Shell collision matrix', () => {
    const physics = createZarchPhysicsWorld();
    const matrix = physics.layers;

    expect(
      layers.objectLayerCollidesWithObjectLayer(
        physics.world.settings.layers,
        matrix.tank,
        matrix.terrain
      )
    ).toBeTrue();
    expect(
      layers.objectLayerCollidesWithObjectLayer(
        physics.world.settings.layers,
        matrix.shell,
        matrix.waterSurface
      )
    ).toBeTrue();
    expect(
      layers.objectLayerCollidesWithObjectLayer(
        physics.world.settings.layers,
        matrix.tank,
        matrix.waterSurface
      )
    ).toBeFalse();
    expect(
      layers.objectLayerCollidesWithObjectLayer(
        physics.world.settings.layers,
        matrix.shell,
        matrix.tank
      )
    ).toBeFalse();
  });

  test('replaces and removes bodies through stable domain owners', () => {
    const physics = createZarchPhysicsWorld();
    const owner: ZarchPhysicsOwner = {
      id: '0:0@0:0',
      kind: 'terrain'
    };

    const first = physics.replaceStaticTriangleBody(owner, triangle);
    const second = physics.replaceStaticTriangleBody(owner, triangle);

    expect(first).not.toBe(second);
    expect(rigidBody.get(physics.world, first)).toBeUndefined();
    expect(rigidBody.get(physics.world, second)).toBeDefined();
    expect([...rigidBody.iterate(physics.world)]).toHaveLength(1);

    physics.removeOwner(owner);
    expect([...rigidBody.iterate(physics.world)]).toHaveLength(0);
  });

  test('creates oriented authored boxes and vegetation cylinders', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'building-1', kind: 'obstacle' },
      {
        center: [5, 2, 7],
        halfExtents: [2, 2, 3],
        yawRadians: Math.PI * 0.5
      }
    );
    physics.replaceStaticCylinderBody(
      { id: 'tree-1', kind: 'vegetation' },
      { center: [9, 3, 11], halfHeight: 3, radius: 1 }
    );

    expect([...rigidBody.iterate(physics.world)]).toHaveLength(2);
  });

  test('reconciles wrapped chunk collider images around the focus', () => {
    const map: MapMetadata = {
      createdAt: '',
      extent: {
        heightMeters: 20,
        heightTiles: 2,
        kind: 'finite',
        widthMeters: 20,
        widthTiles: 2,
        wrapX: true,
        wrapZ: true
      },
      id: 'map-1',
      kind: 'wrapped-classic',
      name: null,
      resolution: { chunkSizeTiles: 2, metersPerTile: 10 },
      revision: 1,
      seed: 'seed',
      updatedAt: ''
    };
    const chunk: RuntimeMapChunk = {
      chunkX: 0,
      chunkZ: 0,
      heights: new Float32Array([1, 1, 1, 1]),
      layers: { height: { encoding: 'float32', unit: 'metres' } },
      mapId: map.id,
      originTileX: 0,
      originTileZ: 0,
      samplesHigh: 2,
      samplesWide: 2,
      staticEntities: [],
      tileHeight: 1,
      tileWidth: 1
    };
    const physics = createZarchPhysicsWorld();
    const bridge = createZarchChunkColliderBridge({ map, physics, seaY: -12 });

    bridge.sync({ chunks: [chunk], focusX: 39, focusZ: -1 });
    expect([...rigidBody.iterate(physics.world)]).toHaveLength(9);

    bridge.sync({ chunks: [], focusX: 39, focusZ: -1 });
    expect([...rigidBody.iterate(physics.world)]).toHaveLength(0);
  });
});
