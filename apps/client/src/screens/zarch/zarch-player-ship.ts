import { LANDING_PAD_ZARCH_TILE_TYPE_ID, TILE } from '@/helpers/zarch-terrain';

import type { ZarchShipState } from './use-zarch-runtime';

export const PLAYER_SHIP_LENGTH = 18;

export type PlayerShipInput = {
  pitchDown: boolean;
  pitchUp: boolean;
  thrust: boolean;
  yawLeft: boolean;
  yawRight: boolean;
};

export type PlayerShipProbe = {
  x: number;
  y: number;
  z: number;
};

export type PlayerShipPose = Pick<
  ZarchShipState,
  'pitch' | 'x' | 'y' | 'yaw' | 'z'
>;

export type PlayerShipSpec = {
  collisionRadius: number;
  gravity: number;
  landingHorizontalSpeedMax: number;
  landingPitchMax: number;
  landingSupportHeightDeltaMax: number;
  landingVerticalSpeedMax: number;
  linearDrag: number;
  maxPitch: number;
  pitchDamping: number;
  pitchRate: number;
  probeOffsets: PlayerShipProbe[];
  respawnClearance: number;
  respawnDelaySeconds: number;
  spawnGraceSeconds: number;
  thrustAcceleration: number;
  verticalDrag: number;
  yawRate: number;
};

export type PlayerShipSurface = {
  getTileTypeIdAtWorld: (worldX: number, worldZ: number) => string;
  isWaterAtWorld: (worldX: number, worldZ: number) => boolean;
  isWorldPointLoaded: (worldX: number, worldZ: number) => boolean;
  sampleHeightAtWorld: (worldX: number, worldZ: number) => number | null;
  waterHeight: number;
};

export type PlayerShipStepEvent =
  | {
      kind: 'crash';
      water: boolean;
      x: number;
      y: number;
      z: number;
    }
  | {
      kind: 'blocked';
    };

export type PlayerShipStepResult = {
  event: PlayerShipStepEvent | null;
  state: ZarchShipState;
};

