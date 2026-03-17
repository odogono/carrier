import { describe, expect, test } from 'bun:test';

import { wrapWorldCoordinate } from './zarch-minimap';

describe('zarch minimap helpers', () => {
  test('wraps player marker coordinates into the canonical world size', () => {
    expect(wrapWorldCoordinate(130, 128)).toBe(2);
    expect(wrapWorldCoordinate(-3, 128)).toBe(125);
    expect(wrapWorldCoordinate(0, 128)).toBe(0);
  });
});
