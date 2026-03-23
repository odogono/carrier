export const PARTICLE_CAPACITY = 256;
export const SMALL_EXPLOSION_CLUSTER_COUNT = 3;
export const WATER_TAP_SPRAY_COUNT = 20;
export const WATER_IMPACT_SPRAY_COUNT = 10;
export const PARTICLE_GRAVITY = 180;

export const PARTICLE_KINDS = {
  debris: 1,
  smoke: 2,
  spark: 0,
  spray: 3
} as const;

export type ParticleKind =
  (typeof PARTICLE_KINDS)[keyof typeof PARTICLE_KINDS];

export const PARTICLE_FLAGS = {
  bounce: 1 << 1,
  fadeToRed: 1 << 2,
  gravity: 1 << 0,
  splashOnWaterImpact: 1 << 3
} as const;

export type ParticleFlags =
  (typeof PARTICLE_FLAGS)[keyof typeof PARTICLE_FLAGS];

export type ParticleEmitterPreset = 'land-tap' | 'water-tap';

export type ZarchParticleConfig = {
  particleGravity: number;
  particleLandClusterCount: number;
  particleLandVelocityScale: number;
  particleShadowLift: number;
  particleShadowOpacity: number;
  particleShadowScale: number;
  particleShadowStretch: number;
  particleSizeScale: number;
  particleSmokeRiseScale: number;
  particleTapMaxDurationMs: number;
  particleTapMaxMovementPx: number;
  particleWaterImpactSprayCount: number;
  particleWaterVelocityScale: number;
  particleWaterWaveCount: number;
};

export type ParticleOrigin = {
  x: number;
  y: number;
  z: number;
};

export type ParticleSurface = {
  getHeightAt: (x: number, z: number) => number | null;
  isWaterAt: (x: number, z: number) => boolean;
};

export type ParticleSystemState = {
  age: Float32Array;
  baseColor: Uint32Array;
  capacity: number;
  color: Uint32Array;
  count: number;
  flags: Uint8Array;
  kind: Uint8Array;
  maxAge: Float32Array;
  size: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
};

export type ParticleInit = {
  color: number;
  flags: number;
  kind: ParticleKind;
  maxAge: number;
  size: number;
  vx: number;
  vy: number;
  vz: number;
  x: number;
  y: number;
  z: number;
};

export const SPARK_PALETTE = [0xff_ff_ff, 0xff_f1_8b, 0xff_be_55, 0xff_85_2c];
export const DEBRIS_PALETTE = [0x7a_5f_3d, 0x5d_73_3c, 0x83_4f_33, 0x66_54_45];
export const SMOKE_PALETTE = [0x6d_6d_6d, 0x84_84_84, 0x57_57_57];
export const SPRAY_PALETTE = [0xff_ff_ff, 0xd9_f1_ff, 0x9d_d9_ff, 0x66_b8_ff];
export const SPARK_SIZES = [2.5, 3.5, 4.5];
export const DEBRIS_SIZES = [3.5, 4.5, 5.5];
export const SMOKE_SIZES = [5, 6, 7];
export const SPRAY_SIZES = [2.5, 3.5, 4.5];
export const PARTICLE_ASPECT_BY_KIND = [1.6, 1, 1.2, 0.8] as const;

export const DEFAULT_PARTICLE_CONFIG: ZarchParticleConfig = {
  particleGravity: PARTICLE_GRAVITY,
  particleLandClusterCount: SMALL_EXPLOSION_CLUSTER_COUNT,
  particleLandVelocityScale: 1,
  particleShadowLift: 0.15,
  particleShadowOpacity: 0.34,
  particleShadowScale: 1,
  particleShadowStretch: 0.7,
  particleSizeScale: 1,
  particleSmokeRiseScale: 1,
  particleTapMaxDurationMs: 200,
  particleTapMaxMovementPx: 8,
  particleWaterImpactSprayCount: WATER_IMPACT_SPRAY_COUNT,
  particleWaterVelocityScale: 1,
  particleWaterWaveCount: WATER_TAP_SPRAY_COUNT + 12
};

