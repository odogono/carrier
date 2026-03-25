export const TAP_MAX_DURATION_MS = 200;
export const TAP_MAX_MOVEMENT_PX = 8;

export type PointerTapCandidate = {
  clientX: number;
  clientY: number;
  timeStamp: number;
};

export type PointerTapPayload = {
  clientX: number;
  clientY: number;
};

export const isQuickTapGesture = (
  candidate: PointerTapCandidate,
  payload: PointerTapPayload,
  timeStamp: number,
  maxDurationMs = TAP_MAX_DURATION_MS,
  maxMovementPx = TAP_MAX_MOVEMENT_PX
) => {
  const durationMs = timeStamp - candidate.timeStamp;
  const dx = payload.clientX - candidate.clientX;
  const dy = payload.clientY - candidate.clientY;

  return (
    durationMs <= maxDurationMs &&
    dx * dx + dy * dy <= maxMovementPx * maxMovementPx
  );
};
