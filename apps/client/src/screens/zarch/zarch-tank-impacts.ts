import {
  DEFAULT_PARTICLE_CONFIG,
  emitBulletImpactParticles,
  type ParticleSystemState,
  type ZarchParticleConfig
} from './zarch-particles';
import type { TankShellImpact } from './zarch-player-tank';

export type TankShellImpactDispatch = {
  count: number;
  lastSurface: TankShellImpact['surface'] | null;
};

export const dispatchTankShellImpacts = ({
  config = DEFAULT_PARTICLE_CONFIG,
  impacts,
  particleSystem,
  random = Math.random,
  sceneScale
}: {
  config?: ZarchParticleConfig;
  impacts: readonly TankShellImpact[];
  particleSystem: ParticleSystemState;
  random?: () => number;
  sceneScale: number;
}): TankShellImpactDispatch => {
  for (const impact of impacts) {
    emitBulletImpactParticles(
      particleSystem,
      {
        origin: {
          x: impact.position[0] * sceneScale,
          y: impact.position[1],
          z: impact.position[2] * sceneScale
        },
        water: impact.surface === 'water'
      },
      config,
      random
    );
  }

  return {
    count: impacts.length,
    lastSurface: impacts.at(-1)?.surface ?? null
  };
};
