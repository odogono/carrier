/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import { getWorldAlignedNavigationAcceleration } from './zarch-navigation';

describe('zarch scene navigation controls', () => {
  test('moves forward and backward along fixed map z', () => {
    expect(
      getWorldAlignedNavigationAcceleration({
        keys: { ArrowUp: true }
      })
    ).toEqual({ ax: 0, az: 1 });

    expect(
      getWorldAlignedNavigationAcceleration({
        keys: { s: true }
      })
    ).toEqual({ ax: 0, az: -1 });
  });

  test('moves sideways along fixed map x', () => {
    expect(
      getWorldAlignedNavigationAcceleration({
        keys: { a: true }
      })
    ).toEqual({ ax: 1, az: 0 });

    expect(
      getWorldAlignedNavigationAcceleration({
        keys: { ArrowRight: true }
      })
    ).toEqual({ ax: -1, az: 0 });
  });

  test('combines map-aligned movement keys without camera orientation input', () => {
    expect(
      getWorldAlignedNavigationAcceleration({
        keys: { ArrowUp: true, d: true }
      })
    ).toEqual({ ax: -1, az: 1 });
  });
});
