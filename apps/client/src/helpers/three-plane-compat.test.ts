import { Plane, Vector3 } from 'three';

import { describe, expect, test } from 'bun:test';

import { ensurePlaneToArrayCompat } from '@/helpers/three-plane-compat';

describe('three plane compat', () => {
  test('adds Plane.toArray support for vec4 uniform uploads', () => {
    ensurePlaneToArrayCompat();

    const plane = new Plane(new Vector3(1, 2, 3), 4) as Plane & {
      toArray: (array?: Float32Array, offset?: number) => Float32Array;
    };
    const values = plane.toArray(new Float32Array(4));

    expect(Array.from(values)).toEqual([1, 2, 3, 4]);
  });
});
