import { useEffect, useRef } from 'react';

import { useAtomValue } from 'jotai';
import { useControls } from 'leva';

import {
  DEFAULT_SCENE_CONFIG,
  sceneConfigAtom,
  sceneConfigStore,
  type ZarchSceneConfig
} from '@/helpers/zarch-scene-config';

/**
 * Mounts Leva controls and syncs their values into the Jotai sceneConfigAtom.
 * Render this component only in dev mode.
 */
export const DevSceneControls = () => {
  const cameraValues = useControls('Camera', {
    cameraFov: {
      label: 'FOV',
      max: 120,
      min: 30,
      step: 1,
      value: DEFAULT_SCENE_CONFIG.cameraFov
    },
    cameraHeightMultiplier: {
      label: 'Height mult',
      max: 5,
      min: 0.3,
      step: 0.05,
      value: DEFAULT_SCENE_CONFIG.cameraHeightMultiplier
    },
    cameraPullbackMultiplier: {
      label: 'Pullback mult',
      max: 5,
      min: 0.5,
      step: 0.05,
      value: DEFAULT_SCENE_CONFIG.cameraPullbackMultiplier
    }
  });

  const viewValues = useControls('View', {
    keyboardZoomSpeed: {
      label: 'KB zoom speed',
      max: 5,
      min: 0.2,
      step: 0.1,
      value: DEFAULT_SCENE_CONFIG.keyboardZoomSpeed
    },
    viewRadiusBase: {
      label: 'View radius',
      max: 16,
      min: 2,
      step: 1,
      value: DEFAULT_SCENE_CONFIG.viewRadiusBase
    },
    zoomDamping: {
      label: 'Zoom damping',
      max: 20,
      min: 1,
      step: 0.5,
      value: DEFAULT_SCENE_CONFIG.zoomDamping
    },
    zoomMax: {
      label: 'Zoom max',
      max: 6,
      min: 1,
      step: 0.1,
      value: DEFAULT_SCENE_CONFIG.zoomMax
    },
    zoomMin: {
      label: 'Zoom min',
      max: 1,
      min: 0.1,
      step: 0.05,
      value: DEFAULT_SCENE_CONFIG.zoomMin
    }
  });

  const lightingValues = useControls('Lighting', {
    ambientIntensity: {
      label: 'Ambient',
      max: 2,
      min: 0,
      step: 0.05,
      value: DEFAULT_SCENE_CONFIG.ambientIntensity
    },
    directionalIntensity: {
      label: 'Directional',
      max: 3,
      min: 0,
      step: 0.05,
      value: DEFAULT_SCENE_CONFIG.directionalIntensity
    },
    directionalPosition: {
      label: 'Dir position',
      value: DEFAULT_SCENE_CONFIG.directionalPosition,
      joystick: true
    },
    shadowBias: {
      label: 'Shadow bias',
      max: 0,
      min: -0.01,
      step: 0.0001,
      value: DEFAULT_SCENE_CONFIG.shadowBias
    },
    shadowMapSize: {
      label: 'Shadow map',
      options: [256, 512, 1024, 2048, 4096],
      value: DEFAULT_SCENE_CONFIG.shadowMapSize
    }
  });

  const renderingValues = useControls('Rendering', {
    backgroundColor: {
      label: 'Background',
      value: DEFAULT_SCENE_CONFIG.backgroundColor
    },
    brightnessDistanceFactor: {
      label: 'Bright dist',
      max: 6,
      min: 1,
      step: 0.1,
      value: DEFAULT_SCENE_CONFIG.brightnessDistanceFactor
    },
    brightnessFalloffPower: {
      label: 'Bright power',
      max: 5,
      min: 0.5,
      step: 0.1,
      value: DEFAULT_SCENE_CONFIG.brightnessFalloffPower
    },
    brightnessFalloffScale: {
      label: 'Bright scale',
      max: 1,
      min: 0,
      step: 0.01,
      value: DEFAULT_SCENE_CONFIG.brightnessFalloffScale
    },
    brightnessMin: {
      label: 'Bright min',
      max: 1,
      min: 0,
      step: 0.01,
      value: DEFAULT_SCENE_CONFIG.brightnessMin
    }
  });

  const sceneValues = useControls('Scene', {
    seaY: {
      label: 'Sea Y',
      max: 0,
      min: -30,
      step: 0.5,
      value: DEFAULT_SCENE_CONFIG.seaY
    },
    showTrees: {
      label: 'Trees',
      value: DEFAULT_SCENE_CONFIG.showTrees
    },
    wireframe: {
      label: 'Wireframe',
      value: DEFAULT_SCENE_CONFIG.wireframe
    }
  });

  const debugValues = useControls('Debug', {
    showHud: {
      label: 'HUD',
      value: DEFAULT_SCENE_CONFIG.showHud
    },
    showMinimap: {
      label: 'Minimap',
      value: DEFAULT_SCENE_CONFIG.showMinimap
    }
  });

  useEffect(() => {
    sceneConfigStore.set(sceneConfigAtom, {
      ...cameraValues,
      ...viewValues,
      ...lightingValues,
      ...renderingValues,
      ...sceneValues,
      ...debugValues
    } as ZarchSceneConfig);
  }, [
    cameraValues,
    viewValues,
    lightingValues,
    renderingValues,
    sceneValues,
    debugValues
  ]);

  return null;
};

/**
 * Returns a mutable ref that stays in sync with the sceneConfigAtom.
 * Use in useFrame / render loops for zero-cost reads.
 */
export const useSceneConfigRef = () => {
  const config = useAtomValue(sceneConfigAtom, {
    store: sceneConfigStore
  });
  const ref = useRef<ZarchSceneConfig>({ ...DEFAULT_SCENE_CONFIG });

  useEffect(() => {
    Object.assign(ref.current, config);
  }, [config]);

  return ref;
};

/**
 * Read a single reactive config value (triggers re-render on change).
 */
export const useSceneConfigValue = <K extends keyof ZarchSceneConfig>(
  key: K
): ZarchSceneConfig[K] => {
  const config = useAtomValue(sceneConfigAtom, {
    store: sceneConfigStore
  });
  return config[key];
};
