/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';
import { rigidBody } from 'crashcat';

import { createZarchPhysicsWorld } from './zarch-physics-world';
import {
  clampTankTurretYaw,
  createPlayerTankSimulation,
  destroyPlayerTankSimulation,
  findNearestTankSpawn,
  getPlayerTankBody,
  getTankHullYaw,
  getTankSlopeTraction,
  stepPlayerTankSimulation,
  stepTankTurretYaw
} from './zarch-player-tank';

describe('zarch player tank', () => {
  test('limits turret yaw to the hull-relative forward hemisphere', () => {
    expect(clampTankTurretYaw(Math.PI)).toBeCloseTo(Math.PI / 2);
    expect(clampTankTurretYaw(-Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  test('traverses toward the clamped aim at 120 degrees per second', () => {
    expect(stepTankTurretYaw(0, Math.PI, 0.25)).toBeCloseTo(Math.PI / 6);
    expect(stepTankTurretYaw(0, -Math.PI / 2, 0.25)).toBeCloseTo(-Math.PI / 6);
  });

  test('selects the nearest deterministic loaded land tile', () => {
    const spawn = findNearestTankSpawn({
      isObstacleFree: (x, z) => !(x === 12 && z === 12),
      surface: {
        isTileLoaded: (x, z) => x >= 0 && z >= 0,
        isWaterTile: (x, z) => x === 0 && z === 0,
        sampleHeightAtWorld: () => 7,
        sampleNormalAtWorld: () => ({ x: 0, y: 1, z: 0 })
      },
      tileMeters: 24,
      x: 1,
      z: 1
    });

    expect(spawn).toEqual({ x: 36, y: 8.6, z: 12 });
  });

  test('declines to spawn when no loaded land tile is valid', () => {
    const spawn = findNearestTankSpawn({
      isObstacleFree: () => true,
      surface: {
        isTileLoaded: () => true,
        isWaterTile: () => true,
        sampleHeightAtWorld: () => 0,
        sampleNormalAtWorld: () => ({ x: 0, y: 1, z: 0 })
      },
      tileMeters: 24,
      x: 1,
      z: 1
    });

    expect(spawn).toBeNull();
  });

  test('drives a dynamic upright body in the shared physics world', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'ground', kind: 'obstacle' },
      {
        center: [0, -0.5, 0],
        halfExtents: [100, 0.5, 100],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 1.5,
      yaw: 0,
      z: 0
    });
    for (let frame = 0; frame < 90; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 1,
        physics,
        simulation,
        steer: 0
      });
    }
    const body = getPlayerTankBody(physics, simulation);
    expect(body?.position[2]).toBeLessThan(-5);
    expect(Math.abs(body?.quaternion[0] ?? 1)).toBeLessThan(0.15);
    expect(Math.abs(body?.quaternion[2] ?? 1)).toBeLessThan(0.15);
  });

  test('converges on the forward and reverse track speed limits', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'ground', kind: 'terrain' },
      {
        center: [0, -0.5, 0],
        halfExtents: [1000, 0.5, 1000],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 1.6,
      yaw: 0,
      z: 0
    });
    const drive = (forward: number, frames: number) => {
      for (let frame = 0; frame < frames; frame += 1) {
        stepPlayerTankSimulation({
          deltaSeconds: 1 / 60,
          fire: false,
          forward,
          physics,
          simulation,
          steer: 0
        });
      }
    };

    drive(0, 120);
    drive(1, 600);
    const body = getPlayerTankBody(physics, simulation)!;
    const forwardSpeed = Math.hypot(
      body.motionProperties.linearVelocity[0],
      body.motionProperties.linearVelocity[2]
    );
    expect(forwardSpeed).toBeGreaterThan(10);
    expect(forwardSpeed).toBeLessThanOrEqual(14.5);

    drive(-1, 600);
    const reverseSpeed = Math.hypot(
      body.motionProperties.linearVelocity[0],
      body.motionProperties.linearVelocity[2]
    );
    expect(reverseSpeed).toBeGreaterThan(4);
    expect(reverseSpeed).toBeLessThanOrEqual(7.5);
  });

  test('settles onto four suspension contacts at the configured ride height', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'ground', kind: 'terrain' },
      {
        center: [0, -0.5, 0],
        halfExtents: [100, 0.5, 100],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 1.6,
      yaw: 0,
      z: 0
    });

    for (let frame = 0; frame < 240; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 0,
        physics,
        simulation,
        steer: 0
      });
    }

    const body = getPlayerTankBody(physics, simulation);
    expect(simulation.diagnostics.supportCount).toBe(4);
    expect(simulation.diagnostics.airborne).toBe(false);
    expect(body?.position[1]).toBeGreaterThan(1.2);
    expect(body?.position[1]).toBeLessThan(1.8);
  });

  test('reports independent suspension compression on uneven support', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'ground', kind: 'terrain' },
      {
        center: [0, -0.5, 0],
        halfExtents: [100, 0.5, 100],
        yawRadians: 0
      }
    );
    physics.replaceStaticBoxBody(
      { id: 'raised-corner', kind: 'obstacle' },
      {
        center: [-1.75, 0.1, -2.6],
        halfExtents: [0.6, 0.1, 0.6],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 1.6,
      yaw: 0,
      z: 0
    });

    stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: false,
      forward: 0,
      physics,
      simulation,
      steer: 0
    });

    expect(simulation.diagnostics.contacts[0]?.compression).toBeCloseTo(0.05);
    expect(simulation.diagnostics.contacts[1]?.compression).toBeCloseTo(-0.15);
  });

  test('clamps suspension compression at the configured travel limit', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'high-ground', kind: 'terrain' },
      {
        center: [0, 0.65, 0],
        halfExtents: [100, 0.65, 100],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 1.6,
      yaw: 0,
      z: 0
    });

    stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: false,
      forward: 0,
      physics,
      simulation,
      steer: 0
    });

    expect(
      simulation.diagnostics.contacts.every(
        contact => contact.compression === 0.35
      )
    ).toBe(true);
  });

  test('pivots on differential track forces without forward throttle', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'ground', kind: 'terrain' },
      {
        center: [0, -0.5, 0],
        halfExtents: [100, 0.5, 100],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 1.6,
      yaw: 0,
      z: 0
    });

    for (let frame = 0; frame < 180; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 0,
        physics,
        simulation,
        steer: frame < 60 ? 0 : 1
      });
    }

    const body = getPlayerTankBody(physics, simulation);
    const yaw = body ? getTankHullYaw(body.quaternion) : 0;
    expect(yaw).toBeGreaterThan(0.1);
    expect(yaw).toBeLessThan(0.5);
    expect(
      Math.hypot(body?.position[0] ?? 1, body?.position[2] ?? 1)
    ).toBeLessThan(2);
  });

  test('fades slope traction between 25 and 35 degrees', () => {
    expect(getTankSlopeTraction((25 * Math.PI) / 180)).toBe(1);
    expect(getTankSlopeTraction((30 * Math.PI) / 180)).toBeCloseTo(0.5);
    expect(getTankSlopeTraction((35 * Math.PI) / 180)).toBe(0);
  });

  test('slides naturally down steep terrain without drive force', () => {
    const physics = createZarchPhysicsWorld();
    const slope = (35 * Math.PI) / 180;
    const edgeHeight = Math.tan(slope) * 50;
    physics.replaceStaticTriangleBody(
      { id: 'slope', kind: 'terrain' },
      {
        indices: [0, 2, 1, 1, 2, 3],
        positions: [
          -50,
          -edgeHeight,
          -50,
          50,
          -edgeHeight,
          -50,
          -50,
          edgeHeight,
          50,
          50,
          edgeHeight,
          50
        ]
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 3.5,
      yaw: 0,
      z: 0
    });

    for (let frame = 0; frame < 240; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 0,
        physics,
        simulation,
        steer: 0
      });
    }

    const body = getPlayerTankBody(physics, simulation);
    expect(body?.position[2]).toBeLessThan(-3);
  });

  test('keeps loaded-ground airtime ballistic without recovery', () => {
    const physics = createZarchPhysicsWorld();
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 5,
      yaw: 0,
      z: 0
    });

    for (let frame = 0; frame < 40; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 1,
        isSupportDataAvailable: () => true,
        physics,
        simulation,
        steer: 0
      });
    }

    const body = getPlayerTankBody(physics, simulation);
    expect(simulation.diagnostics.airborne).toBe(true);
    expect(simulation.diagnostics.recovered).toBe(false);
    expect(body?.position[1]).toBeLessThan(4);
    expect(
      Math.hypot(body?.position[0] ?? 1, body?.position[2] ?? 1)
    ).toBeLessThan(0.1);
  });

  test('preserves airborne momentum instead of rewriting planar velocity', () => {
    const physics = createZarchPhysicsWorld();
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 5,
      yaw: 0,
      z: 0
    });
    const body = getPlayerTankBody(physics, simulation)!;
    rigidBody.setLinearVelocity(physics.world, body, [5, 0, 0]);

    stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: false,
      forward: 1,
      physics,
      simulation,
      steer: 0
    });

    expect(body.motionProperties.linearVelocity[0]).toBeGreaterThan(4.9);
    expect(body.motionProperties.linearVelocity[2]).toBeCloseTo(0);
  });

  test('preserves tangential momentum through an obstacle impact', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'wall', kind: 'obstacle' },
      {
        center: [0, 0, -10],
        halfExtents: [50, 50, 0.5],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 2,
      yaw: 0,
      z: 0
    });
    const body = getPlayerTankBody(physics, simulation)!;
    rigidBody.setLinearVelocity(physics.world, body, [3, 0, -10]);

    for (let frame = 0; frame < 90; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 0,
        physics,
        simulation,
        steer: 0
      });
    }

    expect(body.position[2]).toBeGreaterThan(-7);
    expect(body.position[0]).toBeGreaterThan(2);
  });

  test('reports one Shell Impact and removes the Shell after a CCD contact', () => {
    const physics = createZarchPhysicsWorld();
    physics.replaceStaticBoxBody(
      { id: 'target', kind: 'obstacle' },
      {
        center: [0, 0, -1.5],
        halfExtents: [1, 1, 0.05],
        yawRadians: 0
      }
    );
    const simulation = createPlayerTankSimulation({
      physics,
      x: 20,
      y: 0,
      yaw: 0,
      z: 0
    });
    physics.sweepShell = () => [];

    const result = stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: true,
      forward: 0,
      muzzlePose: {
        direction: [0, 0, -1],
        position: [0, 0, 0]
      },
      physics,
      simulation,
      steer: 0
    });

    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]?.surface).toBe('land');
    expect(result.impacts[0]?.target.kind).toBe('obstacle');
    expect(result.impacts[0]?.position[2]).toBeCloseTo(-1.45, 2);
    expect(simulation.shells).toHaveLength(0);
  });

  test('does not fire without an authored Muzzle pose', () => {
    const physics = createZarchPhysicsWorld();
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 0,
      yaw: 0,
      z: 0
    });

    const result = stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: true,
      forward: 0,
      muzzlePose: null,
      physics,
      simulation,
      steer: 0
    });

    expect(result.impacts).toHaveLength(0);
    expect(simulation.shells).toHaveLength(0);
  });

  test('classifies terrain, vegetation, and water Shell Impacts', () => {
    const cases = [
      {
        createTarget: (physics: ReturnType<typeof createZarchPhysicsWorld>) =>
          physics.replaceStaticTriangleBody(
            { id: 'terrain-target', kind: 'terrain' },
            {
              indices: [0, 1, 2],
              positions: [-2, 0, -2, 2, 0, -2, 0, 0, 2]
            }
          ),
        direction: [0, -1, 0] as const,
        kind: 'terrain',
        position: [0, 1.5, 0] as const,
        surface: 'land'
      },
      {
        createTarget: (physics: ReturnType<typeof createZarchPhysicsWorld>) =>
          physics.replaceStaticCylinderBody(
            { id: 'tree-target', kind: 'vegetation' },
            { center: [0, 0, -1.5], halfHeight: 2, radius: 0.1 }
          ),
        direction: [0, 0, -1] as const,
        kind: 'vegetation',
        position: [0, 0, 0] as const,
        surface: 'land'
      },
      {
        createTarget: (physics: ReturnType<typeof createZarchPhysicsWorld>) =>
          physics.replaceStaticTriangleBody(
            { id: 'water-target', kind: 'water-surface' },
            {
              indices: [0, 1, 2],
              positions: [-2, 0, -2, 2, 0, -2, 0, 0, 2]
            }
          ),
        direction: [0, -1, 0] as const,
        kind: 'water-surface',
        position: [0, 1.5, 0] as const,
        surface: 'water'
      }
    ] as const;

    for (const scenario of cases) {
      const physics = createZarchPhysicsWorld();
      scenario.createTarget(physics);
      const simulation = createPlayerTankSimulation({
        physics,
        x: 20,
        y: 0,
        yaw: 0,
        z: 0
      });

      const result = stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: true,
        forward: 0,
        muzzlePose: {
          direction: [...scenario.direction],
          position: [...scenario.position]
        },
        physics,
        simulation,
        steer: 0
      });

      expect(result.impacts, scenario.kind).toHaveLength(1);
      expect(result.impacts[0]?.target.kind).toBe(scenario.kind);
      expect(result.impacts[0]?.surface).toBe(scenario.surface);
      expect(simulation.shells).toHaveLength(0);
    }
  });

  test('chooses the nearest Shell contact reported in one fixed step', () => {
    const physics = createZarchPhysicsWorld();
    for (const [id, z] of [
      ['far-target', -1.7],
      ['near-target', -1.2]
    ] as const) {
      physics.replaceStaticBoxBody(
        { id, kind: 'obstacle' },
        {
          center: [0, 0, z],
          halfExtents: [1, 1, 0.05],
          yawRadians: 0
        }
      );
    }
    const simulation = createPlayerTankSimulation({
      physics,
      x: 20,
      y: 0,
      yaw: 0,
      z: 0
    });

    const result = stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: true,
      forward: 0,
      muzzlePose: {
        direction: [0, 0, -1],
        position: [0, 0, 0]
      },
      physics,
      simulation,
      steer: 0
    });

    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]?.target.id).toBe('near-target');
  });

  test('uses the stable owner ID tie-break for equidistant contacts', () => {
    const physics = createZarchPhysicsWorld();
    for (const id of ['z-target', 'a-target']) {
      physics.replaceStaticBoxBody(
        { id, kind: 'obstacle' },
        {
          center: [0, 0, -1.2],
          halfExtents: [1, 1, 0.05],
          yawRadians: 0
        }
      );
    }
    const simulation = createPlayerTankSimulation({
      physics,
      x: 20,
      y: 0,
      yaw: 0,
      z: 0
    });

    const result = stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: true,
      forward: 0,
      muzzlePose: {
        direction: [0, 0, -1],
        position: [0, 0, 0]
      },
      physics,
      simulation,
      steer: 0
    });

    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]?.target.id).toBe('a-target');
  });

  test('uses the stable owner-kind tie-break for equidistant contacts', () => {
    const physics = createZarchPhysicsWorld();
    physics.sweepShell = () => [
      {
        fraction: 0.5,
        point: [0, 0, -1],
        target: { id: 'tree', kind: 'vegetation' }
      },
      {
        fraction: 0.5,
        point: [0, 0, -1],
        target: { id: 'wall', kind: 'obstacle' }
      }
    ];
    const simulation = createPlayerTankSimulation({
      physics,
      x: 20,
      y: 0,
      yaw: 0,
      z: 0
    });

    const result = stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: true,
      forward: 0,
      muzzlePose: {
        direction: [0, 0, -1],
        position: [0, 0, 0]
      },
      physics,
      simulation,
      steer: 0
    });

    expect(result.impacts).toHaveLength(1);
    expect(result.impacts[0]?.target.kind).toBe('obstacle');
  });

  test('expires Shells on fixed simulated time without an impact', () => {
    const physics = createZarchPhysicsWorld();
    const simulation = createPlayerTankSimulation({
      physics,
      x: 20,
      y: 0,
      yaw: 0,
      z: 0
    });
    const impacts = [];

    for (let frame = 0; frame < 300; frame += 1) {
      const result = stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: frame === 0,
        forward: 0,
        muzzlePose:
          frame === 0 ? { direction: [0, 1, 0], position: [0, 0, 0] } : null,
        physics,
        simulation,
        steer: 0
      });
      impacts.push(...result.impacts);
    }

    expect(impacts).toHaveLength(0);
    expect(simulation.shells).toHaveLength(0);
  });

  test('releases Shell capacity after cleanup and clears bodies on mode exit', () => {
    const physics = createZarchPhysicsWorld();
    const simulation = createPlayerTankSimulation({
      physics,
      x: 20,
      y: 0,
      yaw: 0,
      z: 0
    });
    const muzzlePose = {
      direction: [0, 1, 0] as [number, number, number],
      position: [0, 0, 0] as [number, number, number]
    };

    for (let index = 0; index < 16; index += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 0.5,
        fire: true,
        forward: 0,
        muzzlePose,
        physics,
        simulation,
        steer: 0
      });
    }
    expect(simulation.shells).toHaveLength(16);

    stepPlayerTankSimulation({
      deltaSeconds: 0.5,
      fire: true,
      forward: 0,
      muzzlePose,
      physics,
      simulation,
      steer: 0
    });
    expect(simulation.shells).toHaveLength(16);

    simulation.shells[0]!.lifetimeSeconds = 5;
    stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: false,
      forward: 0,
      physics,
      simulation,
      steer: 0
    });
    expect(simulation.shells).toHaveLength(15);

    stepPlayerTankSimulation({
      deltaSeconds: 0.5,
      fire: true,
      forward: 0,
      muzzlePose,
      physics,
      simulation,
      steer: 0
    });
    expect(simulation.shells).toHaveLength(16);
    const ownedBodyIds = [
      simulation.bodyId,
      ...simulation.shells.map(s => s.bodyId)
    ];

    destroyPlayerTankSimulation(physics, simulation);

    expect(simulation.shells).toHaveLength(0);
    for (const bodyId of ownedBodyIds) {
      expect(rigidBody.get(physics.world, bodyId)).toBeUndefined();
    }
  });

  test('restores the last supported pose when streamed support disappears', () => {
    const physics = createZarchPhysicsWorld();
    const owner = { id: 'ground', kind: 'terrain' } as const;
    physics.replaceStaticBoxBody(owner, {
      center: [0, -0.5, 0],
      halfExtents: [100, 0.5, 100],
      yawRadians: 0
    });
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 1.6,
      yaw: 0,
      z: 0
    });
    for (let frame = 0; frame < 120; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 0,
        physics,
        simulation,
        steer: 0
      });
    }
    const supportedY = simulation.lastSupportedPose.position[1];
    physics.removeOwner(owner);
    let recovered = false;
    for (let frame = 0; frame < 35; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 1 / 60,
        fire: false,
        forward: 0,
        isSupportDataAvailable: () => false,
        physics,
        simulation,
        steer: 0
      });
      recovered ||= simulation.diagnostics.recovered;
      if (recovered) {
        break;
      }
    }

    const body = getPlayerTankBody(physics, simulation);
    expect(recovered).toBe(true);
    expect(body?.position[1]).toBeCloseTo(supportedY, 1);
    expect(body?.motionProperties.linearVelocity).toEqual([0, 0, 0]);
  });

  test('restores the stable pose beyond the upright safety limit', () => {
    const physics = createZarchPhysicsWorld();
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 2,
      yaw: 0,
      z: 0
    });
    const body = getPlayerTankBody(physics, simulation)!;
    const roll = (30 * Math.PI) / 180;
    rigidBody.setTransform(
      physics.world,
      body,
      body.position,
      [Math.sin(roll / 2), 0, 0, Math.cos(roll / 2)],
      true
    );

    stepPlayerTankSimulation({
      deltaSeconds: 1 / 60,
      fire: false,
      forward: 0,
      physics,
      simulation,
      steer: 0
    });

    expect(simulation.diagnostics.recovered).toBe(true);
    expect(body.quaternion).toEqual([0, 0, 0, 1]);

    for (let frame = 0; frame < 2; frame += 1) {
      stepPlayerTankSimulation({
        deltaSeconds: 0.1,
        fire: false,
        forward: 0,
        physics,
        simulation,
        steer: 0
      });
      expect(simulation.diagnostics.recovered).toBe(true);
    }
    stepPlayerTankSimulation({
      deltaSeconds: 0.1,
      fire: false,
      forward: 0,
      physics,
      simulation,
      steer: 0
    });
    expect(simulation.diagnostics.recovered).toBe(false);
  });

  test('caps long-frame catch-up at five fixed steps and drops the backlog', () => {
    const physics = createZarchPhysicsWorld();
    const simulation = createPlayerTankSimulation({
      physics,
      x: 0,
      y: 2,
      yaw: 0,
      z: 0
    });

    stepPlayerTankSimulation({
      deltaSeconds: 1,
      fire: false,
      forward: 0,
      physics,
      simulation,
      steer: 0
    });

    expect(simulation.accumulatorSeconds).toBe(0);
  });
});