const SPARK_FADE_TARGET = 0xff_28_00;

const pickOne = <T>(values: readonly T[], rng: () => number) =>
  values[Math.min(values.length - 1, Math.floor(rng() * values.length))]!;

const randomRange = (min: number, max: number, rng: () => number) =>
  min + (max - min) * rng();

const randomSigned = (magnitude: number, rng: () => number) =>
  (rng() * 2 - 1) * magnitude;

const copyParticle = (
  state: ParticleSystemState,
  targetIndex: number,
  sourceIndex: number
) => {
  state.x[targetIndex] = state.x[sourceIndex];
  state.y[targetIndex] = state.y[sourceIndex];
  state.z[targetIndex] = state.z[sourceIndex];
  state.vx[targetIndex] = state.vx[sourceIndex];
  state.vy[targetIndex] = state.vy[sourceIndex];
  state.vz[targetIndex] = state.vz[sourceIndex];
  state.age[targetIndex] = state.age[sourceIndex];
  state.maxAge[targetIndex] = state.maxAge[sourceIndex];
  state.size[targetIndex] = state.size[sourceIndex];
  state.color[targetIndex] = state.color[sourceIndex];
  state.baseColor[targetIndex] = state.baseColor[sourceIndex];
  state.kind[targetIndex] = state.kind[sourceIndex];
  state.flags[targetIndex] = state.flags[sourceIndex];
};

const removeParticle = (state: ParticleSystemState, index: number) => {
  const lastIndex = state.count - 1;

  if (index !== lastIndex) {
    copyParticle(state, index, lastIndex);
  }

  state.count = lastIndex;
};

const mixColor = (startColor: number, endColor: number, t: number) => {
  const clamped = Math.max(0, Math.min(1, t));
  const sr = (startColor >> 16) & 0xff;
  const sg = (startColor >> 8) & 0xff;
  const sb = startColor & 0xff;
  const er = (endColor >> 16) & 0xff;
  const eg = (endColor >> 8) & 0xff;
  const eb = endColor & 0xff;
  const r = Math.round(sr + (er - sr) * clamped);
  const g = Math.round(sg + (eg - sg) * clamped);
  const b = Math.round(sb + (eb - sb) * clamped);

  return (r << 16) | (g << 8) | b;
};

export const createParticleSystemState = (
  capacity = PARTICLE_CAPACITY
): ParticleSystemState => ({
  age: new Float32Array(capacity),
  baseColor: new Uint32Array(capacity),
  capacity,
  color: new Uint32Array(capacity),
  count: 0,
  flags: new Uint8Array(capacity),
  kind: new Uint8Array(capacity),
  maxAge: new Float32Array(capacity),
  size: new Float32Array(capacity),
  vx: new Float32Array(capacity),
  vy: new Float32Array(capacity),
  vz: new Float32Array(capacity),
  x: new Float32Array(capacity),
  y: new Float32Array(capacity),
  z: new Float32Array(capacity)
});

export const addParticle = (
  state: ParticleSystemState,
  particle: ParticleInit
) => {
  if (state.count >= state.capacity) {
    return false;
  }

  const index = state.count;
  state.x[index] = particle.x;
  state.y[index] = particle.y;
  state.z[index] = particle.z;
  state.vx[index] = particle.vx;
  state.vy[index] = particle.vy;
  state.vz[index] = particle.vz;
  state.age[index] = 0;
  state.maxAge[index] = particle.maxAge;
  state.size[index] = particle.size;
  state.color[index] = particle.color;
  state.baseColor[index] = particle.color;
  state.kind[index] = particle.kind;
  state.flags[index] = particle.flags;
  state.count += 1;
  return true;
};

