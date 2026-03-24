import { useEffect, useMemo, useRef, type RefObject } from 'react';

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  FrontSide,
  Group,
  InstancedMesh,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Plane,
  PlaneGeometry,
  Raycaster,
  Vector2,
  Vector3,
  type AmbientLight,
  type DirectionalLight,
  type Intersection,
  type PerspectiveCamera
} from 'three';
import { PerspectiveCamera as PerspectiveCameraImpl } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

import type { MapMetadata } from 'carrier-contracts/types';

import {
  TILE,
  TILE_POOL_SIZE,
  TREE_POOL_SIZE,
  clampZoom,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';
import {
  useSceneConfigRef,
  useSceneConfigValue
} from '@/hooks/use-scene-controls';

import type { ZarchInputState, ZarchRuntimeState } from './use-zarch-runtime';
import { wrapWorldCoordinate } from './zarch-minimap';
import {
  PARTICLE_ASPECT_BY_KIND,
  PARTICLE_CAPACITY,
  createParticleSystemState,
  emitTapParticlePreset,
  simulateParticleSystem
} from './zarch-particles';
import { ZarchStaticEntities } from './zarch-static-entities';

type TileMesh = Mesh<BufferGeometry, MeshLambertMaterial>;
type ParticleMesh = InstancedMesh<PlaneGeometry, MeshBasicMaterial>;

type TreeMeshEntry = {
  pine: Group;
  round: Group;
};

type ScenePools = {
  particleMesh: ParticleMesh;
  particleShadowMesh: ParticleMesh;
  root: Group;
  tilePool: TileMesh[];
  treePool: TreeMeshEntry[];
};

type ZarchSceneProps = {
  inputRef: RefObject<ZarchInputState>;
  map: MapMetadata;
  runtimeRef: RefObject<ZarchRuntimeState>;
  terrain: ZarchTerrain;
};

const TILE_BASE_COLOR = new Color();
const TREE_BASE_COLOR = new Color();
const PARTICLE_COLOR = new Color();

const createClipPlanes = () => [
  new Plane(new Vector3(1, 0, 0), 0),
  new Plane(new Vector3(-1, 0, 0), 0),
  new Plane(new Vector3(0, 0, 1), 0),
  new Plane(new Vector3(0, 0, -1), 0)
];

const buildTileMesh = (clipPlanes: Plane[]) => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(12);

  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);

  const material = new MeshLambertMaterial({
    clippingPlanes: clipPlanes,
    color: 0xff_ff_ff,
    side: FrontSide
  });

  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  return mesh;
};

const buildParticleMesh = (clipPlanes: Plane[]) => {
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    clippingPlanes: clipPlanes,
    color: 0xff_ff_ff,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    transparent: true
  });

  const mesh = new InstancedMesh(geometry, material, PARTICLE_CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.renderOrder = 10;
  return mesh;
};

const buildParticleShadowMesh = (clipPlanes: Plane[]) => {
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    clippingPlanes: clipPlanes,
    color: 0x00_00_00,
    depthTest: true,
    depthWrite: false,
    opacity: 0.34,
    toneMapped: false,
    transparent: true
  });

  const mesh = new InstancedMesh(geometry, material, PARTICLE_CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.renderOrder = 5;
  return mesh;
};

const recordTreeBaseColors = (group: Group) => {
  group.children.forEach(child => {
    const mesh = child as Mesh;
    const material = mesh.material as MeshLambertMaterial;
    mesh.userData.baseColor = material.color.getHex();
  });
};

const buildPineTree = (clipPlanes: Plane[]) => {
  const group = new Group();
  group.frustumCulled = false;

  const trunk = new Mesh(
    new CylinderGeometry(0.8, 1, 5, 5),
    new MeshLambertMaterial({
      clippingPlanes: clipPlanes,
      color: 0xc8_b8_9a
    })
  );
  trunk.castShadow = true;
  group.add(trunk);

  [
    { color: 0xa8_d8_a8, height: 10, radius: 7, y: 7 },
    { color: 0xc0_e8_c0, height: 9, radius: 5, y: 13 },
    { color: 0xd8_f0_d8, height: 8, radius: 3, y: 18 }
  ].forEach(tier => {
    const cone = new Mesh(
      new ConeGeometry(tier.radius, tier.height, 6),
      new MeshLambertMaterial({
        clippingPlanes: clipPlanes,
        color: tier.color
      })
    );
    cone.position.y = tier.y;
    cone.castShadow = true;
    group.add(cone);
  });

  recordTreeBaseColors(group);
  return group;
};

