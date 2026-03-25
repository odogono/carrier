/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import {
  createPlayerShipSpawnState,
  getPlayerShipThrustVector,
  stepPlayerShip
} from './zarch-player-ship';

const makeSurface = (options?: {
  loaded?: boolean;
  terrainHeight?: number;
  water?: boolean;
  waterHeight?: number;
}) => {
  const {
    loaded = true,
    terrainHeight = 12,
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

describe('zarch player ship simulation', () => {
  test('spawns above terrain with fixed clearance', () => {
    const state = createPlayerShipSpawnState({
      surface: makeSurface({ terrainHeight: 20 }),
      x: 48,
      z: 72
    });

    expect(state.x).toBe(48);
    expect(state.z).toBe(72);
    expect(state.y).toBeGreaterThan(20);
    expect(state.respawnY).toBe(state.y);
  });

  test('applies level thrust upward during a step', () => {
    const initial = createPlayerShipSpawnState({
      surface: makeSurface(),
      x: 48,
      z: 72
    });

    const result = stepPlayerShip({
      deltaSeconds: 1 / 60,
      input: {
        pitchDown: false,
        pitchUp: false,
        thrust: true,
        yawLeft: true,
        yawRight: false
      },
      state: initial,
      surface: makeSurface()
    });

    expect(result.event).toBeNull();
    expect(result.state.yaw).toBeGreaterThan(initial.yaw);
    expect(result.state.velY).toBeGreaterThan(0);
    expect(Math.abs(result.state.velX)).toBeLessThan(0.01);
    expect(Math.abs(result.state.velZ)).toBeLessThan(0.01);
  });

  test('tilts thrust with ship pitch', () => {
    const thrustVector = getPlayerShipThrustVector(0, 0.4);

    expect(thrustVector.y).toBeLessThan(1);
    expect(thrustVector.z).not.toBe(0);
  });

  test('crashes on terrain contact and respawns at the saved spawn point', () => {
    const initial = createPlayerShipSpawnState({
      surface: makeSurface({ terrainHeight: 10 }),
      x: 48,
      z: 72
    });

    const result = stepPlayerShip({
      deltaSeconds: 1 / 60,
      input: {
        pitchDown: false,
        pitchUp: false,
        thrust: false,
        yawLeft: false,
        yawRight: false
      },
      state: {
        ...initial,
        spawnGraceSeconds: 0,
        y: 9
      },
      surface: makeSurface({ terrainHeight: 10 })
    });

    expect(result.event).toEqual({
      kind: 'crash',
      water: false,
      x: expect.any(Number),
      y: 10,
      z: expect.any(Number)
    });
    expect(result.state.x).toBe(initial.respawnX);
    expect(result.state.z).toBe(initial.respawnZ);
    expect(result.state.y).toBe(initial.respawnY);
  });

  test('blocks movement when terrain samples are unavailable', () => {
    const initial = createPlayerShipSpawnState({
      surface: makeSurface(),
      x: 48,
      z: 72
    });

    const result = stepPlayerShip({
      deltaSeconds: 1 / 60,
      input: {
        pitchDown: false,
        pitchUp: false,
        thrust: true,
        yawLeft: false,
        yawRight: false
      },
      state: initial,
      surface: makeSurface({ loaded: false })
    });

    expect(result.event).toEqual({ kind: 'blocked' });
    expect(result.state.x).toBe(initial.x);
    expect(result.state.z).toBe(initial.z);
    expect(result.state.velX).toBe(0);
    expect(result.state.velZ).toBe(0);
  });
});
