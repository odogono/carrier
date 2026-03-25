/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import {
  PLAYER_SHIP_BLUEPRINT,
  createPlayerShipGeometry
} from './zarch-player-ship-geometry';

describe('zarch player ship geometry', () => {
  test('preserves the original blueprint topology counts', () => {
    expect(PLAYER_SHIP_BLUEPRINT.vertices).toHaveLength(9);
    expect(PLAYER_SHIP_BLUEPRINT.faces).toHaveLength(9);
  });

  test('expands blueprint faces into renderable colored triangles', () => {
    const geometry = createPlayerShipGeometry();
    const positions = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');

    expect(positions.count).toBe(27);
    expect(colors.count).toBe(27);
    expect(geometry.boundingBox).not.toBeNull();
    expect(
      geometry.boundingBox!.max.x - geometry.boundingBox!.min.x
    ).toBeCloseTo(18, 5);

    geometry.dispose();
  });
});
