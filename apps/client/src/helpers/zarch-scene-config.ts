import { atom, createStore } from 'jotai';

import {
  DEFAULT_PARTICLE_CONFIG,
  type ZarchParticleConfig
} from '@/screens/zarch/zarch-particles';
import {
  DEFAULT_TANK_DYNAMICS_CONFIG,
  type TankDynamicsConfig
} from '@/screens/zarch/zarch-player-tank';

export {
  LANDSCAPE_CLIP_SCALE_MAX,
  LANDSCAPE_CLIP_SCALE_MIN
} from '@/helpers/zarch-terrain';

export type ZarchSceneConfig = ZarchParticleConfig & {
  ambientIntensity: number;
  backgroundColor: string;
  brightnessDistanceFactor: number;
  brightnessFalloffPower: number;
  brightnessFalloffScale: number;
  brightnessMin: number;
  cameraFov: number;
  cameraHeightMultiplier: number;
  cameraPullbackMultiplier: number;
  directionalIntensity: number;
  directionalPosition: [number, number, number];
  keyboardZoomSpeed: number;
  landscapeClipScale: number;
  seaY: number;
  shadowBias: number;
  shadowMapSize: number;
  showHud: boolean;
  showMinimap: boolean;
  showTrees: boolean;
  tankDynamics: TankDynamicsConfig;
  viewRadiusBase: number;
  wireframe: boolean;
  zoomDamping: number;
  zoomMax: number;
  zoomMin: number;
};

export const DEFAULT_SCENE_CONFIG: ZarchSceneConfig = {
  ambientIntensity: 0.6,
  backgroundColor: '#000000',
  brightnessDistanceFactor: 3.2,
  brightnessFalloffPower: 2,
  brightnessFalloffScale: 0.88,
  brightnessMin: 0.12,
  cameraFov: 70,
  cameraHeightMultiplier: 0.85,
  cameraPullbackMultiplier: 2.5,
  directionalIntensity: 0.8,
  directionalPosition: [0, 400, 0],
  keyboardZoomSpeed: 1.4,
  landscapeClipScale: 1,
  ...DEFAULT_PARTICLE_CONFIG,
  seaY: -12,
  shadowBias: -0.001,
  shadowMapSize: 1024,
  showHud: true,
  showMinimap: true,
  showTrees: true,
  tankDynamics: DEFAULT_TANK_DYNAMICS_CONFIG,
  viewRadiusBase: 6,
  wireframe: false,
  zoomDamping: 7,
  zoomMax: 2.5,
  zoomMin: 0.4
};

export const sceneConfigAtom = atom<ZarchSceneConfig>(DEFAULT_SCENE_CONFIG);

export const sceneConfigStore = createStore();
