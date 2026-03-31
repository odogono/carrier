/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_ZARCH_BULLET_SPEC,
  createShipBullet,
  stepZarchBullet
} from './zarch-bullets';
import type { ZarchShipState } from './use-zarch-runtime';

const makeSurface = (options?: {
  loaded?: boolean;
  terrainHeight?: number;
  water?: boolean;
  waterHeight?: number;
}) => {
  const {
    loaded = true,
    terrainHeight = 0,
    water = false,
    waterHeight = -12
  } = options ?? {};

  return {
    isWaterAtWorld: () => water,
    isWorldPointLoaded: () => loaded,
    sampleHeightAtWorld: () => terrainHeight,
    waterHeight
  };
};

const makeShip = (overrides?: Partial<ZarchShipState>): ZarchShipState => ({
  landed: false,
  pitch: 0,
  respawnDelaySeconds: 0,
  respawnX: 0,
  respawnY: 0,
  respawnZ: 0,
  spawnGraceSeconds: 0,
  velX: 0,
  velY: 0,
  velZ: 0,
  x: 10,
  y: 40,
  yaw: 0,
  z: 30,
  ...overrides
});

describe('zarch bullets', () => {
  test('spawns from the ship nose and inherits ship velocity', () => {
    const bullet = createShipBullet({
      ship: makeShip({
        velX: 12,
        velY: -3,
        velZ: 8
      })
    });

    expect(bullet.x).toBeCloseTo(10, 5);
    expect(bullet.z).toBeLessThan(30);
    expect(bullet.vx).toBeCloseTo(12, 5);
    expect(bullet.vy).toBeCloseTo(-3, 5);
    expect(bullet.vz).toBeLessThan(8);
  });

  test('advances bullets over time', () => {
    const initial = createShipBullet({
      ship: makeShip()
    });

    const result = stepZarchBullet({
      deltaSeconds: 0.05,
      state: initial,
      surface: makeSurface({ terrainHeight: -100 })
    });

    expect(result.event).toBeNull();
    expect(result.state?.z).toBeLessThan(initial.z);
    expect(result.state?.age).toBeGreaterThan(0);
  });

  test('expires bullets after max lifetime', () => {
    const result = stepZarchBullet({
      deltaSeconds: 0.05,
      state: {
        ...createShipBullet({
          ship: makeShip()
        }),
        age: DEFAULT_ZARCH_BULLET_SPEC.maxAgeSeconds - 0.01
      },
      surface: makeSurface({ terrainHeight: -100 })
    });

    expect(result.event).toEqual({ kind: 'expired' });
    expect(result.state).toBeNull();
  });

  test('removes bullets when terrain is unavailable', () => {
    const result = stepZarchBullet({
      deltaSeconds: 0.05,
      state: createShipBullet({
        ship: makeShip()
      }),
      surface: makeSurface({ loaded: false })
    });

    expect(result.event).toEqual({ kind: 'blocked' });
    expect(result.state).toBeNull();
  });

  test('resolves terrain impacts against sampled ground height', () => {
    const result = stepZarchBullet({
      deltaSeconds: 0.05,
      state: createShipBullet({
        ship: makeShip({
          y: 6
        }),
        spec: {
          ...DEFAULT_ZARCH_BULLET_SPEC,
          speed: 0
        }
      }),
      surface: makeSurface({ terrainHeight: 8 })
    });

    expect(result.event).toEqual({
      kind: 'land',
      x: expect.any(Number),
      y: 8,
      z: expect.any(Number)
    });
  });

  test('resolves water impacts at sea height', () => {
    const result = stepZarchBullet({
      deltaSeconds: 0.05,
      state: createShipBullet({
        ship: makeShip({
          y: -11
        }),
        spec: {
          ...DEFAULT_ZARCH_BULLET_SPEC,
          speed: 0
        }
      }),
      surface: makeSurface({
        terrainHeight: -20,
        water: true,
        waterHeight: -10
      })
    });

    expect(result.event).toEqual({
      kind: 'water',
      x: expect.any(Number),
      y: -10,
      z: expect.any(Number)
    });
  });
});