const buildRoundTree = (clipPlanes: Plane[]) => {
  const group = new Group();
  group.frustumCulled = false;

  const trunk = new Mesh(
    new CylinderGeometry(1.2, 1.5, 8, 5),
    new MeshLambertMaterial({
      clippingPlanes: clipPlanes,
      color: 0x6b_3a_2a
    })
  );
  trunk.position.y = 4;
  trunk.castShadow = true;
  group.add(trunk);

  [
    { color: 0x3a_7a_30, height: 10, radius: 7, y: 14 },
    { color: 0x4a_9a_3a, height: 8, radius: 5, y: 19 }
  ].forEach(tier => {
    const cone = new Mesh(
      new ConeGeometry(tier.radius, tier.height, 7),
      new MeshLambertMaterial({
        clippingPlanes: clipPlanes,
        color: tier.color
      })
    );
    cone.position.y = tier.y;
    cone.castShadow = true;
    group.add(cone);
  });

  recordTreeBaseColors(group);
  return group;
};

const createScenePools = (clipPlanes: Plane[]): ScenePools => {
  const root = new Group();
  const particleMesh = buildParticleMesh(clipPlanes);
  const particleShadowMesh = buildParticleShadowMesh(clipPlanes);
  const tilePool: TileMesh[] = [];
  const treePool: TreeMeshEntry[] = [];

  root.add(particleShadowMesh);
  root.add(particleMesh);

  for (let index = 0; index < TILE_POOL_SIZE; index += 1) {
    const mesh = buildTileMesh(clipPlanes);
    root.add(mesh);
    tilePool.push(mesh);
  }

  for (let index = 0; index < TREE_POOL_SIZE; index += 1) {
    const pine = buildPineTree(clipPlanes);
    const round = buildRoundTree(clipPlanes);

    pine.visible = false;
    round.visible = false;
    root.add(pine);
    root.add(round);
    treePool.push({ pine, round });
  }

  return { particleMesh, particleShadowMesh, root, tilePool, treePool };
};

const disposeScenePools = (root: Group) => {
  root.traverse(object => {
    const candidate = object as Partial<Mesh>;

    if (!('geometry' in candidate) || !('material' in candidate)) {
      return;
    }

    candidate.geometry?.dispose();

    if (Array.isArray(candidate.material)) {
      candidate.material.forEach(material => material.dispose());
      return;
    }

    candidate.material?.dispose();
  });
};

const setTreeBrightness = (group: Group, brightness: number) => {
  group.children.forEach(child => {
    const mesh = child as Mesh;
    const material = mesh.material as MeshLambertMaterial;
    TREE_BASE_COLOR.setHex(mesh.userData.baseColor as number).multiplyScalar(
      brightness
    );
    material.color.copy(TREE_BASE_COLOR);
  });
};

