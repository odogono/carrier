import {
  MotionQuality,
  MotionType,
  box,
  dof,
  getWorldSpaceContactPointOnA,
  getWorldSpaceContactPointOnB,
  rigidBody,
  sphere,
  updateWorld,
  type BodyId,
  type ContactManifold,
  type Listener,
  type RigidBody
} from 'crashcat';

import {
  isZarchShellColliderOwner,
  type ZarchPhysicsOwner,
  type ZarchPhysicsWorld,
  type ZarchShellColliderOwner
} from './zarch-physics-world';
import type { TankMuzzlePose } from './zarch-tank-muzzle';

export const TANK_TURRET_LIMIT_RADIANS = Math.PI / 2;
export const TANK_TURRET_TRAVERSE_RADIANS_PER_SECOND = (Math.PI * 2) / 3;
export const TANK_SHELL_SPEED_METERS_PER_SECOND = 120;
export const TANK_SHELL_LIFETIME_SECONDS = 5;
export const TANK_SHELL_CAPACITY = 16;
export const TANK_FIRE_COOLDOWN_SECONDS = 0.5;

const TANK_MASS_KILOGRAMS = 2400;
const TANK_GRAVITY_METERS_PER_SECOND_SQUARED = 9.81;

type TankQuaternion = [number, number, number, number];
type TankVector = [number, number, number];

export type TankDynamicsConfig = {
  airborneUprightStrength: number;
  cameraDamping: number;
  cameraLeadSeconds: number;
  cameraMaxLeadMeters: number;
  driveAcceleration: number;
  forwardSpeed: number;
  lateralGrip: number;
  reverseSpeed: number;
  suspensionDampingRatio: number;
  suspensionFrequencyHertz: number;
  suspensionRideDistance: number;
  suspensionTravel: number;
  uprightDamping: number;
  uprightLimitRadians: number;
  uprightStrength: number;
  uprightTargetLimitRadians: number;
};

export const DEFAULT_TANK_DYNAMICS_CONFIG: TankDynamicsConfig = {
  airborneUprightStrength: 0.28,
  cameraDamping: 5,
  cameraLeadSeconds: 0.4,
  cameraMaxLeadMeters: 6,
  driveAcceleration: 8,
  forwardSpeed: 14,
  lateralGrip: 1.15,
  reverseSpeed: 7,
  suspensionDampingRatio: 0.9,
  suspensionFrequencyHertz: 1.8,
  suspensionRideDistance: 1.45,
  suspensionTravel: 0.35,
  uprightDamping: 20,
  uprightLimitRadians: (25 * Math.PI) / 180,
  uprightStrength: 200,
  uprightTargetLimitRadians: (12 * Math.PI) / 180
};

const SUSPENSION_POINTS = [
  [-1.75, 0, -2.6],
  [1.75, 0, -2.6],
  [-1.75, 0, 2.6],
  [1.75, 0, 2.6]
] as const;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const normalize = (value: Readonly<TankVector>): TankVector => {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 0
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [0, 1, 0];
};

const rotateVector = (
  vector: Readonly<TankVector>,
  quaternion: Readonly<TankQuaternion>
): TankVector => {
  const [x, y, z] = vector;
  const [qx, qy, qz, qw] = quaternion;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx
  ];
};

export const getTankHullYaw = (quaternion: Readonly<TankQuaternion>) => {
  const forward = rotateVector([0, 0, -1], quaternion);
  return Math.atan2(-forward[0], -forward[2]);
};

const velocityAtPoint = (body: RigidBody, point: Readonly<TankVector>) => {
  const offset = [
    point[0] - body.position[0],
    point[1] - body.position[1],
    point[2] - body.position[2]
  ] as const;
  const angular = body.motionProperties.angularVelocity;
  return [
    body.motionProperties.linearVelocity[0] +
      angular[1] * offset[2] -
      angular[2] * offset[1],
    body.motionProperties.linearVelocity[1] +
      angular[2] * offset[0] -
      angular[0] * offset[2],
    body.motionProperties.linearVelocity[2] +
      angular[0] * offset[1] -
      angular[1] * offset[0]
  ] as const;
};

