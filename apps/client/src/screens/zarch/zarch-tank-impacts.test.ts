/* eslint-disable import-x/no-unresolved */
import { describe, expect, test } from 'bun:test';

import { PARTICLE_KINDS, createParticleSystemState } from './zarch-particles';
import { dispatchTankShellImpacts } from './zarch-tank-impacts';

describe('Tank Shell Impact dispatch', () => {
  test('converts map-metre impacts and emits land or water feedback', () => {
    const landParticles = createParticleSystemState();
    const waterParticles = createParticleSystemState();

    const land = dispatchTankShellImpacts({
      impacts: [
        {
          position: [2, 3, 4],
          shellId: 1,
          surface: 'land',
          target: { id: 'ground', kind: 'terrain' }
        }
      ],
      particleSystem: landParticles,
      random: () => 0.5,
      sceneScale: 2
    });
    const water = dispatchTankShellImpacts({
      impacts: [
        {
          position: [5, 6, 7],
          shellId: 2,
          surface: 'water',
          target: { id: 'sea', kind: 'water-surface' }
        }
      ],
      particleSystem: waterParticles,
      random: () => 0.5,
      sceneScale: 2
    });

    expect(land).toEqual({ count: 1, lastSurface: 'land' });
    expect(landParticles.count).toBeGreaterThan(0);
    expect(landParticles.x.slice(0, landParticles.count)).toContain(4);
    expect(water).toEqual({ count: 1, lastSurface: 'water' });
    expect(
      waterParticles.kind
        .slice(0, waterParticles.count)
        .every(kind => kind === PARTICLE_KINDS.spray)
    ).toBe(true);
    expect(waterParticles.z.slice(0, waterParticles.count)).toContain(14);
  });
});
