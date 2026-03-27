import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_SCENE_CONFIG,
  LANDSCAPE_CLIP_SCALE_MAX,
  LANDSCAPE_CLIP_SCALE_MIN
} from '@/helpers/zarch-scene-config';

describe('zarch scene config', () => {
  test('keeps expanded landscape clipping opt-in by default', () => {
    expect(DEFAULT_SCENE_CONFIG.landscapeClipScale).toBe(1);
    expect(DEFAULT_SCENE_CONFIG.landscapeClipScale).toBeGreaterThanOrEqual(
      LANDSCAPE_CLIP_SCALE_MIN
    );
    expect(DEFAULT_SCENE_CONFIG.landscapeClipScale).toBeLessThanOrEqual(
      LANDSCAPE_CLIP_SCALE_MAX
    );
  });
});