export const ZarchScene = ({
  inputRef,
  map,
  runtimeRef,
  terrain
}: ZarchSceneProps) => {
  const configRef = useSceneConfigRef();
  const ambientIntensity = useSceneConfigValue('ambientIntensity');
  const ambientRef = useRef<AmbientLight>(null);
  const backgroundColor = useSceneConfigValue('backgroundColor');
  const cameraRef = useRef<PerspectiveCamera>(null);
  const cameraFov = useSceneConfigValue('cameraFov');
  const clipPlanesRef = useRef<Plane[] | null>(null);
  const directionalIntensity = useSceneConfigValue('directionalIntensity');
  const directionalPosition = useSceneConfigValue('directionalPosition');
  const directionalRef = useRef<DirectionalLight>(null);
  const shadowBias = useSceneConfigValue('shadowBias');
  const shadowMapSize = useSceneConfigValue('shadowMapSize');
  const viewRadiusBase = useSceneConfigValue('viewRadiusBase');
  const forwardRef = useRef(new Vector3());
  const intersectionsRef = useRef<Intersection[]>([]);
  const particleDummyRef = useRef(new Object3D());
  const particleShadowDummyRef = useRef(new Object3D());
  const particleNdcRef = useRef(new Vector2());
  const particleRaycasterRef = useRef(new Raycaster());
  const particleSystemRef = useRef(createParticleSystemState());
  const poolsRef = useRef<ScenePools | null>(null);
  const rightRef = useRef(new Vector3());
  const worldRef = useRef<Group>(null);
  const particleSurface = useMemo(
    () => ({
      getHeightAt: (x: number, z: number) => {
        const gx = Math.floor(x / TILE);
        const gz = Math.floor(z / TILE);

        if (!terrain.isTileLoaded(gx, gz)) {
          return null;
        }

        if (terrain.isWaterTile(gx, gz)) {
          return configRef.current.seaY;
        }

        return terrain.getTileAverageHeight(gx, gz);
      },
      isWaterAt: (x: number, z: number) => {
        const gx = Math.floor(x / TILE);
        const gz = Math.floor(z / TILE);
        return terrain.isTileLoaded(gx, gz) && terrain.isWaterTile(gx, gz);
      }
    }),
    [configRef, terrain]
  );

  useEffect(() => {
    const world = worldRef.current;

    if (!world) {
      return;
    }

    const clipPlanes = createClipPlanes();
    const pools = createScenePools(clipPlanes);

    clipPlanesRef.current = clipPlanes;
    poolsRef.current = pools;
    world.add(pools.root);

    return () => {
      world.remove(pools.root);
      disposeScenePools(pools.root);
      clipPlanesRef.current = null;
      poolsRef.current = null;
    };
  }, []);

  useEffect(() => {
    particleSystemRef.current.count = 0;
  }, [terrain.id]);

  useFrame((state, delta) => {
    const camera = cameraRef.current;
    const config = configRef.current;
    const intersections = intersectionsRef.current;
    const particleDummy = particleDummyRef.current;
    const particleShadowDummy = particleShadowDummyRef.current;
    const particleNdc = particleNdcRef.current;
    const particleRaycaster = particleRaycasterRef.current;
    const particleSystem = particleSystemRef.current;
    const runtime = runtimeRef.current;
    const input = inputRef.current;
    const clipPlanes = clipPlanesRef.current;
    const pools = poolsRef.current;
    const dt = Math.min(delta, 0.05);
    const forward = forwardRef.current;
    const right = rightRef.current;

    if (!camera || !clipPlanes || !pools) {
      return;
    }

    // Imperative camera/light updates from config
    if (camera.fov !== config.cameraFov) {
      camera.fov = config.cameraFov;
      camera.updateProjectionMatrix();
    }

    if (ambientRef.current) {
      ambientRef.current.intensity = config.ambientIntensity;
    }

    if (directionalRef.current) {
      directionalRef.current.intensity = config.directionalIntensity;
      directionalRef.current.position.set(...config.directionalPosition);
      directionalRef.current.shadow.bias = config.shadowBias;
    }

    forward.set(-Math.sin(runtime.camYaw), 0, -Math.cos(runtime.camYaw));
    right.set(Math.cos(runtime.camYaw), 0, -Math.sin(runtime.camYaw));

    let ax = 0;
    let az = 0;

    if (input.keys.ArrowUp || input.keys.w || input.keys.W) {
      ax -= forward.x;
      az -= forward.z;
    }
    if (input.keys.ArrowDown || input.keys.s || input.keys.S) {
      ax += forward.x;
      az += forward.z;
    }
    if (input.keys.ArrowLeft || input.keys.a || input.keys.A) {
      ax += right.x;
      az += right.z;
    }
    if (input.keys.ArrowRight || input.keys.d || input.keys.D) {
      ax -= right.x;
      az -= right.z;
    }
    if (input.keys.q || input.keys.Q) {
      runtime.camZoomTarget = clampZoom(
        runtime.camZoomTarget - config.keyboardZoomSpeed * dt,
        config.zoomMin,
        config.zoomMax
      );
    }
    if (input.keys.e || input.keys.E) {
      runtime.camZoomTarget = clampZoom(
        runtime.camZoomTarget + config.keyboardZoomSpeed * dt,
        config.zoomMin,
        config.zoomMax
      );
    }

    runtime.velX += ax * 400 * dt;
    runtime.velZ += az * 400 * dt;
    runtime.velX -= runtime.velX * 2.5 * dt;
    runtime.velZ -= runtime.velZ * 2.5 * dt;
    runtime.camX += runtime.velX * dt;
    runtime.camZ += runtime.velZ * dt;
    if (terrain.widthTiles !== null && terrain.wrapX) {
      runtime.camX = wrapWorldCoordinate(
        runtime.camX,
        terrain.widthTiles * TILE
      );
    } else if (terrain.widthTiles !== null) {
      runtime.camX = MathUtils.clamp(
        runtime.camX,
        0,
        Math.max((terrain.widthTiles - 1) * TILE, 0)
      );
    }
    if (terrain.heightTiles !== null && terrain.wrapZ) {
      runtime.camZ = wrapWorldCoordinate(
        runtime.camZ,
        terrain.heightTiles * TILE
      );
    } else if (terrain.heightTiles !== null) {
      runtime.camZ = MathUtils.clamp(
        runtime.camZ,
        0,
        Math.max((terrain.heightTiles - 1) * TILE, 0)
      );
    }
    runtime.camZoom = MathUtils.damp(
      runtime.camZoom,
      runtime.camZoomTarget,
      config.zoomDamping,
      dt
    );
    runtime.score += Math.trunc(
      Math.round(Math.abs(runtime.velX) + Math.abs(runtime.velZ)) * dt
    );

    const zoomRadius = config.viewRadiusBase * runtime.camZoom;
    const viewRadius = Math.ceil(zoomRadius);
    const clipRadius = Math.max((zoomRadius - 0.6) * TILE, TILE);
    const pullBack = clipRadius * config.cameraPullbackMultiplier;
    const cameraHeight = clipRadius * config.cameraHeightMultiplier;

    camera.position.set(
      -Math.sin(runtime.camYaw) * pullBack,
      cameraHeight,
      -Math.cos(runtime.camYaw) * pullBack
    );
    camera.lookAt(0, 0, 0);

    const camTileX = Math.floor(runtime.camX / TILE);
    const camTileZ = Math.floor(runtime.camZ / TILE);

    terrain.requestVisibleChunks(camTileX, camTileZ, viewRadius);

    let tileIndex = 0;
    let treeIndex = 0;

    for (let dz = -viewRadius; dz <= viewRadius; dz += 1) {
      for (let dx = -viewRadius; dx <= viewRadius; dx += 1) {
        const gx = camTileX + dx;
        const gz = camTileZ + dz;
        const worldX = gx * TILE - runtime.camX;
        const worldZ = gz * TILE - runtime.camZ;

        if (!terrain.containsTile(gx, gz)) {
          continue;
        }

        const tileMesh = pools.tilePool[tileIndex];
        const h00Raw = terrain.sampleHeight(gx, gz);
        const h10Raw = terrain.sampleHeight(gx + 1, gz);
        const h01Raw = terrain.sampleHeight(gx, gz + 1);
        const h11Raw = terrain.sampleHeight(gx + 1, gz + 1);

        if (
          h00Raw === null ||
          h10Raw === null ||
          h01Raw === null ||
          h11Raw === null
        ) {
          continue;
        }

        const elevation = (h00Raw + h10Raw + h01Raw + h11Raw) * 0.25;
        const isWater = terrain.isWaterTile(gx, gz);
        const c00Water =
          terrain.isWaterTile(gx - 1, gz - 1) ||
          terrain.isWaterTile(gx, gz - 1) ||
          terrain.isWaterTile(gx - 1, gz) ||
          terrain.isWaterTile(gx, gz);
        const c10Water =
          terrain.isWaterTile(gx, gz - 1) ||
          terrain.isWaterTile(gx + 1, gz - 1) ||
          terrain.isWaterTile(gx, gz) ||
          terrain.isWaterTile(gx + 1, gz);
        const c01Water =
          terrain.isWaterTile(gx - 1, gz) ||
          terrain.isWaterTile(gx, gz) ||
          terrain.isWaterTile(gx - 1, gz + 1) ||
          terrain.isWaterTile(gx, gz + 1);
        const c11Water =
          terrain.isWaterTile(gx, gz) ||
          terrain.isWaterTile(gx + 1, gz) ||
          terrain.isWaterTile(gx, gz + 1) ||
          terrain.isWaterTile(gx + 1, gz + 1);
        const h00 = isWater || c00Water ? config.seaY : h00Raw;
        const h10 = isWater || c10Water ? config.seaY : h10Raw;
        const h01 = isWater || c01Water ? config.seaY : h01Raw;
        const h11 = isWater || c11Water ? config.seaY : h11Raw;
        const tileCenterX = worldX + TILE * 0.5;
        const tileCenterZ = worldZ + TILE * 0.5;
        const distance = Math.sqrt(
          (tileCenterX - camera.position.x) ** 2 +
            (elevation - camera.position.y) ** 2 +
            (tileCenterZ - camera.position.z) ** 2
        );
        const brightness = Math.max(
          config.brightnessMin,
          1 -
            MathUtils.clamp(
              distance / (clipRadius * config.brightnessDistanceFactor),
              0,
              1
            ) **
              config.brightnessFalloffPower *
              config.brightnessFalloffScale
        );
        const positions = tileMesh.geometry.attributes
          .position as BufferAttribute;
        const tileKey = `${gx}:${gz}`;

        terrain.tileColor(gx, gz, elevation, TILE_BASE_COLOR);
        tileMesh.material.color
          .copy(TILE_BASE_COLOR)
          .multiplyScalar(brightness);
        tileMesh.material.wireframe = config.wireframe;
        tileMesh.visible = true;
        tileMesh.userData.gridX = gx;
        tileMesh.userData.gridZ = gz;
        positions.setXYZ(0, worldX, h00, worldZ);
        positions.setXYZ(1, worldX + TILE, h10, worldZ);
        positions.setXYZ(2, worldX, h01, worldZ + TILE);
        positions.setXYZ(3, worldX + TILE, h11, worldZ + TILE);
        positions.needsUpdate = true;
        tileMesh.geometry.computeBoundingSphere();

        if (tileMesh.userData.tileKey !== tileKey) {
          tileMesh.geometry.computeVertexNormals();
          tileMesh.userData.tileKey = tileKey;
        }

        tileIndex += 1;

        const canPlaceTree =
          config.showTrees &&
          treeIndex < TREE_POOL_SIZE &&
          !isWater &&
          !(c00Water || c10Water || c01Water || c11Water) &&
          terrain.isTileLoaded(gx, gz) &&
          terrain.shouldHaveTree(gx, gz);

        if (!canPlaceTree) {
          continue;
        }

        const treeEntry = pools.treePool[treeIndex];
        const usePine = terrain.treeType(gx, gz) === 0;
        const activeTree = usePine ? treeEntry.pine : treeEntry.round;
        const inactiveTree = usePine ? treeEntry.round : treeEntry.pine;

        inactiveTree.visible = false;
        activeTree.visible = true;
        activeTree.position.set(
          worldX + TILE * 0.5,
          (h00 + h10 + h01 + h11) * 0.25,
          worldZ + TILE * 0.5
        );
        setTreeBrightness(activeTree, brightness);
        treeIndex += 1;
      }
    }

    for (let index = tileIndex; index < TILE_POOL_SIZE; index += 1) {
      pools.tilePool[index].visible = false;
    }

    for (let index = treeIndex; index < TREE_POOL_SIZE; index += 1) {
      pools.treePool[index].pine.visible = false;
      pools.treePool[index].round.visible = false;
    }

    clipPlanes[0].setComponents(1, 0, 0, clipRadius);
    clipPlanes[1].setComponents(-1, 0, 0, clipRadius);
    clipPlanes[2].setComponents(0, 0, 1, clipRadius);
    clipPlanes[3].setComponents(0, 0, -1, clipRadius);

    if (input.queuedTap) {
      const rect = state.gl.domElement.getBoundingClientRect();
      const tap = input.queuedTap;
      input.queuedTap = null;

      if (rect.width > 0 && rect.height > 0) {
        particleNdc.set(
          ((tap.clientX - rect.left) / rect.width) * 2 - 1,
          -(((tap.clientY - rect.top) / rect.height) * 2 - 1)
        );
        intersections.length = 0;
        particleRaycaster.setFromCamera(particleNdc, camera);
        particleRaycaster.intersectObjects(
          pools.tilePool,
          false,
          intersections
        );

        const hit = intersections[0];

        if (hit) {
          const tileMesh = hit.object as TileMesh;
          const gx = tileMesh.userData.gridX as number | undefined;
          const gz = tileMesh.userData.gridZ as number | undefined;

          if (
            typeof gx === 'number' &&
            typeof gz === 'number' &&
            terrain.isTileLoaded(gx, gz)
          ) {
            const isWater = terrain.isWaterTile(gx, gz);
            emitTapParticlePreset(
              particleSystem,
              isWater ? 'water-tap' : 'land-tap',
              {
                x: hit.point.x + runtime.camX,
                y: isWater ? config.seaY : hit.point.y,
                z: hit.point.z + runtime.camZ
              },
              config
            );
          }
        }
      }
    }

    simulateParticleSystem(particleSystem, dt, particleSurface, config);

    let shadowCount = 0;

    for (let index = 0; index < particleSystem.count; index += 1) {
      const size = particleSystem.size[index];
      const aspect =
        PARTICLE_ASPECT_BY_KIND[particleSystem.kind[index] ?? 0] ?? 1;
      const surfaceHeight = particleSurface.getHeightAt(
        particleSystem.x[index],
        particleSystem.z[index]
      );

      particleDummy.position.set(
        particleSystem.x[index] - runtime.camX,
        particleSystem.y[index],
        particleSystem.z[index] - runtime.camZ
      );
      particleDummy.quaternion.copy(camera.quaternion);
      particleDummy.scale.set(size, size * aspect, 1);
      particleDummy.updateMatrix();
      pools.particleMesh.setMatrixAt(index, particleDummy.matrix);
      PARTICLE_COLOR.setHex(particleSystem.color[index] ?? 0xff_ff_ff);
      pools.particleMesh.setColorAt(index, PARTICLE_COLOR);

      if (surfaceHeight === null) {
        continue;
      }

      const heightAboveSurface = Math.max(
        particleSystem.y[index] - surfaceHeight,
        0
      );
      const shadowScale =
        size *
        config.particleShadowScale *
        (1 + Math.min(heightAboveSurface * 0.025, 1.2));
      const shadowDepth = shadowScale * (aspect * config.particleShadowStretch);
      particleShadowDummy.position.set(
        particleSystem.x[index] - runtime.camX,
        surfaceHeight + config.particleShadowLift,
        particleSystem.z[index] - runtime.camZ
      );
      particleShadowDummy.rotation.set(-Math.PI / 2, 0, 0);
      particleShadowDummy.scale.set(shadowScale, shadowDepth, 1);
      particleShadowDummy.updateMatrix();
      pools.particleShadowMesh.setMatrixAt(
        shadowCount,
        particleShadowDummy.matrix
      );
      PARTICLE_COLOR.setRGB(0, 0, 0);
      pools.particleShadowMesh.setColorAt(shadowCount, PARTICLE_COLOR);
      shadowCount += 1;
    }

    pools.particleMesh.count = particleSystem.count;
    pools.particleMesh.instanceMatrix.needsUpdate = true;
    pools.particleShadowMesh.count = shadowCount;
    pools.particleShadowMesh.instanceMatrix.needsUpdate = true;
    pools.particleShadowMesh.material.opacity = config.particleShadowOpacity;

    if (pools.particleMesh.instanceColor) {
      pools.particleMesh.instanceColor.needsUpdate = true;
    }

    if (pools.particleShadowMesh.instanceColor) {
      pools.particleShadowMesh.instanceColor.needsUpdate = true;
    }
  });

  const shadowExtent = viewRadiusBase * 2.5 * TILE * 1.2;

  return (
    <>
      <color args={[backgroundColor]} attach="background" />
      <PerspectiveCameraImpl
        far={5000}
        fov={cameraFov}
        makeDefault
        near={1}
        position={[0, 0, 0]}
        ref={cameraRef}
      />
      <group ref={worldRef}>
        <ZarchStaticEntities map={map} runtimeRef={runtimeRef} />
      </group>
      <ambientLight intensity={ambientIntensity} ref={ambientRef} />
      <directionalLight
        castShadow
        intensity={directionalIntensity}
        position={directionalPosition}
        ref={directionalRef}
        shadow-bias={shadowBias}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-far={2000}
        shadow-camera-left={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-mapSize-height={shadowMapSize}
        shadow-mapSize-width={shadowMapSize}
      />
    </>
  );
};
