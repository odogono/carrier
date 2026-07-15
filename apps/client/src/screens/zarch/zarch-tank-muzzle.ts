import { Vector3, type Object3D } from 'three';

export type TankMuzzlePose = Readonly<{
  direction: Readonly<[number, number, number]>;
  position: Readonly<[number, number, number]>;
}>;

export const resolveTankMuzzlePose = ({
  muzzle,
  sceneScale,
  tankPhysicsPosition,
  tankRoot
}: {
  muzzle: Object3D;
  sceneScale: number;
  tankPhysicsPosition: Readonly<[number, number, number]>;
  tankRoot: Object3D;
}): TankMuzzlePose => {
  tankRoot.updateWorldMatrix(true, true);

  const rootPosition = tankRoot.getWorldPosition(new Vector3());
  const muzzlePosition = muzzle.getWorldPosition(new Vector3());
  const renderedDirection = new Vector3(0, 0, -1).transformDirection(
    muzzle.matrixWorld
  );
  const direction = new Vector3(
    renderedDirection.x / sceneScale,
    renderedDirection.y,
    renderedDirection.z / sceneScale
  ).normalize();

  return {
    direction: [direction.x, direction.y, direction.z],
    position: [
      tankPhysicsPosition[0] + (muzzlePosition.x - rootPosition.x) / sceneScale,
      tankPhysicsPosition[1] + muzzlePosition.y - rootPosition.y,
      tankPhysicsPosition[2] + (muzzlePosition.z - rootPosition.z) / sceneScale
    ]
  };
};
