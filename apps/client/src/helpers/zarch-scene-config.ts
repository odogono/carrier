import { atom, createStore } from 'jotai';

export type ZarchSceneConfig = {
  // Camera
  cameraFov: number;
  cameraHeightMultiplier: number;
  cameraPullbackMultiplier: number;

  // View
  keyboardZoomSpeed: number;
  viewRadiusBase: number;
  zoomDamping: number;
  zoomMax: number;
  zoomMin: number;

  // Lighting
  ambientIntensity: number;
  directionalIntensity: number;
  directionalPosition: [number, number, number];
  shadowBias: number;
  shadowMapSize: number;

  // Rendering
  backgroundColor: string;
  brightnessDistanceFactor: number;
  brightnessFalloffPower: number;
  brightnessFalloffScale: number;
  brightnessMin: number;

  // Scene
  seaY: number;
  showTrees: boolean;
  wireframe: boolean;

  // Debug
  showHud: boolean;
  showMinimap: boolean;
};

export const DEFAULT_SCENE_CONFIG: ZarchSceneConfig = {
  cameraFov: 70,
  cameraHeightMultiplier: 0.85,
  cameraPullbackMultiplier: 1.9,

  keyboardZoomSpeed: 1.4,
  viewRadiusBase: 6,
  zoomDamping: 7,
  zoomMax: 2.5,
  zoomMin: 0.4,

  ambientIntensity: 0.6,
  directionalIntensity: 0.8,
  directionalPosition: [200, 400, 100],
  shadowBias: -0.001,
  shadowMapSize: 1024,

  backgroundColor: '#000000',
  brightnessDistanceFactor: 2.8,
  brightnessFalloffPower: 2,
  brightnessFalloffScale: 0.88,
  brightnessMin: 0.12,

  seaY: -12,
  showTrees: true,
  wireframe: false,

  showHud: true,
  showMinimap: true
};

export const sceneConfigAtom = atom<ZarchSceneConfig>(DEFAULT_SCENE_CONFIG);

export const sceneConfigStore = createStore();