export const getTankSlopeTraction = (slopeRadians: number) => {
  const fullTraction = (25 * Math.PI) / 180;
  const noTraction = (35 * Math.PI) / 180;
  return clamp(
    1 - (slopeRadians - fullTraction) / (noTraction - fullTraction),
    0,
    1
  );
};

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

export type TankShellImpactSurface = 'land' | 'water';

export type TankShellImpact = Readonly<{
  position: Readonly<TankVector>;
  shellId: number;
  surface: TankShellImpactSurface;
  target: Readonly<ZarchShellColliderOwner>;
}>;

export type TankSimulationStepResult = {
  impacts: readonly TankShellImpact[];
};

export type TankSuspensionContact = {
  compression: number;
  normal: TankVector | null;
  point: TankVector | null;
  supported: boolean;
};

export type TankDynamicsDiagnostics = {
  airborne: boolean;
  contacts: TankSuspensionContact[];
  recovered: boolean;
  slopeDegrees: number;
  speedMetersPerSecond: number;
  supportCount: number;
  unavailableSeconds: number;
};

type TankSupportedPose = {
  position: TankVector;
  quaternion: TankQuaternion;
};

export type PlayerTankSimulation = {
  accumulatorSeconds: number;
  bodyId: BodyId;
  diagnostics: TankDynamicsDiagnostics;
  fireCooldownSeconds: number;
  lastSupportedPose: TankSupportedPose;
  nextShellId: number;
  recoveryDiagnosticSeconds: number;
  shells: TankShellState[];
  turretYaw: number;
  unavailableSeconds: number;
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
    allowedDegreesOfFreedom: dof(true, true, true, true, true, true),
    allowSleeping: false,
    angularDamping: 0.35,
    friction: 0.15,
    linearDamping: 0.15,
    mass: TANK_MASS_KILOGRAMS,
    maxAngularVelocity: Math.PI,
    maxLinearVelocity: 18,
    motionType: MotionType.DYNAMIC,
    objectLayer: physics.layers.tank,
    position: [x, y, z],
    quaternion: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
    shape: box.create({ halfExtents: [2.1, 0.55, 3.4] }),
    userData: { id: 'player', kind: 'tank' }
  });
  return {
    accumulatorSeconds: 0,
    bodyId: body.id,
    diagnostics: {
      airborne: true,
      contacts: SUSPENSION_POINTS.map(() => ({
        compression: 0,
        normal: null,
        point: null,
        supported: false
      })),
      recovered: false,
      slopeDegrees: 0,
      speedMetersPerSecond: 0,
      supportCount: 0,
      unavailableSeconds: 0
    },
    fireCooldownSeconds: 0,
    lastSupportedPose: {
      position: [x, y, z],
      quaternion: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)]
    },
    nextShellId: 1,
    recoveryDiagnosticSeconds: 0,
    shells: [],
    turretYaw: 0,
    unavailableSeconds: 0
  };
};

const removeBody = (physics: ZarchPhysicsWorld, bodyId: BodyId) => {
  const body = rigidBody.get(physics.world, bodyId);
  if (body) {
    rigidBody.remove(physics.world, body);
  }
};

const createTankShellImpact = ({
  position,
  shellId,
  target
}: {
  position: TankVector;
  shellId: number;
  target: ZarchShellColliderOwner;
}): TankShellImpact => ({
  position,
  shellId,
  surface: target.kind === 'water-surface' ? 'water' : 'land',
  target
});

export const destroyPlayerTankSimulation = (
  physics: ZarchPhysicsWorld,
  simulation: PlayerTankSimulation
) => {
  const shellBodyIds = simulation.shells.map(shell => shell.bodyId);
  removeBody(physics, simulation.bodyId);
  for (const shell of simulation.shells) {
    removeBody(physics, shell.bodyId);
  }
  simulation.shells = [];
  return {
    shellBodyCount: shellBodyIds.filter(bodyId =>
      Boolean(rigidBody.get(physics.world, bodyId))
    ).length,
    tankBodyCount: Number(
      Boolean(rigidBody.get(physics.world, simulation.bodyId))
    )
  };
};

