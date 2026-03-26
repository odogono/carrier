/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_PARTICLE_CONFIG,
  DEBRIS_PALETTE,
  DEBRIS_SIZES,
  PARTICLE_FLAGS,
  PARTICLE_KINDS,
  SMALL_EXPLOSION_CLUSTER_COUNT,
  SMOKE_PALETTE,
  SPARK_PALETTE,
  SPARK_SIZES,
  SPRAY_PALETTE,
  addParticle,
  createParticleSystemState,
  emitShipThrustParticles,
  emitTapParticlePreset,
  simulateParticleSystem
} from './zarch-particles';

const createRng = (values: number[]) => {
  let index = 0;

  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
};

const countKind = (kinds: Uint8Array, count: number, kind: number) => {
  let total = 0;

  for (let index = 0; index < count; index += 1) {
    if (kinds[index] === kind) {
      total += 1;
    }
  }

  return total;
};

describe('zarch particle emitters', () => {
  test('emits the expected land explosion cluster mix', () => {
    const state = createParticleSystemState();
    emitTapParticlePreset(
      state,
      'land-tap',
      { x: 10, y: 5, z: -6 },
      DEFAULT_PARTICLE_CONFIG,
      createRng([0, 0.25, 0.5, 0.75])
    );

    expect(state.count).toBe(SMALL_EXPLOSION_CLUSTER_COUNT * 4);
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spark)).toBe(
      SMALL_EXPLOSION_CLUSTER_COUNT * 2
    );
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.debris)).toBe(
      SMALL_EXPLOSION_CLUSTER_COUNT
    );
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.smoke)).toBe(
      SMALL_EXPLOSION_CLUSTER_COUNT
    );

    for (let index = 0; index < state.count; index += 1) {
      const color = state.baseColor[index];

      if (state.kind[index] === PARTICLE_KINDS.spark) {
        expect(SPARK_PALETTE).toContain(color);
        expect(SPARK_SIZES).toContain(state.size[index]);
        expect(
          (state.flags[index] & PARTICLE_FLAGS.fadeToRed) !== 0
        ).toBe(true);
      }

      if (state.kind[index] === PARTICLE_KINDS.debris) {
        expect(DEBRIS_PALETTE).toContain(color);
        expect(DEBRIS_SIZES).toContain(state.size[index]);
      }

      if (state.kind[index] === PARTICLE_KINDS.smoke) {
        expect(SMOKE_PALETTE).toContain(color);
      }
    }
  });

  test('adds extra spray for water taps', () => {
    const state = createParticleSystemState();
    emitTapParticlePreset(
      state,
      'water-tap',
      { x: 0, y: -12, z: 0 },
      DEFAULT_PARTICLE_CONFIG,
      createRng([0.1, 0.3, 0.6, 0.9])
    );

    expect(state.count).toBe(DEFAULT_PARTICLE_CONFIG.particleWaterWaveCount);
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spray)).toBe(
      DEFAULT_PARTICLE_CONFIG.particleWaterWaveCount
    );
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.smoke)).toBe(0);
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spark)).toBe(0);
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.debris)).toBe(0);

    for (let index = 0; index < state.count; index += 1) {
      expect(state.kind[index]).toBe(PARTICLE_KINDS.spray);
      expect(SPRAY_PALETTE).toContain(state.baseColor[index]);
      expect((state.flags[index] & PARTICLE_FLAGS.splashOnWaterImpact) !== 0).toBe(
        false
      );
    }
  });

  test('emits a noisy spark-heavy ship thrust burst', () => {
    const state = createParticleSystemState();
    emitShipThrustParticles(
      state,
      {
        direction: { x: 0, y: -1, z: 0 },
        origin: { x: 5, y: 20, z: -3 }
      },
      DEFAULT_PARTICLE_CONFIG,
      createRng([0.1, 0.3, 0.6, 0.9]),
      0.1
    );

    expect(state.count).toBe(
      Math.max(
        1,
        Math.round(DEFAULT_PARTICLE_CONFIG.particleThrustEmissionRate * 0.1)
      )
    );
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spark)).toBe(
      state.count
    );

    const uniqueVelocities = new Set<string>();
    const thrustAxis = { x: 0, y: -1, z: 0 };
    const maxConeAngle = Math.min(
      Math.PI / 3,
      Math.max(0.02, DEFAULT_PARTICLE_CONFIG.particleThrustSpread * 0.08)
    );

    for (let index = 0; index < state.count; index += 1) {
      expect(SPARK_PALETTE).toContain(state.baseColor[index]);
      expect((state.flags[index] & PARTICLE_FLAGS.fadeToRed) !== 0).toBe(true);
      expect(state.x[index]).toBe(5);
      expect(state.y[index]).toBe(20);
      expect(state.z[index]).toBe(-3);

      const speed = Math.hypot(state.vx[index], state.vy[index], state.vz[index]);
      const direction = {
        x: state.vx[index] / speed,
        y: state.vy[index] / speed,
        z: state.vz[index] / speed
      };
      const angle = Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            direction.x * thrustAxis.x +
              direction.y * thrustAxis.y +
              direction.z * thrustAxis.z
          )
        )
      );

      expect(angle).toBeLessThanOrEqual(maxConeAngle + 0.0001);
      uniqueVelocities.add(
        `${state.vx[index].toFixed(4)}:${state.vy[index].toFixed(4)}:${state.vz[index].toFixed(4)}`
      );
    }

    expect(uniqueVelocities.size).toBeGreaterThan(1);
  });

  test('adds a small water disturbance for low-altitude thrust over water', () => {
    const state = createParticleSystemState();
    emitShipThrustParticles(
      state,
      {
        direction: { x: 0, y: -1, z: 0 },
        origin: { x: 0, y: -6, z: 0 },
        surface: {
          getHeightAt: () => -12,
          isWaterAt: () => true
        }
      },
      DEFAULT_PARTICLE_CONFIG,
      createRng([0.2, 0.4, 0.6, 0.8]),
      0.1
    );

    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spray)).toBe(
      DEFAULT_PARTICLE_CONFIG.particleThrustWaterSprayCount
    );
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spark)).toBeGreaterThan(
      0
    );
  });
});

