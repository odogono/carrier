import {
  MotionQuality,
  MotionType,
  box,
  dof,
  rigidBody,
  sphere,
  updateWorld,
  type BodyId,
  type Listener,
  type RigidBody
} from 'crashcat';

import type { ZarchPhysicsWorld } from './zarch-physics-world';

export const TANK_TURRET_LIMIT_RADIANS = Math.PI / 2;
export const TANK_TURRET_TRAVERSE_RADIANS_PER_SECOND = (Math.PI * 2) / 3;
export const TANK_SHELL_SPEED_METERS_PER_SECOND = 120;
export const TANK_SHELL_LIFETIME_SECONDS = 5;
export const TANK_SHELL_CAPACITY = 16;
export const TANK_FIRE_COOLDOWN_SECONDS = 0.5;
export const TANK_CANNON_ELEVATION_RADIANS = (6 * Math.PI) / 180;

const wrapAngle = (angle: number) =>
  Math.atan2(Math.sin(angle), Math.cos(angle));

export const clampTankTurretYaw = (yaw: number) =>
  Math.max(
    -TANK_TURRET_LIMIT_RADIANS,
    Math.min(TANK_TURRET_LIMIT_RADIANS, wrapAngle(yaw))
  );

export const stepTankTurretYaw = (
  current: number,
  desired: number,
  deltaSeconds: number
) => {
  const target = clampTankTurretYaw(desired);
  const delta = target - current;
  const maxStep = TANK_TURRET_TRAVERSE_RADIANS_PER_SECOND * deltaSeconds;
  return current + Math.max(-maxStep, Math.min(maxStep, delta));
};

type TankSurface = {
  isTileLoaded: (tileX: number, tileZ: number) => boolean;
  isWaterTile: (tileX: number, tileZ: number) => boolean;
  sampleHeightAtWorld: (x: number, z: number) => number | null;
  sampleNormalAtWorld: (
    x: number,
    z: number
  ) => { x: number; y: number; z: number } | null;
};

export const findNearestTankSpawn = ({
  isObstacleFree,
  surface,
  tileMeters,
  x,
  z
}: {
  isObstacleFree?: (x: number, z: number) => boolean;
  surface: TankSurface;
  tileMeters: number;
  x: number;
  z: number;
}) => {
  const originX = Math.floor(x / tileMeters);
  const originZ = Math.floor(z / tileMeters);

  for (let radius = 0; radius <= 64; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) {
          continue;
        }
        const tileX = originX + dx;
        const tileZ = originZ + dz;
        const worldX = (tileX + 0.5) * tileMeters;
        const worldZ = (tileZ + 0.5) * tileMeters;
        const normal = surface.sampleNormalAtWorld(worldX, worldZ);
        const height = surface.sampleHeightAtWorld(worldX, worldZ);
        if (
          !surface.isTileLoaded(tileX, tileZ) ||
          surface.isWaterTile(tileX, tileZ) ||
          height === null ||
          !normal ||
          normal.y < Math.cos((25 * Math.PI) / 180) ||
          (isObstacleFree && !isObstacleFree(worldX, worldZ))
        ) {
          continue;
        }
        return { x: worldX, y: height + 1.6, z: worldZ };
      }
    }
  }

  return null;
};

export type TankShellState = {
  bodyId: BodyId;
  id: number;
  lifetimeSeconds: number;
};

export type PlayerTankSimulation = {
  accumulatorSeconds: number;
  bodyId: BodyId;
  fireCooldownSeconds: number;
  nextShellId: number;
  shells: TankShellState[];
  turretYaw: number;
};

export const createPlayerTankSimulation = ({
  physics,
  x,
  y,
  yaw,
  z
}: {
  physics: ZarchPhysicsWorld;
  x: number;
  y: number;
  yaw: number;
  z: number;
}): PlayerTankSimulation => {
  const body = rigidBody.create(physics.world, {
    allowedDegreesOfFreedom: dof(true, true, true, false, true, false),
    allowSleeping: false,
    angularDamping: 8,
    friction: 0.3,
    linearDamping: 0.15,
    mass: 2400,
    maxAngularVelocity: Math.PI,
    maxLinearVelocity: 18,
    motionType: MotionType.DYNAMIC,
    objectLayer: physics.layers.tank,
    position: [x, y, z],
    quaternion: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    shape: box.create({ halfExtents: [2.1, 1.4, 3.4] }),
    userData: { id: 'player', kind: 'tank' }
  });
  return {
    accumulatorSeconds: 0,
    bodyId: body.id,
    fireCooldownSeconds: 0,
    nextShellId: 1,
    shells: [],
    turretYaw: 0
  };
};

const removeBody = (physics: ZarchPhysicsWorld, bodyId: BodyId) => {
  const body = rigidBody.get(physics.world, bodyId);
  if (body) {rigidBody.remove(physics.world, body);}
};

export const destroyPlayerTankSimulation = (
  physics: ZarchPhysicsWorld,
  simulation: PlayerTankSimulation
) => {
  removeBody(physics, simulation.bodyId);
  for (const shell of simulation.shells) {removeBody(physics, shell.bodyId);}
  simulation.shells = [];
};