export const getPlayerTankTrackedBodyCounts = (
  physics: ZarchPhysicsWorld,
  simulation: PlayerTankSimulation
) => ({
  shellBodyCount: simulation.shells.filter(shell =>
    Boolean(rigidBody.get(physics.world, shell.bodyId))
  ).length,
  tankBodyCount: Number(
    Boolean(rigidBody.get(physics.world, simulation.bodyId))
  )
});

export const updatePlayerTankAim = ({
  aimWorld,
  deltaSeconds,
  physics,
  simulation
}: {
  aimWorld: { x: number; z: number } | null;
  deltaSeconds: number;
  physics: ZarchPhysicsWorld;
  simulation: PlayerTankSimulation;
}) => {
  const tank = rigidBody.get(physics.world, simulation.bodyId);
  if (!tank || !aimWorld) {
    return;
  }
  const yaw = getTankHullYaw(tank.quaternion as TankQuaternion);
  const aimYaw = Math.atan2(
    -(aimWorld.x - tank.position[0]),
    -(aimWorld.z - tank.position[2])
  );
  simulation.turretYaw = stepTankTurretYaw(
    simulation.turretYaw,
    wrapAngle(aimYaw - yaw),
    Math.min(deltaSeconds, 0.1)
  );
};

export const stepPlayerTankSimulation = ({
  config = DEFAULT_TANK_DYNAMICS_CONFIG,
  deltaSeconds,
  fire,
  forward,
  isSupportDataAvailable = () => true,
  muzzlePose = null,
  physics,
  simulation,
  steer
}: {
  config?: TankDynamicsConfig;
  deltaSeconds: number;
  fire: boolean;
  forward: number;
  isSupportDataAvailable?: (x: number, z: number) => boolean;
  muzzlePose?: TankMuzzlePose | null;
  physics: ZarchPhysicsWorld;
  simulation: PlayerTankSimulation;
  steer: number;
}): TankSimulationStepResult => {
  const tank = rigidBody.get(physics.world, simulation.bodyId);
  if (!tank) {
    return { impacts: [] };
  }
  simulation.fireCooldownSeconds = Math.max(
    0,
    simulation.fireCooldownSeconds - deltaSeconds
  );
  simulation.recoveryDiagnosticSeconds = Math.max(
    0,
    simulation.recoveryDiagnosticSeconds - deltaSeconds
  );
  simulation.accumulatorSeconds += Math.min(deltaSeconds, 0.1);
  const impacts: TankShellImpact[] = [];
  let contactCandidates = new Map<number, TankShellImpact[]>();
  let shellStepStarts = new Map<number, TankVector>();
  const collectContact = (
    shellOwner: ZarchPhysicsOwner,
    targetOwner: ZarchShellColliderOwner,
    manifold: ContactManifold,
    shellIsBodyA: boolean
  ) => {
    if (typeof shellOwner.id !== 'number') {
      return;
    }
    const candidates = contactCandidates.get(shellOwner.id) ?? [];
    for (let index = 0; index < manifold.numContactPoints; index += 1) {
      const point = shellIsBodyA
        ? getWorldSpaceContactPointOnB([0, 0, 0], manifold, index)
        : getWorldSpaceContactPointOnA([0, 0, 0], manifold, index);
      candidates.push(
        createTankShellImpact({
          position: [point[0], point[1], point[2]],
          shellId: shellOwner.id,
          target: targetOwner
        })
      );
    }
    contactCandidates.set(shellOwner.id, candidates);
  };
  const listener: Listener = {
    onContactAdded: (a, b, manifold) => {
      const ownerA = a.userData as ZarchPhysicsOwner | null;
      const ownerB = b.userData as ZarchPhysicsOwner | null;
      if (ownerA?.kind === 'shell' && isZarchShellColliderOwner(ownerB)) {
        collectContact(ownerA, ownerB, manifold, true);
      } else if (
        ownerB?.kind === 'shell' &&
        isZarchShellColliderOwner(ownerA)
      ) {
        collectContact(ownerB, ownerA, manifold, false);
      }
    }
  };

  if (
    fire &&
    muzzlePose &&
    simulation.fireCooldownSeconds === 0 &&
    simulation.shells.length < TANK_SHELL_CAPACITY
  ) {
    const direction = normalize(muzzlePose.direction);
    const id = simulation.nextShellId++;
    const shell = rigidBody.create(physics.world, {
      allowSleeping: false,
      mass: 8,
      motionQuality: MotionQuality.LINEAR_CAST,
      motionType: MotionType.DYNAMIC,
      objectLayer: physics.layers.shell,
      position: [...muzzlePose.position],
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

  let steps = 0;
  while (simulation.accumulatorSeconds >= 1 / 60 && steps < 5) {
    contactCandidates = new Map();
    shellStepStarts = new Map(
      simulation.shells.flatMap(shell => {
        const body = rigidBody.get(physics.world, shell.bodyId);
        return body
          ? [[shell.id, [body.position[0], body.position[1], body.position[2]]]]
          : [];
      })
    );
    for (const shell of simulation.shells) {
      const body = rigidBody.get(physics.world, shell.bodyId);
      const start = shellStepStarts.get(shell.id);
      if (!body || !start) {
        continue;
      }
      const displacement: TankVector = [
        body.motionProperties.linearVelocity[0] / 60,
        body.motionProperties.linearVelocity[1] / 60,
        body.motionProperties.linearVelocity[2] / 60
      ];
      const candidates = contactCandidates.get(shell.id) ?? [];
      for (const hit of physics.sweepShell(start, displacement)) {
        candidates.push(
          createTankShellImpact({
            position: hit.point,
            shellId: shell.id,
            target: hit.target
          })
        );
      }
      contactCandidates.set(shell.id, candidates);
    }
    const quaternion = tank.quaternion as TankQuaternion;
    const forwardDirection = normalize(rotateVector([0, 0, -1], quaternion));
    const rightDirection = normalize(rotateVector([1, 0, 0], quaternion));
    const downDirection = normalize(rotateVector([0, -1, 0], quaternion));
    const maxRayLength =
      config.suspensionRideDistance + config.suspensionTravel;
    const springFrequency = config.suspensionFrequencyHertz * Math.PI * 2;
    const supportedMass = TANK_MASS_KILOGRAMS / SUSPENSION_POINTS.length;
    const springStiffness = supportedMass * springFrequency ** 2;
    const springDamping =
      2 *
      config.suspensionDampingRatio *
      Math.sqrt(springStiffness * supportedMass);
    const contacts: TankSuspensionContact[] = [];
    const normals: TankVector[] = [];
    const available = SUSPENSION_POINTS.every(localPoint => {
      const offset = rotateVector(localPoint, quaternion);
      return isSupportDataAvailable(
        tank.position[0] + offset[0],
        tank.position[2] + offset[2]
      );
    });

    for (const localPoint of SUSPENSION_POINTS) {
      const offset = rotateVector(localPoint, quaternion);
      const origin: TankVector = [
        tank.position[0] + offset[0],
        tank.position[1] + offset[1],
        tank.position[2] + offset[2]
      ];
      const hit = physics.castTankSupportRay(
        origin,
        downDirection,
        maxRayLength
      );
      if (!hit) {
        contacts.push({
          compression: 0,
          normal: null,
          point: null,
          supported: false
        });
        continue;
      }
      const pointVelocity = velocityAtPoint(tank, hit.point);
      const suspensionVelocity = -(
        pointVelocity[0] * hit.normal[0] +
        pointVelocity[1] * hit.normal[1] +
        pointVelocity[2] * hit.normal[2]
      );
      const compression = clamp(
        config.suspensionRideDistance - hit.distance,
        -config.suspensionTravel,
        config.suspensionTravel
      );
      const preload =
        (supportedMass * TANK_GRAVITY_METERS_PER_SECOND_SQUARED) /
        Math.max(hit.normal[1], 0.25);
      const springForce = Math.max(
        0,
        preload +
          springStiffness * compression +
          springDamping * suspensionVelocity
      );
      rigidBody.addForceAtPosition(
        physics.world,
        tank,
        [
          hit.normal[0] * springForce,
          hit.normal[1] * springForce,
          hit.normal[2] * springForce
        ],
        hit.point,
        true
      );
      contacts.push({
        compression,
        normal: hit.normal,
        point: hit.point,
        supported: true
      });
      normals.push(hit.normal);
    }

    const supportCount = contacts.filter(contact => contact.supported).length;
    const averageNormal = normalize(
      normals.reduce<TankVector>(
        (sum, normal) => [
          sum[0] + normal[0],
          sum[1] + normal[1],
          sum[2] + normal[2]
        ],
        [0, 0, 0]
      )
    );
    const slope = Math.acos(clamp(averageNormal[1], -1, 1));
    const traction = getTankSlopeTraction(slope);
    const planarSpeed = Math.hypot(
      tank.motionProperties.linearVelocity[0],
      tank.motionProperties.linearVelocity[2]
    );
    const steerAuthority =
      0.65 - 0.3 * clamp(planarSpeed / config.forwardSpeed, 0, 1);

    if (supportCount > 0) {
      for (let index = 0; index < contacts.length; index += 1) {
        const contact = contacts[index]!;
        if (!contact.supported || !contact.point) {
          continue;
        }
        const side = SUSPENSION_POINTS[index]![0] < 0 ? -1 : 1;
        const trackInput = clamp(
          forward + side * steer * steerAuthority,
          -1,
          1
        );
        const pivoting = Math.abs(forward) < 0.01 && Math.abs(steer) > 0.01;
        const pointVelocity = velocityAtPoint(tank, contact.point);
        const forwardSpeed =
          pointVelocity[0] * forwardDirection[0] +
          pointVelocity[1] * forwardDirection[1] +
          pointVelocity[2] * forwardDirection[2];
        const targetSpeed =
          trackInput *
          (pivoting
            ? Math.min(config.reverseSpeed, 4)
            : trackInput >= 0
              ? config.forwardSpeed
              : config.reverseSpeed);
        const maximumAcceleration = config.driveAcceleration;
        const speedGain = 2;
        const acceleration = clamp(
          (targetSpeed - forwardSpeed) * speedGain,
          -maximumAcceleration,
          maximumAcceleration
        );
        const driveForce = supportedMass * acceleration * traction;
        const lateralSpeed =
          pointVelocity[0] * rightDirection[0] +
          pointVelocity[1] * rightDirection[1] +
          pointVelocity[2] * rightDirection[2];
        const lateralForce =
          clamp(
            (-lateralSpeed * supportedMass * config.lateralGrip) / (1 / 60),
            -supportedMass * TANK_GRAVITY_METERS_PER_SECOND_SQUARED * 2,
            supportedMass * TANK_GRAVITY_METERS_PER_SECOND_SQUARED * 2
          ) * traction;
        rigidBody.addForceAtPosition(
          physics.world,
          tank,
          [
            forwardDirection[0] * driveForce + rightDirection[0] * lateralForce,
            forwardDirection[1] * driveForce + rightDirection[1] * lateralForce,
            forwardDirection[2] * driveForce + rightDirection[2] * lateralForce
          ],
          contact.point,
          true
        );
      }
    }

    const currentUp = normalize(rotateVector([0, 1, 0], quaternion));
    const targetSlope =
      supportCount > 0 ? Math.min(slope, config.uprightTargetLimitRadians) : 0;
    const horizontalNormal = normalize([averageNormal[0], 0, averageNormal[2]]);
    const targetUp: TankVector =
      targetSlope > 0
        ? [
            horizontalNormal[0] * Math.sin(targetSlope),
            Math.cos(targetSlope),
            horizontalNormal[2] * Math.sin(targetSlope)
          ]
        : [0, 1, 0];
    const correctionAxis = [
      currentUp[1] * targetUp[2] - currentUp[2] * targetUp[1],
      currentUp[2] * targetUp[0] - currentUp[0] * targetUp[2],
      currentUp[0] * targetUp[1] - currentUp[1] * targetUp[0]
    ] as const;
    const uprightScale = supportCount > 0 ? 1 : config.airborneUprightStrength;
    const angular = tank.motionProperties.angularVelocity;
    rigidBody.addTorque(
      physics.world,
      tank,
      [
        (correctionAxis[0] * config.uprightStrength -
          angular[0] * config.uprightDamping) *
          TANK_MASS_KILOGRAMS *
          uprightScale,
        0,
        (correctionAxis[2] * config.uprightStrength -
          angular[2] * config.uprightDamping) *
          TANK_MASS_KILOGRAMS *
          uprightScale
      ],
      true
    );

    updateWorld(physics.world, listener, 1 / 60);

    const hitShellIds = new Set<number>();
    for (const [shellId, candidates] of contactCandidates) {
      const start = shellStepStarts.get(shellId);
      if (!start || candidates.length === 0) {
        continue;
      }
      candidates.sort((left, right) => {
        const leftDistance =
          (left.position[0] - start[0]) ** 2 +
          (left.position[1] - start[1]) ** 2 +
          (left.position[2] - start[2]) ** 2;
        const rightDistance =
          (right.position[0] - start[0]) ** 2 +
          (right.position[1] - start[1]) ** 2 +
          (right.position[2] - start[2]) ** 2;
        return (
          leftDistance - rightDistance ||
          left.target.kind.localeCompare(right.target.kind) ||
          String(left.target.id).localeCompare(String(right.target.id))
        );
      });
      impacts.push(candidates[0]!);
      hitShellIds.add(shellId);
    }

    simulation.shells = simulation.shells.filter(shell => {
      shell.lifetimeSeconds += 1 / 60;
      if (
        hitShellIds.has(shell.id) ||
        shell.lifetimeSeconds >= TANK_SHELL_LIFETIME_SECONDS - 1e-9
      ) {
        removeBody(physics, shell.bodyId);
        return false;
      }
      return true;
    });
    const updatedUp = normalize(
      rotateVector([0, 1, 0], tank.quaternion as TankQuaternion)
    );
    const tilt = Math.acos(clamp(updatedUp[1], -1, 1));
    if (!available) {
      simulation.unavailableSeconds += 1 / 60;
    } else {
      simulation.unavailableSeconds = 0;
    }
    if (
      tilt > config.uprightLimitRadians ||
      simulation.unavailableSeconds >= 0.5
    ) {
      rigidBody.setTransform(
        physics.world,
        tank,
        simulation.lastSupportedPose.position,
        simulation.lastSupportedPose.quaternion,
        true
      );
      rigidBody.setLinearVelocity(physics.world, tank, [0, 0, 0]);
      rigidBody.setAngularVelocity(physics.world, tank, [0, 0, 0]);
      simulation.unavailableSeconds = 0;
      simulation.recoveryDiagnosticSeconds = 0.25;
    } else if (available && supportCount >= 3 && tilt < (20 * Math.PI) / 180) {
      simulation.lastSupportedPose = {
        position: [tank.position[0], tank.position[1], tank.position[2]],
        quaternion: [
          tank.quaternion[0],
          tank.quaternion[1],
          tank.quaternion[2],
          tank.quaternion[3]
        ]
      };
    }
    simulation.diagnostics = {
      airborne: supportCount === 0,
      contacts,
      recovered: simulation.recoveryDiagnosticSeconds > 0,
      slopeDegrees: (slope * 180) / Math.PI,
      speedMetersPerSecond: planarSpeed,
      supportCount,
      unavailableSeconds: simulation.unavailableSeconds
    };
    simulation.accumulatorSeconds -= 1 / 60;
    steps += 1;
  }
  if (steps === 5) {
    simulation.accumulatorSeconds = 0;
  }

  return { impacts };
};

export const getPlayerTankBody = (
  physics: ZarchPhysicsWorld,
  simulation: PlayerTankSimulation
): RigidBody | null => rigidBody.get(physics.world, simulation.bodyId) ?? null;
