/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import {
  getPlayerShipExhaustDirection,
  getPlayerShipExhaustOrigin
} from './zarch-player-ship';

describe('zarch player ship exhaust helpers', () => {
  test('places the exhaust at the ship center by default', () => {
    const origin = getPlayerShipExhaustOrigin({
      pitch: 0,
      x: 10,
      y: 20,
      yaw: 0,
      z: 30
    });

    expect(origin.x).toBeCloseTo(10, 5);
    expect(origin.y).toBeCloseTo(20, 5);
    expect(origin.z).toBeCloseTo(30, 5);
  });

  test('points exhaust opposite to thrust direction', () => {
    const direction = getPlayerShipExhaustDirection(0, 0);

    expect(direction.x).toBeCloseTo(0, 5);
    expect(direction.y).toBeCloseTo(-1, 5);
    expect(direction.z).toBeCloseTo(0, 5);
  });
});
