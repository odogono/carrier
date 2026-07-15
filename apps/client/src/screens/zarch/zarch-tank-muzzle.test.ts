/* eslint-disable import-x/no-unresolved */
import { Group, Object3D } from 'three';

import { describe, expect, test } from 'bun:test';

import { resolveTankMuzzlePose } from './zarch-tank-muzzle';

describe('Tank Muzzle', () => {
  test('resolves the authored Muzzle relative to the Tank physics pose', () => {
    const tankRoot = new Group();
    tankRoot.position.set(136, 3, 196);
    tankRoot.rotation.y = Math.PI / 2;

    const cannon = new Group();
    cannon.position.set(0, 1.4, -0.6);
    cannon.rotation.x = (6 * Math.PI) / 180;
    tankRoot.add(cannon);

    const muzzle = new Object3D();
    muzzle.position.z = -4.8;
    cannon.add(muzzle);
    tankRoot.updateMatrixWorld(true);

    const pose = resolveTankMuzzlePose({
      muzzle,
      sceneScale: 2,
      tankPhysicsPosition: [70, 3, 108],
      tankRoot
    });

    expect(pose.position[0]).toBeCloseTo(67.313_15, 4);
    expect(pose.position[1]).toBeCloseTo(4.9017, 4);
    expect(pose.position[2]).toBeCloseTo(108, 4);
    expect(pose.direction[0]).toBeCloseTo(-0.9786, 4);
    expect(pose.direction[1]).toBeCloseTo(0.206, 3);
    expect(pose.direction[2]).toBeCloseTo(0, 4);
  });
});
