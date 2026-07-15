import { useEffect, useRef } from 'react';

import { useAtomValue } from 'jotai';
import { monitor, useControls } from 'leva';

import {
  DEFAULT_SCENE_CONFIG,
  LANDSCAPE_CLIP_SCALE_MAX,
  LANDSCAPE_CLIP_SCALE_MIN,
  sceneConfigAtom,
  sceneConfigStore,
  type ZarchSceneConfig
} from '@/helpers/zarch-scene-config';
import { getLatestTankDiagnostics } from '@/screens/zarch/zarch-tank-diagnostics';

export const LEVA_CONTROL_FOLDERS = [
  'Camera',
  'View',
  'Lighting',
  'Rendering',
  'Scene',
  'Particles',
  'Tank',
  'Debug'
] as const;

export type LevaControlFolder = (typeof LEVA_CONTROL_FOLDERS)[number];

export type DevSceneControlFolderState = Partial<
  Record<LevaControlFolder, boolean>
>;

/**
 * Mounts Leva controls and syncs their values into the Jotai sceneConfigAtom.
 * Render this component only in dev mode.
 */
export const DevSceneControls = ({
  folderState = {}
}: {
  folderState?: DevSceneControlFolderState;
}) => {
  const cameraValues = useControls(
    'Camera',
    {
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
    },
    {
      collapsed: folderState.Camera ?? false
    }
  );

  const viewValues = useControls(
    'View',
    {
      keyboardZoomSpeed: {
        label: 'KB zoom speed',
        max: 5,
        min: 0.2,
        step: 0.1,
        value: DEFAULT_SCENE_CONFIG.keyboardZoomSpeed
      },
      landscapeClipScale: {
        label: 'Landscape clip',
        max: LANDSCAPE_CLIP_SCALE_MAX,
        min: LANDSCAPE_CLIP_SCALE_MIN,
        step: 0.1,
        value: DEFAULT_SCENE_CONFIG.landscapeClipScale
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
    },
    {
      collapsed: folderState.View ?? false
    }
  );

  const lightingValues = useControls(
    'Lighting',
    {
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
        joystick: true,
        label: 'Dir position',
        value: DEFAULT_SCENE_CONFIG.directionalPosition
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
    },
    {
      collapsed: folderState.Lighting ?? false
    }
  );

  const renderingValues = useControls(
    'Rendering',
    {
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
    },
    {
      collapsed: folderState.Rendering ?? false
    }
  );

  const sceneValues = useControls(
    'Scene',
    {
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
    },
    {
      collapsed: folderState.Scene ?? false
    }
  );

  const particleValues = useControls(
    'Particles',
    {
      particleGravity: {
        label: 'Gravity',
        max: 400,
        min: 20,
        step: 5,
        value: DEFAULT_SCENE_CONFIG.particleGravity
      },
      particleLandClusterCount: {
        label: 'Land clusters',
        max: 12,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleLandClusterCount
      },
      particleLandVelocityScale: {
        label: 'Land velocity',
        max: 3,
        min: 0.2,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.particleLandVelocityScale
      },
      particleShadowLift: {
        label: 'Shadow lift',
        max: 2,
        min: 0,
        step: 0.01,
        value: DEFAULT_SCENE_CONFIG.particleShadowLift
      },
      particleShadowOpacity: {
        label: 'Shadow alpha',
        max: 0.8,
        min: 0,
        step: 0.01,
        value: DEFAULT_SCENE_CONFIG.particleShadowOpacity
      },
      particleShadowScale: {
        label: 'Shadow scale',
        max: 3,
        min: 0.2,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.particleShadowScale
      },
      particleShadowStretch: {
        label: 'Shadow stretch',
        max: 2,
        min: 0.2,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.particleShadowStretch
      },
      particleSizeScale: {
        label: 'Size scale',
        max: 3,
        min: 0.2,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.particleSizeScale
      },
      particleSmokeRiseScale: {
        label: 'Smoke rise',
        max: 3,
        min: 0.2,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.particleSmokeRiseScale
      },
      particleTapMaxDurationMs: {
        label: 'Tap ms',
        max: 400,
        min: 50,
        step: 5,
        value: DEFAULT_SCENE_CONFIG.particleTapMaxDurationMs
      },
      particleTapMaxMovementPx: {
        label: 'Tap px',
        max: 24,
        min: 2,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleTapMaxMovementPx
      },
      particleThrustEmissionRate: {
        label: 'Thrust rate',
        max: 128,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleThrustEmissionRate
      },
      particleThrustLandDustCount: {
        label: 'Thrust dust',
        max: 16,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleThrustLandDustCount
      },
      particleThrustSpeed: {
        label: 'Thrust speed',
        max: 120,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleThrustSpeed
      },
      particleThrustSpread: {
        label: 'Thrust spread',
        max: 12,
        min: 0,
        step: 0.1,
        value: DEFAULT_SCENE_CONFIG.particleThrustSpread
      },
      particleThrustWaterDisturbanceHeight: {
        label: 'Thrust water h',
        max: 64,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleThrustWaterDisturbanceHeight
      },
      particleThrustWaterSprayCount: {
        label: 'Thrust spray',
        max: 24,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleThrustWaterSprayCount
      },
      particleWaterImpactSprayCount: {
        label: 'Impact spray',
        max: 48,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleWaterImpactSprayCount
      },
      particleWaterVelocityScale: {
        label: 'Water velocity',
        max: 3,
        min: 0.2,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.particleWaterVelocityScale
      },
      particleWaterWaveCount: {
        label: 'Water count',
        max: 96,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.particleWaterWaveCount
      }
    },
    {
      collapsed: folderState.Particles ?? false
    }
  );

  const tankValues = useControls(
    'Tank',
    {
      airborne: monitor(() => getLatestTankDiagnostics()?.airborne ?? false, {
        interval: 100
      }),
      airborneUprightStrength: {
        label: 'Air upright',
        max: 1,
        min: 0,
        step: 0.01,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.airborneUprightStrength
      },
      cameraDamping: {
        label: 'Camera damping',
        max: 20,
        min: 0.5,
        step: 0.5,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.cameraDamping
      },
      cameraLeadSeconds: {
        label: 'Camera lead s',
        max: 1,
        min: 0,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.cameraLeadSeconds
      },
      cameraMaxLeadMeters: {
        label: 'Camera lead m',
        max: 20,
        min: 0,
        step: 0.5,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.cameraMaxLeadMeters
      },
      compression: monitor(
        () =>
          getLatestTankDiagnostics()
            ?.contacts.map(contact =>
              contact.supported ? contact.compression.toFixed(2) : '--'
            )
            .join(' / ') ?? '-- / -- / -- / --',
        { interval: 100 }
      ),
      driveAcceleration: {
        label: 'Drive accel',
        max: 20,
        min: 1,
        step: 0.5,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.driveAcceleration
      },
      forwardSpeed: {
        label: 'Forward m/s',
        max: 30,
        min: 1,
        step: 0.5,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.forwardSpeed
      },
      lateralGrip: {
        label: 'Lateral grip',
        max: 3,
        min: 0,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.lateralGrip
      },
      recovery: monitor(
        () => {
          const diagnostics = getLatestTankDiagnostics();
          if (diagnostics?.recovered) {
            return 'restored';
          }
          return diagnostics && diagnostics.unavailableSeconds > 0
            ? `waiting ${diagnostics.unavailableSeconds.toFixed(2)}s`
            : 'ready';
        },
        { interval: 100 }
      ),
      reverseSpeed: {
        label: 'Reverse m/s',
        max: 20,
        min: 1,
        step: 0.5,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.reverseSpeed
      },
      slopeDegrees: monitor(
        () => getLatestTankDiagnostics()?.slopeDegrees.toFixed(1) ?? '0.0',
        { interval: 100 }
      ),
      speedMetersPerSecond: monitor(
        () =>
          getLatestTankDiagnostics()?.speedMetersPerSecond.toFixed(1) ?? '0.0',
        { interval: 100 }
      ),
      supportCount: monitor(
        () => getLatestTankDiagnostics()?.supportCount ?? 0,
        { interval: 100 }
      ),
      suspensionDampingRatio: {
        label: 'Susp damping',
        max: 2,
        min: 0.1,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.suspensionDampingRatio
      },
      suspensionFrequencyHertz: {
        label: 'Susp Hz',
        max: 6,
        min: 0.5,
        step: 0.1,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.suspensionFrequencyHertz
      },
      suspensionRideDistance: {
        label: 'Ride distance',
        max: 3,
        min: 0.5,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.suspensionRideDistance
      },
      suspensionTravel: {
        label: 'Susp travel',
        max: 1,
        min: 0.05,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.suspensionTravel
      },
      uprightDamping: {
        label: 'Upright damping',
        max: 50,
        min: 0,
        step: 0.05,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.uprightDamping
      },
      uprightLimitRadians: {
        label: 'Upright limit rad',
        max: Math.PI / 2,
        min: 0.1,
        step: 0.01,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.uprightLimitRadians
      },
      uprightStrength: {
        label: 'Upright strength',
        max: 400,
        min: 0,
        step: 1,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.uprightStrength
      },
      uprightTargetLimitRadians: {
        label: 'Target tilt rad',
        max: Math.PI / 2,
        min: 0,
        step: 0.01,
        value: DEFAULT_SCENE_CONFIG.tankDynamics.uprightTargetLimitRadians
      }
    },
    {
      collapsed: folderState.Tank ?? false
    }
  );

  const debugValues = useControls(
    'Debug',
    {
      showHud: {
        label: 'HUD',
        value: DEFAULT_SCENE_CONFIG.showHud
      },
      showMinimap: {
        label: 'Minimap',
        value: DEFAULT_SCENE_CONFIG.showMinimap
      }
    },
    {
      collapsed: folderState.Debug ?? false
    }
  );

  useEffect(() => {
    sceneConfigStore.set(sceneConfigAtom, {
      ...cameraValues,
      ...viewValues,
      ...lightingValues,
      ...particleValues,
      ...renderingValues,
      ...sceneValues,
      tankDynamics: {
        ...DEFAULT_SCENE_CONFIG.tankDynamics,
        ...tankValues
      },
      ...debugValues
    } as ZarchSceneConfig);
  }, [
    cameraValues,
    viewValues,
    lightingValues,
    particleValues,
    renderingValues,
    sceneValues,
    tankValues,
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
