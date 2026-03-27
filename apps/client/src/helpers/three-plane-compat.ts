import { Plane } from 'three';

type PlaneWithToArray = Plane & {
  toArray: (
    array?: number[] | Float32Array,
    offset?: number
  ) => number[] | Float32Array;
};

export const ensurePlaneToArrayCompat = () => {
  const prototype = Plane.prototype as unknown as Partial<PlaneWithToArray>;

  if (typeof prototype.toArray === 'function') {
    return;
  }

  prototype.toArray = function (
    this: Plane,
    array: number[] | Float32Array = [],
    offset = 0
  ) {
    this.normal.toArray(array, offset);
    array[offset + 3] = this.constant;
    return array;
  };
};
