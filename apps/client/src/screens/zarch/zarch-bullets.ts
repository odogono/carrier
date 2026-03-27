import { TILE } from '@/helpers/zarch-terrain';

import type { ZarchShipState } from './use-zarch-runtime';
import {
  PLAYER_SHIP_LENGTH,
  getPlayerShipNoseDirection,
  getPlayerShipNoseOrigin
} from './zarch-player-ship';

export const ZARCH_BULLET_CAPACITY = 64;

export type ZarchBulletState = {
  age: number;
  maxAge: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  vx: number;
  vy: number;
  vz: number;
  x: number;
  y: number;
  z: number;
};

export type ZarchBulletSurface = {
  isWaterAtWorld: (worldX: number, worldZ: number) => boolean;
  isWorldPointLoaded: (worldX: number, worldZ: number) => boolean;
  sampleHeightAtWorld: (worldX: number, worldZ: number) => number | null;
  waterHeight: number;
};

export type ZarchBulletStepEvent =
  | {
      kind: 'blocked' | 'expired';
    }
  | {
      kind: 'land' | 'water';
      x: number;
      y: number;
      z: number;
    };

export type ZarchBulletStepResult = {
  event: ZarchBulletStepEvent | null;
  state: ZarchBulletState | null;
};

export type ZarchBulletSpec = {
  collisionSampleStep: number;
  fireCooldownSeconds: number;
  maxAgeSeconds: number;
  muzzleOffset: number;
  speed: number;
};

export const DEFAULT_ZARCH_BULLET_SPEC: ZarchBulletSpec = {
  collisionSampleStep: TILE * 0.35,
  fireCooldownSeconds: 0.12,
  maxAgeSeconds: 1.5,
  muzzleOffset: PLAYER_SHIP_LENGTH * 0.53,
  speed: 320
};

const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

export const createShipBullet = ({
  ship,
  spec = DEFAULT_ZARCH_BULLET_SPEC
}: {
  ship: ZarchShipState;
  spec?: ZarchBulletSpec;
}): ZarchBulletState => {
  const origin = getPlayerShipNoseOrigin(ship, spec.muzzleOffset);
  const direction = getPlayerShipNoseDirection(ship.yaw, ship.pitch);

  return {
    age: 0,
    maxAge: spec.maxAgeSeconds,
    prevX: origin.x,
    prevY: origin.y,
    prevZ: origin.z,
    vx: direction.x * spec.speed + ship.velX,
    vy: direction.y * spec.speed + ship.velY,
    vz: direction.z * spec.speed + ship.velZ,
    x: origin.x,
    y: origin.y,
    z: origin.z
  };
};

export const stepZarchBullet = ({
  adjustWorldPoint = point => point,
  deltaSeconds,
  spec = DEFAULT_ZARCH_BULLET_SPEC,
  state,
  surface
}: {
  adjustWorldPoint?: (point: { x: number; z: number }) => { x: number; z: number };
  deltaSeconds: number;
  spec?: ZarchBulletSpec;
  state: ZarchBulletState;
  surface: ZarchBulletSurface;
}): ZarchBulletStepResult => {
  const dt = Math.min(deltaSeconds, 0.05);
  const previousX = state.x;
  const previousY = state.y;
  const previousZ = state.z;
  const nextAge = state.age + dt;

  if (nextAge >= state.maxAge) {
    return {
      event: { kind: 'expired' },
      state: null
    };
  }

  const adjusted = adjustWorldPoint({
    x: state.x + state.vx * dt,
    z: state.z + state.vz * dt
  });
  const next = {
    ...state,
    age: nextAge,
    prevX: previousX,
    prevY: previousY,
    prevZ: previousZ,
    x: adjusted.x,
    y: state.y + state.vy * dt,
    z: adjusted.z
  };
  const pathDistance = Math.hypot(
    next.x - previousX,
    next.y - previousY,
    next.z - previousZ
  );
  const sampleCount = Math.max(
    1,
    Math.ceil(pathDistance / Math.max(spec.collisionSampleStep, 0.001))
  );

  for (let index = 1; index <= sampleCount; index += 1) {
    const t = index / sampleCount;
    const sampleX = lerp(previousX, next.x, t);
    const sampleY = lerp(previousY, next.y, t);
    const sampleZ = lerp(previousZ, next.z, t);

    if (!surface.isWorldPointLoaded(sampleX, sampleZ)) {
      return {
        event: { kind: 'blocked' },
        state: null
      };
    }

    const terrainHeight = surface.sampleHeightAtWorld(sampleX, sampleZ);

    if (terrainHeight === null) {
      return {
        event: { kind: 'blocked' },
        state: null
      };
    }

    const water = surface.isWaterAtWorld(sampleX, sampleZ);
    const collisionHeight = water ? surface.waterHeight : terrainHeight;

    if (sampleY <= collisionHeight) {
      return {
        event: {
          kind: water ? 'water' : 'land',
          x: sampleX,
          y: collisionHeight,
          z: sampleZ
        },
        state: null
      };
    }
  }

  return {
    event: null,
    state: next
  };
};
