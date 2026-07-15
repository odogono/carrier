/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import { createZarchPhysicsWorld } from './zarch-physics-world';
import {
  clampTankTurretYaw,
  createPlayerTankSimulation,
  findNearestTankSpawn,
  getPlayerTankBody,
  stepPlayerTankSimulation,
  stepTankTurretYaw
} from './zarch-player-tank';

describe('zarch player tank', () => {
  test('limits turret yaw to the hull-relative forward hemisphere', () => {
    expect(clampTankTurretYaw(Math.PI)).toBeCloseTo(Math.PI / 2);
    expect(clampTankTurretYaw(-Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  test('traverses toward the clamped aim at 120 degrees per second', () => {
    expect(stepTankTurretYaw(0, Math.PI, 0.25)).toBeCloseTo(Math.PI / 6);
    expect(stepTankTurretYaw(0, -Math.PI / 2, 0.25)).toBeCloseTo(-Math.PI / 6);
  });

  test('selects the nearest deterministic loaded land tile', () => {
    const spawn = findNearestTankSpawn({
      isObstacleFree: (x, z) => !(x === 12 && z === 12),
      surface: {
        isTileLoaded: (x, z) => x >= 0 && z >= 0,
        isWaterTile: (x, z) => x === 0 && z === 0,
        sampleHeightAtWorld: () => 7,
        sampleNormalAtWorld: () => ({ x: 0, y: 1, z: 0 })
      },
      tileMeters: 24,
      x: 1,
      z: 1
    });

    expect(spawn).toEqual({ x: 36, y: 8.6, z: 12 });
  });

  test('drives a dynamic upright body in the shared physics world', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'ground', kind: 'obstacle' },
      {
        center: [0, -0.5, 0],
        halfExtents: [100, 0.5, 100],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 1.5,
      yaw: 0,
      z: 0
    });
    for (let frame = 0; frame < 90; frame += 1) {
      stepPlayerTankSimulation({
        aimWorld: null,
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 1,
        physics,
        simulation,
        steer: 0
      });
    }
    const body = getPlayerTankBody(physics, simulation);
    expect(body?.position[2]).toBeLessThan(-5);
    expect(body?.quaternion[0]).toBeCloseTo(0);
    expect(body?.quaternion[2]).toBeCloseTo(0);
  });

  test('caps long-frame catch-up at five fixed steps and drops the backlog', () => {
    const physics = createZarchPhysicsWorld();
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 2,
      yaw: 0,
      z: 0
    });

    stepPlayerTankSimulation({
      aimWorld: null,
      deltaSeconds: 1,
      fire: false,
      forward: 0,
      physics,
      simulation,
      steer: 0
    });

    expect(simulation.accumulatorSeconds).toBe(0);
  });
});
