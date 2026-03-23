/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import {
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVEMENT_PX,
  isQuickTapGesture
} from './zarch-pointer';

describe('zarch pointer tap classification', () => {
  test('accepts a short press with minimal travel as a tap', () => {
    expect(
      isQuickTapGesture(
        {
          clientX: 100,
          clientY: 200,
          timeStamp: 1000
        },
        {
          clientX: 100 + TAP_MAX_MOVEMENT_PX,
          clientY: 200
        },
        1000 + TAP_MAX_DURATION_MS
      )
    ).toBe(true);
  });

  test('rejects a gesture that lasts too long', () => {
    expect(
      isQuickTapGesture(
        {
          clientX: 100,
          clientY: 200,
          timeStamp: 1000
        },
        {
          clientX: 100,
          clientY: 200
        },
        1000 + TAP_MAX_DURATION_MS + 1
      )
    ).toBe(false);
  });

  test('rejects a gesture that moves too far', () => {
    expect(
      isQuickTapGesture(
        {
          clientX: 100,
          clientY: 200,
          timeStamp: 1000
        },
        {
          clientX: 100 + TAP_MAX_MOVEMENT_PX + 1,
          clientY: 200
        },
        1000 + TAP_MAX_DURATION_MS
      )
    ).toBe(false);
  });
});