const emitSprayBurst = (
  state: ParticleSystemState,
  origin: ParticleOrigin,
  count: number,
  rng: () => number,
  config: ZarchParticleConfig,
  options?: {
    maxAgeMax?: number;
    maxAgeMin?: number;
    sizeSet?: readonly number[];
    speedXz?: number;
    speedYMax?: number;
    speedYMin?: number;
    spread?: number;
  }
) => {
  const {
    maxAgeMax = 0.8,
    maxAgeMin = 0.45,
    sizeSet = SPRAY_SIZES,
    speedXz = 55,
    speedYMax = 52,
    speedYMin = 18,
    spread = 2.5
  } = options ?? {};
  const sizeScale = config.particleSizeScale;
  const velocityScale = config.particleWaterVelocityScale;

  for (let index = 0; index < count; index += 1) {
    addParticle(state, {
      color: pickOne(SPRAY_PALETTE, rng),
      flags: PARTICLE_FLAGS.gravity,
      kind: PARTICLE_KINDS.spray,
      maxAge: randomRange(maxAgeMin, maxAgeMax, rng),
      size: pickOne(sizeSet, rng) * sizeScale,
      vx: randomSigned(speedXz * velocityScale, rng),
      vy: randomRange(speedYMin * velocityScale, speedYMax * velocityScale, rng),
      vz: randomSigned(speedXz * velocityScale, rng),
      x: origin.x + randomSigned(spread, rng),
      y: origin.y,
      z: origin.z + randomSigned(spread, rng)
    });
  }
};

const emitExplosionCluster = (
  state: ParticleSystemState,
  origin: ParticleOrigin,
  rng: () => number,
  splashOnWaterImpact: boolean,
  config: ZarchParticleConfig
) => {
  const sparkFlags =
    PARTICLE_FLAGS.gravity |
    PARTICLE_FLAGS.bounce |
    PARTICLE_FLAGS.fadeToRed |
    (splashOnWaterImpact ? PARTICLE_FLAGS.splashOnWaterImpact : 0);
  const debrisFlags =
    PARTICLE_FLAGS.gravity |
    PARTICLE_FLAGS.bounce |
    (splashOnWaterImpact ? PARTICLE_FLAGS.splashOnWaterImpact : 0);
  const sizeScale = config.particleSizeScale;
  const velocityScale = config.particleLandVelocityScale;
  const smokeRiseScale = config.particleSmokeRiseScale;

  for (let sparkIndex = 0; sparkIndex < 2; sparkIndex += 1) {
    addParticle(state, {
      color: pickOne(SPARK_PALETTE, rng),
      flags: sparkFlags,
      kind: PARTICLE_KINDS.spark,
      maxAge: randomRange(0.35, 0.55, rng),
      size: pickOne(SPARK_SIZES, rng) * sizeScale,
      vx: randomSigned(75 * velocityScale, rng),
      vy: randomRange(35 * velocityScale, 85 * velocityScale, rng),
      vz: randomSigned(75 * velocityScale, rng),
      x: origin.x + randomSigned(2, rng),
      y: origin.y + randomRange(0, 3, rng),
      z: origin.z + randomSigned(2, rng)
    });
  }

  addParticle(state, {
    color: pickOne(DEBRIS_PALETTE, rng),
    flags: debrisFlags,
    kind: PARTICLE_KINDS.debris,
    maxAge: randomRange(0.65, 0.95, rng),
    size: pickOne(DEBRIS_SIZES, rng) * sizeScale,
    vx: randomSigned(48 * velocityScale, rng),
    vy: randomRange(22 * velocityScale, 58 * velocityScale, rng),
    vz: randomSigned(48 * velocityScale, rng),
    x: origin.x + randomSigned(2, rng),
    y: origin.y + randomRange(0, 2.5, rng),
    z: origin.z + randomSigned(2, rng)
  });

  addParticle(state, {
    color: pickOne(SMOKE_PALETTE, rng),
    flags: 0,
    kind: PARTICLE_KINDS.smoke,
    maxAge: randomRange(0.9, 1.35, rng),
    size: pickOne(SMOKE_SIZES, rng) * sizeScale,
    vx: randomSigned(9, rng),
    vy: randomRange(14 * smokeRiseScale, 24 * smokeRiseScale, rng),
    vz: randomSigned(9, rng),
    x: origin.x + randomSigned(2, rng),
    y: origin.y + randomRange(0, 2.5, rng),
    z: origin.z + randomSigned(2, rng)
  });
};