describe('zarch particle simulation', () => {
  test('applies gravity and fades spark colors over life', () => {
    const state = createParticleSystemState();
    addParticle(state, {
      color: SPARK_PALETTE[0],
      flags: PARTICLE_FLAGS.gravity | PARTICLE_FLAGS.fadeToRed,
      kind: PARTICLE_KINDS.spark,
      maxAge: 1,
      size: SPARK_SIZES[0],
      vx: 0,
      vy: 10,
      vz: 0,
      x: 0,
      y: 10,
      z: 0
    });

    simulateParticleSystem(state, 0.5, {
      getHeightAt: () => null,
      isWaterAt: () => false
    }, DEFAULT_PARTICLE_CONFIG);

    expect(state.vy[0]).toBeLessThan(10);
    expect(state.color[0]).not.toBe(SPARK_PALETTE[0]);
  });

  test('bounces debris off land at half vertical speed', () => {
    const state = createParticleSystemState();
    addParticle(state, {
      color: DEBRIS_PALETTE[0],
      flags: PARTICLE_FLAGS.gravity | PARTICLE_FLAGS.bounce,
      kind: PARTICLE_KINDS.debris,
      maxAge: 1,
      size: DEBRIS_SIZES[0],
      vx: 0,
      vy: -20,
      vz: 0,
      x: 0,
      y: 1,
      z: 0
    });

    simulateParticleSystem(state, 0.1, {
      getHeightAt: () => 0,
      isWaterAt: () => false
    }, DEFAULT_PARTICLE_CONFIG);

    expect(state.count).toBe(1);
    expect(state.y[0]).toBe(0);
    expect(state.vy[0]).toBeGreaterThan(0);
  });

  test('turns splash-enabled impacts into spray and removes the source particle', () => {
    const state = createParticleSystemState();
    addParticle(state, {
      color: SPARK_PALETTE[1],
      flags: PARTICLE_FLAGS.gravity | PARTICLE_FLAGS.splashOnWaterImpact,
      kind: PARTICLE_KINDS.spark,
      maxAge: 1,
      size: SPARK_SIZES[0],
      vx: 0,
      vy: -5,
      vz: 0,
      x: 0,
      y: -11.8,
      z: 0
    });

    simulateParticleSystem(
      state,
      0.1,
      {
        getHeightAt: () => -12,
        isWaterAt: () => true
      },
      DEFAULT_PARTICLE_CONFIG,
      createRng([0.2, 0.4, 0.6, 0.8])
    );

    expect(state.count).toBe(DEFAULT_PARTICLE_CONFIG.particleWaterImpactSprayCount);
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spark)).toBe(0);
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spray)).toBe(
      DEFAULT_PARTICLE_CONFIG.particleWaterImpactSprayCount
    );
  });

  test('turns land-impact-enabled thrust sparks into a small dust burst', () => {
    const state = createParticleSystemState();
    addParticle(state, {
      color: SPARK_PALETTE[1],
      flags:
        PARTICLE_FLAGS.gravity |
        PARTICLE_FLAGS.fadeToRed |
        PARTICLE_FLAGS.splashOnLandImpact,
      kind: PARTICLE_KINDS.spark,
      maxAge: 1,
      size: SPARK_SIZES[0],
      vx: 0,
      vy: -5,
      vz: 0,
      x: 0,
      y: 0.2,
      z: 0
    });

    simulateParticleSystem(
      state,
      0.1,
      {
        getHeightAt: () => 0,
        isWaterAt: () => false
      },
      DEFAULT_PARTICLE_CONFIG,
      createRng([0.2, 0.4, 0.6, 0.8])
    );

    expect(state.count).toBe(DEFAULT_PARTICLE_CONFIG.particleThrustLandDustCount);
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.spark)).toBe(0);
    expect(countKind(state.kind, state.count, PARTICLE_KINDS.debris)).toBe(
      DEFAULT_PARTICLE_CONFIG.particleThrustLandDustCount
    );

    for (let index = 0; index < state.count; index += 1) {
      expect(DEBRIS_PALETTE).toContain(state.baseColor[index]);
    }
  });

  test('drops new particles when the fixed-capacity buffer is full', () => {
    const state = createParticleSystemState(2);

    expect(
      addParticle(state, {
        color: SPARK_PALETTE[0],
        flags: 0,
        kind: PARTICLE_KINDS.spark,
        maxAge: 1,
        size: SPARK_SIZES[0],
        vx: 0,
        vy: 0,
        vz: 0,
        x: 0,
        y: 0,
        z: 0
      })
    ).toBe(true);
    expect(
      addParticle(state, {
        color: SPARK_PALETTE[0],
        flags: 0,
        kind: PARTICLE_KINDS.spark,
        maxAge: 1,
        size: SPARK_SIZES[0],
        vx: 0,
        vy: 0,
        vz: 0,
        x: 1,
        y: 0,
        z: 0
      })
    ).toBe(true);
    expect(
      addParticle(state, {
        color: SPARK_PALETTE[0],
        flags: 0,
        kind: PARTICLE_KINDS.spark,
        maxAge: 1,
        size: SPARK_SIZES[0],
        vx: 0,
        vy: 0,
        vz: 0,
        x: 2,
        y: 0,
        z: 0
      })
    ).toBe(false);
    expect(state.count).toBe(2);
  });
});
