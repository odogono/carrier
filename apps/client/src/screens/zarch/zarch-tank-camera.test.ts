/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import { stepTankCameraFocus } from './zarch-tank-camera';

describe('Tank camera follow', () => {
  test('damps toward a capped velocity lead and recentres at rest', () => {
    const moving = stepTankCameraFocus({
      current: { x: 0, z: 0 },
      damping: 5,
      deltaSeconds: 1,
      leadSeconds: 0.4,
      maxLeadMeters: 6,
      position: { x: 10, z: 20 },
      sceneScale: 1,
      velocity: { x: 30, z: 0 }
    });

    expect(moving.x).toBeGreaterThan(15.8);
    expect(moving.x).toBeLessThan(16);
    expect(moving.z).toBeGreaterThan(19.8);

    const resting = stepTankCameraFocus({
      current: moving,
      damping: 5,
      deltaSeconds: 1,
      leadSeconds: 0.4,
      maxLeadMeters: 6,
      position: { x: 10, z: 20 },
      sceneScale: 1,
      velocity: { x: 0, z: 0 }
    });

    expect(resting.x).toBeLessThan(10.1);
    expect(resting.z).toBeGreaterThan(19.99);
  });

  test('is frame-rate independent', () => {
    const once = stepTankCameraFocus({
      current: { x: 0, z: 0 },
      damping: 5,
      deltaSeconds: 1,
      leadSeconds: 0,
      maxLeadMeters: 6,
      position: { x: 10, z: 0 },
      sceneScale: 1,
      velocity: { x: 0, z: 0 }
    });
    let stepped = { x: 0, z: 0 };
    for (let index = 0; index < 60; index += 1) {
      stepped = stepTankCameraFocus({
        current: stepped,
        damping: 5,
        deltaSeconds: 1 / 60,
        leadSeconds: 0,
        maxLeadMeters: 6,
        position: { x: 10, z: 0 },
        sceneScale: 1,
        velocity: { x: 0, z: 0 }
      });
    }

    expect(stepped.x).toBeCloseTo(once.x, 10);
  });
});