export const DEFAULT_PLAYER_SHIP_SPEC: PlayerShipSpec = {
  collisionRadius: TILE * 0.28,
  gravity: 22,
  landingHorizontalSpeedMax: 8,
  landingPitchMax: 0.35,
  landingSupportHeightDeltaMax: 2,
  landingVerticalSpeedMax: 12,
  linearDrag: 0.45,
  maxPitch: 1.3,
  pitchDamping: 2.8,
  pitchRate: 1.8,
  probeOffsets: [
    { x: 0, y: -1.2, z: 0 },
    { x: 0, y: -0.6, z: -5.5 },
    { x: 0, y: -0.6, z: 5 },
    { x: -3.2, y: -0.8, z: -1.2 },
    { x: 3.2, y: -0.8, z: -1.2 }
  ],
  respawnClearance: 48,
  respawnDelaySeconds: 1.25,
  spawnGraceSeconds: 0.75,
  thrustAcceleration: 130,
  verticalDrag: 0.18,
  yawRate: 1.75
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const rotateLocalProbe = (
  probe: PlayerShipProbe,
  yaw: number,
  pitch: number
) => {
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const pitchedY = probe.y * cosPitch - probe.z * sinPitch;
  const pitchedZ = probe.y * sinPitch + probe.z * cosPitch;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  return {
    x: probe.x * cosYaw + pitchedZ * sinYaw,
    y: pitchedY,
    z: -probe.x * sinYaw + pitchedZ * cosYaw
  };
};

export const getPlayerShipThrustVector = (yaw: number, pitch: number) =>
  rotateLocalProbe(
    {
      x: 0,
      y: 1,
      z: 0
    },
    yaw,
    pitch
  );

export const getPlayerShipExhaustDirection = (yaw: number, pitch: number) => {
  const thrust = getPlayerShipThrustVector(yaw, pitch);

  return {
    x: -thrust.x,
    y: -thrust.y,
    z: -thrust.z
  };
};

export const getPlayerShipNoseDirection = (yaw: number, pitch: number) =>
  rotateLocalProbe(
    {
      x: 0,
      y: 0,
      z: -1
    },
    yaw,
    pitch
  );

export const getPlayerShipExhaustOrigin = (
  ship: PlayerShipPose,
  offset: PlayerShipProbe = { x: 0, y: 0, z: 0 }
) => {
  const rotated = rotateLocalProbe(offset, ship.yaw, ship.pitch);

  return {
    x: ship.x + rotated.x,
    y: ship.y + rotated.y,
    z: ship.z + rotated.z
  };
};

export const getPlayerShipNoseOrigin = (ship: PlayerShipPose, offset = 9.5) =>
  getPlayerShipExhaustOrigin(ship, {
    x: 0,
    y: 0,
    z: -offset
  });

export const createPlayerShipSpawnState = ({
  spec = DEFAULT_PLAYER_SHIP_SPEC,
  surface,
  x,
  yaw = 0,
  z
}: {
  spec?: Pick<PlayerShipSpec, 'respawnClearance' | 'spawnGraceSeconds'>;
  surface: Pick<PlayerShipSurface, 'sampleHeightAtWorld' | 'waterHeight'>;
  x: number;
  yaw?: number;
  z: number;
}): ZarchShipState => {
  const terrainHeight =
    surface.sampleHeightAtWorld(x, z) ?? surface.waterHeight;
  const spawnY =
    Math.max(terrainHeight, surface.waterHeight) + spec.respawnClearance;

  return {
    landed: false,
    pitch: 0,
    respawnDelaySeconds: 0,
    respawnX: x,
    respawnY: spawnY,
    respawnZ: z,
    spawnGraceSeconds: spec.spawnGraceSeconds,
    velX: 0,
    velY: 0,
    velZ: 0,
    x,
    y: spawnY,
    yaw,
    z
  };
};

export const stepPlayerShip = ({
  deltaSeconds,
  input,
  spec = DEFAULT_PLAYER_SHIP_SPEC,
  state,
  surface
}: {
  deltaSeconds: number;
  input: PlayerShipInput;
  spec?: PlayerShipSpec;
  state: ZarchShipState;
  surface: PlayerShipSurface;
}): PlayerShipStepResult => {
  const dt = Math.min(deltaSeconds, 0.05);
  const next: ZarchShipState = {
    ...state
  };

  if (next.respawnDelaySeconds > 0) {
    next.respawnDelaySeconds = Math.max(0, next.respawnDelaySeconds - dt);

    if (next.respawnDelaySeconds > 0) {
      return {
        event: null,
        state: next
      };
    }

    const respawnState = createPlayerShipSpawnState({
      spec,
      surface,
      x: state.respawnX,
      yaw: state.yaw,
      z: state.respawnZ
    });

    return {
      event: null,
      state: {
        ...respawnState,
        respawnX: state.respawnX,
        respawnY: state.respawnY,
        respawnZ: state.respawnZ
      }
    };
  }

  if (next.landed) {
    next.pitch = 0;
    next.velX = 0;
    next.velY = 0;
    next.velZ = 0;

    if (!input.thrust) {
      return {
        event: null,
        state: next
      };
    }

    next.landed = false;
  }

  const pitchInput = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0);
  const yawInput = (input.yawLeft ? 1 : 0) - (input.yawRight ? 1 : 0);

  next.yaw += yawInput * spec.yawRate * dt;
  next.pitch = clamp(
    next.pitch + pitchInput * spec.pitchRate * dt,
    -spec.maxPitch,
    spec.maxPitch
  );

  if (pitchInput === 0) {
    next.pitch *= Math.max(0, 1 - spec.pitchDamping * dt);
  }

  const thrustVector = getPlayerShipThrustVector(next.yaw, next.pitch);

  if (input.thrust) {
    next.velX += thrustVector.x * spec.thrustAcceleration * dt;
    next.velY += thrustVector.y * spec.thrustAcceleration * dt;
    next.velZ += thrustVector.z * spec.thrustAcceleration * dt;
  }

  next.velY -= spec.gravity * dt;

  const horizontalDrag = Math.max(0, 1 - spec.linearDrag * dt);
  const verticalDrag = Math.max(0, 1 - spec.verticalDrag * dt);

  next.velX *= horizontalDrag;
  next.velY *= verticalDrag;
  next.velZ *= horizontalDrag;
  next.x += next.velX * dt;
  next.y += next.velY * dt;
  next.z += next.velZ * dt;
  next.spawnGraceSeconds = Math.max(0, next.spawnGraceSeconds - dt);

  let hasContact = false;
  let firstContactWater = false;
  let firstContactX = 0;
  let firstContactY = 0;
  let firstContactZ = 0;
  let minSupport = Infinity;
  let maxSupport = -Infinity;
  let allContactDry = true;
  let allProbeLandingPad = true;

  for (const probe of spec.probeOffsets) {
    const rotated = rotateLocalProbe(probe, next.yaw, next.pitch);
    const probeX = next.x + rotated.x;
    const probeY = next.y + rotated.y;
    const probeZ = next.z + rotated.z;

    if (!surface.isWorldPointLoaded(probeX, probeZ)) {
      return {
        event: { kind: 'blocked' },
        state: {
          ...state,
          velX: 0,
          velY: 0,
          velZ: 0
        }
      };
    }

    const terrainHeight = surface.sampleHeightAtWorld(probeX, probeZ);

    if (terrainHeight === null) {
      return {
        event: { kind: 'blocked' },
        state: {
          ...state,
          velX: 0,
          velY: 0,
          velZ: 0
        }
      };
    }

    const water = surface.isWaterAtWorld(probeX, probeZ);
    const collisionHeight = water ? surface.waterHeight : terrainHeight;

    if (terrainHeight < minSupport) minSupport = terrainHeight;
    if (terrainHeight > maxSupport) maxSupport = terrainHeight;
    if (surface.getTileTypeIdAtWorld(probeX, probeZ) !== LANDING_PAD_ZARCH_TILE_TYPE_ID) {
      allProbeLandingPad = false;
    }

    if (next.spawnGraceSeconds <= 0 && probeY <= collisionHeight) {
      if (!hasContact) {
        firstContactWater = water;
        firstContactX = probeX;
        firstContactY = collisionHeight;
        firstContactZ = probeZ;
      }
      hasContact = true;
      if (water) allContactDry = false;
    }
  }

  if (hasContact) {
    const downwardSpeed = Math.max(0, -next.velY);
    const horizontalSpeed = Math.hypot(next.velX, next.velZ);
    const safeLanding =
      allContactDry &&
      allProbeLandingPad &&
      maxSupport - minSupport <= spec.landingSupportHeightDeltaMax &&
      downwardSpeed <= spec.landingVerticalSpeedMax &&
      horizontalSpeed <= spec.landingHorizontalSpeedMax &&
      Math.abs(next.pitch) <= spec.landingPitchMax;

    if (safeLanding) {
      const clearance = Math.abs(spec.probeOffsets[0]?.y ?? 0);

      return {
        event: null,
        state: {
          ...next,
          landed: true,
          pitch: 0,
          spawnGraceSeconds: 0,
          velX: 0,
          velY: 0,
          velZ: 0,
          y: (minSupport + maxSupport) * 0.5 + clearance
        }
      };
    }

    return {
      event: {
        kind: 'crash',
        water: firstContactWater,
        x: firstContactX,
        y: firstContactY,
        z: firstContactZ
      },
      state: {
        ...next,
        respawnDelaySeconds: spec.respawnDelaySeconds,
        spawnGraceSeconds: 0,
        velX: 0,
        velY: 0,
        velZ: 0,
        x: firstContactX,
        y: firstContactY,
        z: firstContactZ
      }
    };
  }

  return {
    event: null,
    state: next
  };
};
