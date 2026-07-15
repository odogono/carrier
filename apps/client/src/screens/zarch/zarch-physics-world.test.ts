/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';
import { layers, rigidBody } from 'crashcat';

import {
  createZarchPhysicsWorld,
  createZarchStaticColliderBridge,
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
    const expected = new Set([
      'obstacle:shell',
      'obstacle:tank',
      'shell:terrain',
      'shell:vegetation',
      'shell:waterSurface',
      'shoreline:tank',
      'streamBoundary:tank',
      'tank:terrain',
      'tank:vegetation'
    ]);

    for (const [leftName, leftLayer] of Object.entries(matrix)) {
      for (const [rightName, rightLayer] of Object.entries(matrix)) {
        const key = [leftName, rightName].sort().join(':');
        expect(
          layers.objectLayerCollidesWithObjectLayer(
            physics.world.settings.layers,
            leftLayer,
            rightLayer
          ),
          key
        ).toBe(expected.has(key));
      }
    }
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

  test('reconciles the production owner set and removes stale water bodies', () => {
    const physics = createZarchPhysicsWorld();
    const bridge = createZarchStaticColliderBridge(physics);

    bridge.sync([
      {
        geometry: triangle,
        owner: { id: 'active', kind: 'terrain' },
        shape: 'triangle'
      },
      {
        geometry: triangle,
        owner: { id: 'active', kind: 'water-surface' },
        shape: 'triangle'
      }
    ]);
    const waterBody = [...rigidBody.iterate(physics.world)].find(
      body => (body.userData as ZarchPhysicsOwner).kind === 'water-surface'
    );
    const terrainBody = [...rigidBody.iterate(physics.world)].find(
      body => (body.userData as ZarchPhysicsOwner).kind === 'terrain'
    );
    expect(waterBody).toBeDefined();
    expect(terrainBody).toBeDefined();
    const waterBodyId = waterBody!.id;
    const terrainBodyId = terrainBody!.id;

    bridge.sync([
      {
        geometry: triangle,
        owner: { id: 'active', kind: 'terrain' },
        shape: 'triangle'
      },
      {
        geometry: {
          ...triangle,
          positions: [...triangle.positions, 1, 1, 1]
        },
        owner: { id: 'active', kind: 'water-surface' },
        shape: 'triangle'
      }
    ]);
    expect(rigidBody.get(physics.world, terrainBodyId)).toBeDefined();
    expect(rigidBody.get(physics.world, waterBodyId)).toBeUndefined();

    bridge.sync([
      {
        geometry: triangle,
        owner: { id: 'active', kind: 'terrain' },
        shape: 'triangle'
      }
    ]);
    expect(rigidBody.get(physics.world, waterBodyId)).toBeUndefined();
    expect([...rigidBody.iterate(physics.world)]).toHaveLength(1);

    bridge.clear();
    expect([...rigidBody.iterate(physics.world)]).toHaveLength(0);
  });
});
