import {
  Box3,
  Group,
  type Object3D,
  Vector3
} from 'three';

export type NormalizedPreviewModel = {
  object: Group;
  size: Vector3;
};

export const createNormalizedPreviewModel = (
  source: Object3D
): NormalizedPreviewModel => {
  const clone = source.clone(true);
  const group = new Group();
  group.add(clone);

  const bounds = new Box3().setFromObject(group);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());

  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= bounds.min.y;

  return {
    object: group,
    size
  };
};
