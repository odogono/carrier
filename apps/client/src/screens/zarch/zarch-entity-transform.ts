import { MathUtils } from 'three';

export type EntityWorldPoint = {
  x: number;
  z: number;
};

const getWorldAngleDegrees = (
  center: EntityWorldPoint,
  point: EntityWorldPoint
) => MathUtils.radToDeg(Math.atan2(point.z - center.z, point.x - center.x));

const getWorldDistance = (a: EntityWorldPoint, b: EntityWorldPoint) =>
  Math.hypot(a.x - b.x, a.z - b.z);

export const normalizeEntityYaw = (yaw: number) =>
  MathUtils.euclideanModulo(yaw, 360);

export const getEntityDragPosition = ({
  currentPointer,
  startEntityPosition,
  startPointer
}: {
  currentPointer: EntityWorldPoint;
  startEntityPosition: EntityWorldPoint;
  startPointer: EntityWorldPoint;
}): EntityWorldPoint => ({
  x: startEntityPosition.x + currentPointer.x - startPointer.x,
  z: startEntityPosition.z + currentPointer.z - startPointer.z
});

export const getEntityRotateYaw = ({
  center,
  currentPointer,
  startPointer,
  startYaw
}: {
  center: EntityWorldPoint;
  currentPointer: EntityWorldPoint;
  startPointer: EntityWorldPoint;
  startYaw: number;
}) =>
  normalizeEntityYaw(
    startYaw +
      getWorldAngleDegrees(center, currentPointer) -
      getWorldAngleDegrees(center, startPointer)
  );

export const getEntityHandleScale = ({
  center,
  currentPointer,
  startPointer,
  startScale
}: {
  center: EntityWorldPoint;
  currentPointer: EntityWorldPoint;
  startPointer: EntityWorldPoint;
  startScale: number;
}) => {
  const startDistance = getWorldDistance(center, startPointer);

  if (startDistance <= 0 || !Number.isFinite(startDistance)) {
    return startScale;
  }

  const nextScale =
    startScale * (getWorldDistance(center, currentPointer) / startDistance);

  return Math.max(Number.isFinite(nextScale) ? nextScale : startScale, 0.1);
};
