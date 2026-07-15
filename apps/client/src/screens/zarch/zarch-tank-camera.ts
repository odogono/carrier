type HorizontalPoint = { x: number; z: number };

export const stepTankCameraFocus = ({
  current,
  damping,
  deltaSeconds,
  leadSeconds,
  maxLeadMeters,
  position,
  sceneScale,
  velocity
}: {
  current: HorizontalPoint;
  damping: number;
  deltaSeconds: number;
  leadSeconds: number;
  maxLeadMeters: number;
  position: HorizontalPoint;
  sceneScale: number;
  velocity: HorizontalPoint;
}): HorizontalPoint => {
  const rawLeadX = velocity.x * leadSeconds;
  const rawLeadZ = velocity.z * leadSeconds;
  const rawLeadLength = Math.hypot(rawLeadX, rawLeadZ);
  const leadScale =
    rawLeadLength > maxLeadMeters ? maxLeadMeters / rawLeadLength : 1;
  const targetX = (position.x + rawLeadX * leadScale) * sceneScale;
  const targetZ = (position.z + rawLeadZ * leadScale) * sceneScale;
  const alpha = 1 - Math.exp(-damping * Math.max(deltaSeconds, 0));

  return {
    x: current.x + (targetX - current.x) * alpha,
    z: current.z + (targetZ - current.z) * alpha
  };
};