export const emitTapParticlePreset = (
  state: ParticleSystemState,
  preset: ParticleEmitterPreset,
  origin: ParticleOrigin,
  config: ZarchParticleConfig = DEFAULT_PARTICLE_CONFIG,
  rng: () => number = Math.random
) => {
  if (preset === 'water-tap') {
    emitSprayBurst(
      state,
      origin,
      Math.max(0, Math.round(config.particleWaterWaveCount)),
      rng,
      config,
      {
        maxAgeMax: 1.1,
        maxAgeMin: 0.55,
        speedXz: 68,
        speedYMax: 58,
        speedYMin: 24,
        spread: 3.5
      }
    );
    return;
  }

  const splashOnWaterImpact = preset === 'land-tap';

  for (
    let clusterIndex = 0;
    clusterIndex < Math.max(0, Math.round(config.particleLandClusterCount));
    clusterIndex += 1
  ) {
    emitExplosionCluster(state, origin, rng, splashOnWaterImpact, config);
  }
};

export const simulateParticleSystem = (
  state: ParticleSystemState,
  deltaSeconds: number,
  surface: ParticleSurface,
  config: ZarchParticleConfig = DEFAULT_PARTICLE_CONFIG,
  rng: () => number = Math.random
) => {
  let index = 0;

  while (index < state.count) {
    state.age[index] += deltaSeconds;

    if (state.age[index] >= state.maxAge[index]) {
      removeParticle(state, index);
      continue;
    }

    state.x[index] += state.vx[index] * deltaSeconds;
    state.y[index] += state.vy[index] * deltaSeconds;
    state.z[index] += state.vz[index] * deltaSeconds;

    if ((state.flags[index] & PARTICLE_FLAGS.gravity) !== 0) {
      state.vy[index] -= config.particleGravity * deltaSeconds;
    }

    if (state.kind[index] === PARTICLE_KINDS.smoke) {
      const driftDamping = Math.max(0, 1 - 1.2 * deltaSeconds);
      state.vx[index] *= driftDamping;
      state.vz[index] *= driftDamping;
    }

    if ((state.flags[index] & PARTICLE_FLAGS.fadeToRed) !== 0) {
      state.color[index] = mixColor(
        state.baseColor[index],
        SPARK_FADE_TARGET,
        state.age[index] / state.maxAge[index]
      );
    }

    const surfaceHeight = surface.getHeightAt(state.x[index], state.z[index]);

    if (surfaceHeight !== null && state.y[index] <= surfaceHeight) {
      if (surface.isWaterAt(state.x[index], state.z[index])) {
        if ((state.flags[index] & PARTICLE_FLAGS.splashOnWaterImpact) !== 0) {
          emitSprayBurst(
            state,
            {
              x: state.x[index],
              y: surfaceHeight,
              z: state.z[index]
            },
            Math.max(0, Math.round(config.particleWaterImpactSprayCount)),
            rng,
            config
          );
        }

        removeParticle(state, index);
        continue;
      }

      if ((state.flags[index] & PARTICLE_FLAGS.bounce) !== 0) {
        state.y[index] = surfaceHeight;
        state.vx[index] *= 0.7;
        state.vy[index] = Math.abs(state.vy[index]) * 0.5;
        state.vz[index] *= 0.7;
        index += 1;
        continue;
      }

      removeParticle(state, index);
      continue;
    }

    index += 1;
  }
};
