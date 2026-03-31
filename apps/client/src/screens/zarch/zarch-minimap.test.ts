import { describe, expect, test } from 'bun:test';

import {
  getMinimapViewportRectangles,
  worldToMinimapPoint,
  wrapWorldCoordinate
} from './zarch-minimap';

describe('zarch minimap helpers', () => {
  test('wraps player marker coordinates into the canonical world size', () => {
    expect(wrapWorldCoordinate(130, 128)).toBe(2);
    expect(wrapWorldCoordinate(-3, 128)).toBe(125);
    expect(wrapWorldCoordinate(0, 128)).toBe(0);
  });

  test('maps increasing world z upward on the minimap', () => {
    const lowZ = worldToMinimapPoint({
      drawSize: 140,
      heightWorld: 240,
      widthWorld: 240,
      worldX: 120,
      worldZ: 24
    });
    const highZ = worldToMinimapPoint({
      drawSize: 140,
      heightWorld: 240,
      widthWorld: 240,
      worldX: 120,
      worldZ: 120
    });

    expect(highZ.x).toBe(lowZ.x);
    expect(highZ.y).toBeLessThan(lowZ.y);
  });

  test('maps increasing world x leftward on the minimap', () => {
    const lowX = worldToMinimapPoint({
      drawSize: 140,
      heightWorld: 240,
      widthWorld: 240,
      worldX: 24,
      worldZ: 120
    });
    const highX = worldToMinimapPoint({
      drawSize: 140,
      heightWorld: 240,
      widthWorld: 240,
      worldX: 120,
      worldZ: 120
    });

    expect(highX.y).toBe(lowX.y);
    expect(highX.x).toBeLessThan(lowX.x);
  });

  test('scales viewport footprint with visible span and clamps minimum size', () => {
    const smallView = getMinimapViewportRectangles({
      cameraX: 120,
      cameraZ: 120,
      drawSize: 140,
      heightWorld: 2400,
      minSizePx: 6,
      viewSpanWorldX: 24,
      viewSpanWorldZ: 24,
      widthWorld: 2400,
      wrapX: false,
      wrapZ: false
    });
    const largeView = getMinimapViewportRectangles({
      cameraX: 120,
      cameraZ: 120,
      drawSize: 140,
      heightWorld: 2400,
      minSizePx: 6,
      viewSpanWorldX: 480,
      viewSpanWorldZ: 360,
      widthWorld: 2400,
      wrapX: false,
      wrapZ: false
    });

    expect(smallView).toHaveLength(1);
    expect(smallView[0]!.width).toBe(6);
    expect(smallView[0]!.height).toBe(6);
    expect(largeView).toHaveLength(1);
    expect(largeView[0]!.width).toBeGreaterThan(smallView[0]!.width);
    expect(largeView[0]!.height).toBeGreaterThan(smallView[0]!.height);
  });

  test('splits wrapped footprint rectangles at horizontal and vertical edges', () => {
    const rects = getMinimapViewportRectangles({
      cameraX: 230,
      cameraZ: 230,
      drawSize: 140,
      heightWorld: 240,
      minSizePx: 6,
      viewSpanWorldX: 60,
      viewSpanWorldZ: 60,
      widthWorld: 240,
      wrapX: true,
      wrapZ: true
    });

    expect(rects).toHaveLength(4);
    expect(rects.some(rect => rect.x === 0)).toBe(true);
    expect(rects.some(rect => rect.y === 0)).toBe(true);
    expect(rects.some(rect => rect.x > 100)).toBe(true);
    expect(rects.some(rect => rect.y > 100)).toBe(true);
  });

  test('clamps non-wrapped footprints to the minimap bounds', () => {
    const rects = getMinimapViewportRectangles({
      cameraX: 0,
      cameraZ: 0,
      drawSize: 140,
      heightWorld: 240,
      minSizePx: 6,
      viewSpanWorldX: 120,
      viewSpanWorldZ: 120,
      widthWorld: 240,
      wrapX: false,
      wrapZ: false
    });

    expect(rects).toHaveLength(1);
    expect(rects[0]!.x + rects[0]!.width).toBe(140);
    expect(rects[0]!.y + rects[0]!.height).toBe(140);
    expect(rects[0]!.width).toBeLessThanOrEqual(140);
    expect(rects[0]!.height).toBeLessThanOrEqual(140);
  });
});
