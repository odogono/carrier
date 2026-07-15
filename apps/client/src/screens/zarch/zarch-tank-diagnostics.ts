import type { TankDynamicsDiagnostics } from './zarch-player-tank';

let latestTankDiagnostics: TankDynamicsDiagnostics | null = null;

export const getLatestTankDiagnostics = () => latestTankDiagnostics;

export const setLatestTankDiagnostics = (
  diagnostics: TankDynamicsDiagnostics | null
) => {
  latestTankDiagnostics = diagnostics;
};
