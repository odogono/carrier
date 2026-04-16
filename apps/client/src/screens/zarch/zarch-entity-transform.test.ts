/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import {
  getEntityDragPosition,
  getEntityHandleScale,
  getEntityRotateYaw,
  normalizeEntityYaw
} from './zarch-entity-transform';

describe('zarch entity transform helpers', () => {
  test('normalizes yaw into the authored 0-360 degree range', () => {
    expect(normalizeEntityYaw(0)).toBe(0);
    expect(normalizeEntityYaw(360)).toBe(0);
    expect(normalizeEntityYaw(405)).toBe(45);
    expect(normalizeEntityYaw(-45)).toBe(315);
  });

  test('moves entity positions by the pointer world delta', () => {
    expect(
      getEntityDragPosition({
        currentPointer: { x: 14, z: 10 },
        startEntityPosition: { x: 20, z: 30 },
        startPointer: { x: 11, z: 12 }
      })
    ).toEqual({ x: 23, z: 28 });
  });

  test('rotates relative to the starting handle angle', () => {
    expect(
      getEntityRotateYaw({
        center: { x: 10, z: 10 },
        currentPointer: { x: 10, z: 9 },
        startPointer: { x: 11, z: 10 },
        startYaw: 350
      })
    ).toBe(260);
  });

  test('scales relative to the starting handle distance', () => {
    expect(
      getEntityHandleScale({
        center: { x: 10, z: 10 },
        currentPointer: { x: 16, z: 10 },
        startPointer: { x: 13, z: 10 },
        startScale: 2
      })
    ).toBe(4);

    expect(
      getEntityHandleScale({
        center: { x: 10, z: 10 },
        currentPointer: { x: 10, z: 10 },
        startPointer: { x: 13, z: 10 },
        startScale: 2
      })
    ).toBe(0.1);
  });
});