export const stepPlayerTankSimulation = ({
  aimWorld,
  deltaSeconds,
  fire,
  forward,
  physics,
  simulation,
  steer,
  tractionFactor = 1
}: {
  aimWorld: { x: number; z: number } | null;
  deltaSeconds: number;
  fire: boolean;
  forward: number;
  physics: ZarchPhysicsWorld;
  simulation: PlayerTankSimulation;
  steer: number;
  tractionFactor?: number;
}) => {
  const tank = rigidBody.get(physics.world, simulation.bodyId);
  if (!tank) {return;}
  const yaw = 2 * Math.atan2(tank.quaternion[1], tank.quaternion[3]);
  if (aimWorld) {
    const aimYaw = Math.atan2(
      -(aimWorld.x - tank.position[0]),
      -(aimWorld.z - tank.position[2])
    );
    simulation.turretYaw = stepTankTurretYaw(
      simulation.turretYaw,
      wrapAngle(aimYaw - yaw),
      Math.min(deltaSeconds, 0.1)
    );
  }
  simulation.fireCooldownSeconds = Math.max(
    0,
    simulation.fireCooldownSeconds - deltaSeconds
  );
  simulation.accumulatorSeconds += Math.min(deltaSeconds, 0.1);
  const hitShellIds = new Set<number>();
  const listener: Listener = {
    onContactAdded: (a, b) => {
      for (const body of [a, b]) {
        const owner = body.userData as { id?: number; kind?: string } | null;
        if (owner?.kind === 'shell' && typeof owner.id === 'number') {
          hitShellIds.add(owner.id);
        }
      }
    }
  };
  let steps = 0;
  while (simulation.accumulatorSeconds >= 1 / 60 && steps < 5) {
    const speed = tank.motionProperties.linearVelocity;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const forwardSpeed = speed[0] * forwardX + speed[2] * forwardZ;
    const targetSpeed =
      (forward >= 0 ? forward * 14 : forward * 7) * tractionFactor;
    const acceleration =
      Math.abs(targetSpeed) < Math.abs(forwardSpeed) ? 10 : 8;
    const desiredDelta = Math.max(
      -acceleration / 60,
      Math.min(acceleration / 60, targetSpeed - forwardSpeed)
    );
    rigidBody.setLinearVelocity(physics.world, tank, [
      forwardX * (forwardSpeed + desiredDelta),
      speed[1],
      forwardZ * (forwardSpeed + desiredDelta)
    ]);
    rigidBody.setAngularVelocity(physics.world, tank, [
      0,
      (steer * Math.PI) / 2,
      0
    ]);
    updateWorld(physics.world, listener, 1 / 60);
    simulation.accumulatorSeconds -= 1 / 60;
    steps += 1;
  }
  if (steps === 5) {simulation.accumulatorSeconds = 0;}

  if (
    fire &&
    aimWorld &&
    simulation.fireCooldownSeconds === 0 &&
    simulation.shells.length < TANK_SHELL_CAPACITY
  ) {
    const barrelYaw = yaw + simulation.turretYaw;
    const horizontal = Math.cos(TANK_CANNON_ELEVATION_RADIANS);
    const direction = [
      -Math.sin(barrelYaw) * horizontal,
      Math.sin(TANK_CANNON_ELEVATION_RADIANS),
      -Math.cos(barrelYaw) * horizontal
    ] as const;
    const id = simulation.nextShellId++;
    const shell = rigidBody.create(physics.world, {
      allowSleeping: false,
      mass: 8,
      motionQuality: MotionQuality.LINEAR_CAST,
      motionType: MotionType.DYNAMIC,
      objectLayer: physics.layers.shell,
      position: [
        tank.position[0] + direction[0] * 4.8,
        tank.position[1] + 1.4 + direction[1] * 4.8,
        tank.position[2] + direction[2] * 4.8
      ],
      shape: sphere.create({ radius: 0.12 }),
      userData: { id, kind: 'shell' }
    });
    rigidBody.setLinearVelocity(physics.world, shell, [
      direction[0] * TANK_SHELL_SPEED_METERS_PER_SECOND +
        tank.motionProperties.linearVelocity[0],
      direction[1] * TANK_SHELL_SPEED_METERS_PER_SECOND +
        tank.motionProperties.linearVelocity[1],
      direction[2] * TANK_SHELL_SPEED_METERS_PER_SECOND +
        tank.motionProperties.linearVelocity[2]
    ]);
    simulation.shells.push({ bodyId: shell.id, id, lifetimeSeconds: 0 });
    simulation.fireCooldownSeconds = TANK_FIRE_COOLDOWN_SECONDS;
  }

  simulation.shells = simulation.shells.filter(shell => {
    shell.lifetimeSeconds += deltaSeconds;
    if (
      hitShellIds.has(shell.id) ||
      shell.lifetimeSeconds >= TANK_SHELL_LIFETIME_SECONDS
    ) {
      removeBody(physics, shell.bodyId);
      return false;
    }
    return true;
  });
};

export const getPlayerTankBody = (
  physics: ZarchPhysicsWorld,
  simulation: PlayerTankSimulation
): RigidBody | null => rigidBody.get(physics.world, simulation.bodyId) ?? null;
