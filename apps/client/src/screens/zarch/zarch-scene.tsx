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
  LineBasicMaterial,
  LineSegments,
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
  type BufferGeometry as BufferGeometryType,
  type DirectionalLight,
  type Intersection,
  type Material,
  type PerspectiveCamera
} from 'three';
import { PerspectiveCamera as PerspectiveCameraImpl } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';

import type { MapMetadata } from 'carrier-contracts/types';

import { client } from '@/helpers/api-link';
import {
  TILE,
  clampZoom,
  getLandscapeViewMetrics,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';
import {
  useSceneConfigRef,
  useSceneConfigValue
} from '@/hooks/use-scene-controls';
import { useQuery } from '@tanstack/react-query';

import type { ZarchInputState, ZarchRuntimeState } from './use-zarch-runtime';
import {
  DEFAULT_ZARCH_BULLET_SPEC,
  ZARCH_BULLET_CAPACITY,
  createShipBullet,
  stepZarchBullet
} from './zarch-bullets';
import { wrapWorldCoordinate } from './zarch-minimap';
import {
  PARTICLE_ASPECT_BY_KIND,
  PARTICLE_CAPACITY,
  createParticleSystemState,
  emitBulletImpactParticles,
  emitShipCrashParticles,
  emitShipThrustParticles,
  emitTapParticlePreset,
  simulateParticleSystem
} from './zarch-particles';
import {
  getPlayerShipExhaustDirection,
  getPlayerShipExhaustOrigin,
  stepPlayerShip
} from './zarch-player-ship';
import { loadZarchRuntimeEntityModel } from './zarch-runtime-entity-model';
import {
  ZarchStaticEntities,
  type ZarchStaticEntitiesHandle
} from './zarch-static-entities';

type TileMesh = Mesh<BufferGeometryType, MeshLambertMaterial>;
type ParticleMesh = InstancedMesh<PlaneGeometry, MeshBasicMaterial>;

const raycastToTile = (
  pointer: { clientX: number; clientY: number },
  rect: DOMRect,
  raycaster: Raycaster,
  ndc: Vector2,
  camera: PerspectiveCamera,
  tilePool: TileMesh[],
  intersections: Intersection[]
): { gx: number; gz: number } | null => {
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  ndc.set(
    ((pointer.clientX - rect.left) / rect.width) * 2 - 1,
    -(((pointer.clientY - rect.top) / rect.height) * 2 - 1)
  );
  intersections.length = 0;
  raycaster.setFromCamera(ndc, camera);
  raycaster.intersectObjects(tilePool, false, intersections);

  const hit = intersections[0];

  if (!hit) {
    return null;
  }

  const tileMesh = hit.object as TileMesh;
  const gx = tileMesh.userData.gridX as number | undefined;
  const gz = tileMesh.userData.gridZ as number | undefined;

  if (typeof gx !== 'number' || typeof gz !== 'number') {
    return null;
  }

  return { gx, gz };
};

type TreeMeshEntry = {
  pine: Group;
  round: Group;
};

type ScenePools = {
  bulletMesh: ParticleMesh;
  haloHighlightPool: LineSegments[];
  particleMesh: ParticleMesh;
  particleShadowMesh: ParticleMesh;
  root: Group;
  selectionHighlightPool: LineSegments[];
  tileHighlight: LineSegments;
  tilePool: TileMesh[];
  treePool: TreeMeshEntry[];
};

type EditorMode = 'terrain' | 'entities';

type EntityEditSceneState = {
  activeArchetypeId: string | null;
  activeAssetVersionId: string | null;
  hoveredEntityId: string | null;
  selectedEntityId: string | null;
  tool: 'place' | 'select';
};

type ZarchSceneProps = {
  editEnabled: boolean;
  editorMode: EditorMode;
  entityEditState: EntityEditSceneState | null;
  inputRef: RefObject<ZarchInputState>;
  map: MapMetadata;
  onEditTileActivate: (tileX: number, tileZ: number, shiftKey: boolean) => void;
  onEditTileHover: (tile: { tileX: number; tileZ: number } | null) => void;
  onEditTileSelectionStart: (tileX: number, tileZ: number) => void;
  onEditTileSelectionUpdate: (tileX: number, tileZ: number) => void;
  onEntityHover: (entityId: string | null) => void;
  onEntityPlace: (worldX: number, worldZ: number) => void;
  onEntitySelect: (entityId: string | null) => void;
  previewHaloTiles: { tileX: number; tileZ: number }[];
  runtimeRef: RefObject<ZarchRuntimeState>;
  selectedHeightPlane: number | null;
  selectedHeightTiles: { tileX: number; tileZ: number }[];
  terrain: ZarchTerrain;
};

const TILE_BASE_COLOR = new Color();
const TREE_BASE_COLOR = new Color();
const PARTICLE_COLOR = new Color();
const isCodePressed = (
  input: ZarchInputState,
  code: string,
  fallbackKey?: string
) => input.codes[code] || (fallbackKey ? input.keys[fallbackKey] : false);

const clampOrWrapFocus = ({
  terrain,
  x,
  z
}: {
  terrain: ZarchTerrain;
  x: number;
  z: number;
}) => {
  let nextX = x;
  let nextZ = z;

  if (terrain.widthTiles !== null && terrain.wrapX) {
    nextX = wrapWorldCoordinate(nextX, terrain.widthTiles * TILE);
  } else if (terrain.widthTiles !== null) {
    nextX = MathUtils.clamp(
      nextX,
      0,
      Math.max((terrain.widthTiles - 1) * TILE, 0)
    );
  }

  if (terrain.heightTiles !== null && terrain.wrapZ) {
    nextZ = wrapWorldCoordinate(nextZ, terrain.heightTiles * TILE);
  } else if (terrain.heightTiles !== null) {
    nextZ = MathUtils.clamp(
      nextZ,
      0,
      Math.max((terrain.heightTiles - 1) * TILE, 0)
    );
  }

  return { x: nextX, z: nextZ };
};

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

const buildTileHighlight = (clipPlanes: Plane[], color = 0xff_ff_ff) => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(12);

  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 1, 3, 3, 2, 2, 0]);

  const material = new LineBasicMaterial({
    clippingPlanes: clipPlanes,
    color,
    depthTest: true
  });

  const mesh = new LineSegments(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.visible = false;
  return mesh;
};

const getRenderedTileHeights = ({
  selectedHeightPlane,
  selectedTileKeys,
  terrain,
  tileX,
  tileZ
}: {
  selectedHeightPlane: number | null;
  selectedTileKeys: Set<string>;
  terrain: ZarchTerrain;
  tileX: number;
  tileZ: number;
}): readonly [number, number, number, number] | null => {
  const sampleRenderedVertexHeight = (vertexX: number, vertexZ: number) => {
    if (selectedHeightPlane !== null) {
      for (const [incidentTileX, incidentTileZ] of [
        [vertexX - 1, vertexZ - 1],
        [vertexX, vertexZ - 1],
        [vertexX - 1, vertexZ],
        [vertexX, vertexZ]
      ]) {
        if (selectedTileKeys.has(`${incidentTileX}:${incidentTileZ}`)) {
          return selectedHeightPlane;
        }
      }
    }

    return terrain.sampleHeight(vertexX, vertexZ);
  };

  const h00 = sampleRenderedVertexHeight(tileX, tileZ);
  const h10 = sampleRenderedVertexHeight(tileX + 1, tileZ);
  const h01 = sampleRenderedVertexHeight(tileX, tileZ + 1);
  const h11 = sampleRenderedVertexHeight(tileX + 1, tileZ + 1);

  if (h00 === null || h10 === null || h01 === null || h11 === null) {
    return null;
  }

  return [h00, h10, h01, h11];
};

const getDisplayTileHeights = ({
  seaY,
  selectedHeightPlane,
  selectedTileKeys,
  terrain,
  tileX,
  tileZ
}: {
  seaY: number;
  selectedHeightPlane: number | null;
  selectedTileKeys: Set<string>;
  terrain: ZarchTerrain;
  tileX: number;
  tileZ: number;
}) => {
  const rawHeights = getRenderedTileHeights({
    selectedHeightPlane,
    selectedTileKeys,
    terrain,
    tileX,
    tileZ
  });

  if (!rawHeights) {
    return null;
  }

  const [h00Raw, h10Raw, h01Raw, h11Raw] = rawHeights;
  const isWater = terrain.isWaterTile(tileX, tileZ);
  const c00Water =
    terrain.isWaterTile(tileX - 1, tileZ - 1) ||
    terrain.isWaterTile(tileX, tileZ - 1) ||
    terrain.isWaterTile(tileX - 1, tileZ) ||
    terrain.isWaterTile(tileX, tileZ);
  const c10Water =
    terrain.isWaterTile(tileX, tileZ - 1) ||
    terrain.isWaterTile(tileX + 1, tileZ - 1) ||
    terrain.isWaterTile(tileX, tileZ) ||
    terrain.isWaterTile(tileX + 1, tileZ);
  const c01Water =
    terrain.isWaterTile(tileX - 1, tileZ) ||
    terrain.isWaterTile(tileX, tileZ) ||
    terrain.isWaterTile(tileX - 1, tileZ + 1) ||
    terrain.isWaterTile(tileX, tileZ + 1);
  const c11Water =
    terrain.isWaterTile(tileX, tileZ) ||
    terrain.isWaterTile(tileX + 1, tileZ) ||
    terrain.isWaterTile(tileX, tileZ + 1) ||
    terrain.isWaterTile(tileX + 1, tileZ + 1);

  return {
    heights: [
      isWater || c00Water ? seaY : h00Raw,
      isWater || c10Water ? seaY : h10Raw,
      isWater || c01Water ? seaY : h01Raw,
      isWater || c11Water ? seaY : h11Raw
    ] as const,
    isWater,
    touchesWater: c00Water || c10Water || c01Water || c11Water
  };
};

const ensureHighlightPoolMesh = (
  pool: LineSegments[],
  root: Group,
  clipPlanes: Plane[],
  index: number,
  color: number
) => {
  while (pool.length <= index) {
    const mesh = buildTileHighlight(clipPlanes, color);
    pool.push(mesh);
    root.add(mesh);
  }

  return pool[index]!;
};

const setHighlightTileGeometry = (
  mesh: LineSegments,
  heights: readonly [number, number, number, number] | null,
  runtime: ZarchRuntimeState,
  tileX: number,
  tileZ: number,
  yOffset: number
) => {
  if (!heights) {
    mesh.visible = false;
    return false;
  }

  const [h00, h10, h01, h11] = heights;
  const worldX = tileX * TILE - runtime.camera.x;
  const worldZ = tileZ * TILE - runtime.camera.z;
  const positions = mesh.geometry.attributes.position as BufferAttribute;
  positions.setXYZ(0, worldX, h00 + yOffset, worldZ);
  positions.setXYZ(1, worldX + TILE, h10 + yOffset, worldZ);
  positions.setXYZ(2, worldX, h01 + yOffset, worldZ + TILE);
  positions.setXYZ(3, worldX + TILE, h11 + yOffset, worldZ + TILE);
  positions.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
  mesh.visible = true;
  return true;
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

const buildBulletMesh = (clipPlanes: Plane[]) => {
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    clippingPlanes: clipPlanes,
    color: 0xff_f1_8b,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    transparent: true
  });

  const mesh = new InstancedMesh(geometry, material, ZARCH_BULLET_CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.renderOrder = 12;
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
  const bulletMesh = buildBulletMesh(clipPlanes);
  const haloHighlightPool: LineSegments[] = [];
  const particleMesh = buildParticleMesh(clipPlanes);
  const particleShadowMesh = buildParticleShadowMesh(clipPlanes);
  const selectionHighlightPool: LineSegments[] = [];
  const tileHighlight = buildTileHighlight(clipPlanes);
  const tilePool: TileMesh[] = [];
  const treePool: TreeMeshEntry[] = [];

  root.add(bulletMesh);
  root.add(particleShadowMesh);
  root.add(particleMesh);
  root.add(tileHighlight);

  return {
    bulletMesh,
    haloHighlightPool,
    particleMesh,
    particleShadowMesh,
    root,
    selectionHighlightPool,
    tileHighlight,
    tilePool,
    treePool
  };
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

const ensureTilePoolMesh = (
  pools: ScenePools,
  clipPlanes: Plane[],
  index: number
) => {
  while (pools.tilePool.length <= index) {
    const mesh = buildTileMesh(clipPlanes);
    pools.root.add(mesh);
    pools.tilePool.push(mesh);
  }

  return pools.tilePool[index]!;
};

const ensureTreePoolEntry = (
  pools: ScenePools,
  clipPlanes: Plane[],
  index: number
) => {
  while (pools.treePool.length <= index) {
    const pine = buildPineTree(clipPlanes);
    const round = buildRoundTree(clipPlanes);

    pine.visible = false;
    round.visible = false;
    pools.root.add(pine);
    pools.root.add(round);
    pools.treePool.push({ pine, round });
  }

  return pools.treePool[index]!;
};

const setObjectClippingPlanes = (
  object: Object3D,
  clippingPlanes: Plane[] | null,
  clipShadows: boolean
) => {
  object.traverse(child => {
    if (!(child instanceof Mesh)) {
      return;
    }

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    materials.forEach(material => {
      const target = material as Material & {
        clipShadows?: boolean;
        clippingPlanes?: Plane[] | null;
      };

      target.clippingPlanes = clippingPlanes;
      target.clipShadows = clipShadows;
      material.needsUpdate = true;
    });
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
  editEnabled,
  editorMode,
  entityEditState,
  inputRef,
  map,
  onEditTileActivate,
  onEditTileHover,
  onEditTileSelectionStart,
  onEditTileSelectionUpdate,
  onEntityHover,
  onEntityPlace,
  onEntitySelect,
  previewHaloTiles,
  runtimeRef,
  selectedHeightPlane,
  selectedHeightTiles,
  terrain
}: ZarchSceneProps) => {
  const staticEntitiesHandleRef = useRef<ZarchStaticEntitiesHandle | null>(null);
  const entityPlacementPreviewRef = useRef<{
    worldX: number;
    worldZ: number;
    valid: boolean;
  } | null>(null);
  const configRef = useSceneConfigRef();
  const ambientIntensity = useSceneConfigValue('ambientIntensity');
  const ambientRef = useRef<AmbientLight>(null);
  const backgroundColor = useSceneConfigValue('backgroundColor');
  const cameraRef = useRef<PerspectiveCamera>(null);
  const cameraFov = useSceneConfigValue('cameraFov');
  const clipPlanesRef = useRef<Plane[] | null>(null);
  const directionalIntensity = useSceneConfigValue('directionalIntensity');
  const landscapeClipScale = useSceneConfigValue('landscapeClipScale');
  const directionalPosition = useSceneConfigValue('directionalPosition');
  const directionalRef = useRef<DirectionalLight>(null);
  const shadowBias = useSceneConfigValue('shadowBias');
  const shadowMapSize = useSceneConfigValue('shadowMapSize');
  const viewRadiusBase = useSceneConfigValue('viewRadiusBase');
  const forwardRef = useRef(new Vector3());
  const intersectionsRef = useRef<Intersection[]>([]);
  const bulletDummyRef = useRef(new Object3D());
  const particleDummyRef = useRef(new Object3D());
  const particleShadowDummyRef = useRef(new Object3D());
  const particleNdcRef = useRef(new Vector2());
  const particleRaycasterRef = useRef(new Raycaster());
  const particleSystemRef = useRef(createParticleSystemState());
  const respawnCameraBlendSecondsRef = useRef(0);
  const poolsRef = useRef<ScenePools | null>(null);
  const rightRef = useRef(new Vector3());
  const shipGroupRef = useRef<Group>(null);
  const worldRef = useRef<Group>(null);
  const shipRuntimeEntityQuery = useQuery({
    queryFn: () =>
      client.maps.getZarchRuntimeEntity({
        id: 'zarch-player-ship'
      }),
    queryKey: ['zarch-runtime-entity', 'zarch-player-ship'],
    staleTime: 60_000
  });
  const shipModelQuery = useQuery({
    enabled: Boolean(shipRuntimeEntityQuery.data),
    queryFn: () => loadZarchRuntimeEntityModel(shipRuntimeEntityQuery.data!),
    queryKey: [
      'zarch-runtime-entity-model',
      shipRuntimeEntityQuery.data?.id,
      shipRuntimeEntityQuery.data?.assetVersionId
    ],
    staleTime: 60_000
  });
  const shipModelScale = useMemo(() => {
    const runtimeEntity = shipRuntimeEntityQuery.data;
    const loadedModel = shipModelQuery.data;

    if (!runtimeEntity || !loadedModel) {
      return 1;
    }

    return (
      runtimeEntity.renderDimensions.lengthMeters /
      Math.max(loadedModel.size.x, 0.001)
    );
  }, [shipModelQuery.data, shipRuntimeEntityQuery.data]);
  const selectedTileKeys = useMemo(
    () => new Set(selectedHeightTiles.map(tile => `${tile.tileX}:${tile.tileZ}`)),
    [selectedHeightTiles]
  );
  const particleSurface = useMemo(
    () => ({
      getHeightAt: (x: number, z: number) => {
        if (!terrain.isWorldPointLoaded(x, z)) {
          return null;
        }

        if (terrain.isWaterAtWorld(x, z)) {
          return configRef.current.seaY;
        }

        return terrain.sampleHeightAtWorld(x, z);
      },
      isWaterAt: (x: number, z: number) => terrain.isWaterAtWorld(x, z)
    }),
    [configRef, terrain]
  );

  if (shipRuntimeEntityQuery.error) {
    throw shipRuntimeEntityQuery.error;
  }

  if (shipModelQuery.error) {
    throw shipModelQuery.error;
  }

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
    const shipObject = shipGroupRef.current;

    if (!shipObject) {
      return;
    }

    setObjectClippingPlanes(shipObject, null, false);
  }, [shipModelQuery.data]);

  useEffect(() => {
    particleSystemRef.current.count = 0;
    runtimeRef.current.bullets = [];
    runtimeRef.current.shipFireCooldownSeconds = 0;
  }, [runtimeRef, terrain.id]);

  useFrame((state, delta) => {
    const camera = cameraRef.current;
    const config = configRef.current;
    const intersections = intersectionsRef.current;
    const bulletDummy = bulletDummyRef.current;
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

    if (input.keys.q || input.keys.Q) {
      runtime.camera.zoomTarget = clampZoom(
        runtime.camera.zoomTarget - config.keyboardZoomSpeed * dt,
        config.zoomMin,
        config.zoomMax
      );
    }
    if (input.keys.e || input.keys.E) {
      runtime.camera.zoomTarget = clampZoom(
        runtime.camera.zoomTarget + config.keyboardZoomSpeed * dt,
        config.zoomMin,
        config.zoomMax
      );
    }

    runtime.camera.zoom = MathUtils.damp(
      runtime.camera.zoom,
      runtime.camera.zoomTarget,
      config.zoomDamping,
      dt
    );

    if (runtime.mode === 'navigation') {
      forward.set(
        -Math.sin(runtime.navigation.yaw),
        0,
        -Math.cos(runtime.navigation.yaw)
      );
      right.set(
        Math.cos(runtime.navigation.yaw),
        0,
        -Math.sin(runtime.navigation.yaw)
      );

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

      runtime.navigation.velX += ax * 400 * dt;
      runtime.navigation.velZ += az * 400 * dt;
      runtime.navigation.velX -= runtime.navigation.velX * 2.5 * dt;
      runtime.navigation.velZ -= runtime.navigation.velZ * 2.5 * dt;
      runtime.navigation.x += runtime.navigation.velX * dt;
      runtime.navigation.z += runtime.navigation.velZ * dt;

      const focus = clampOrWrapFocus({
        terrain,
        x: runtime.navigation.x,
        z: runtime.navigation.z
      });

      runtime.navigation.x = focus.x;
      runtime.navigation.z = focus.z;
      runtime.camera.x = focus.x;
      runtime.camera.z = focus.z;
      runtime.camera.yaw = runtime.navigation.yaw;
      runtime.score += Math.trunc(
        Math.round(
          Math.abs(runtime.navigation.velX) + Math.abs(runtime.navigation.velZ)
        ) * dt
      );
    } else if (runtime.ship) {
      const previousRespawnDelaySeconds = runtime.ship.respawnDelaySeconds;
      runtime.shipFireCooldownSeconds = Math.max(
        0,
        runtime.shipFireCooldownSeconds - dt
      );

      const thrustActive = isCodePressed(input, 'Space', ' ');
      const shipStep = stepPlayerShip({
        deltaSeconds: dt,
        input: {
          pitchDown: isCodePressed(input, 'KeyW', 'w') || input.keys.W,
          pitchUp: isCodePressed(input, 'KeyS', 's') || input.keys.S,
          thrust: thrustActive,
          yawLeft: isCodePressed(input, 'KeyA', 'a') || input.keys.A,
          yawRight: isCodePressed(input, 'KeyD', 'd') || input.keys.D
        },
        state: runtime.ship,
        surface: {
          getTileTypeIdAtWorld: (worldX, worldZ) =>
            terrain.getTileTypeId(
              Math.floor(worldX / TILE),
              Math.floor(worldZ / TILE)
            ),
          isWaterAtWorld: terrain.isWaterAtWorld,
          isWorldPointLoaded: terrain.isWorldPointLoaded,
          sampleHeightAtWorld: terrain.sampleHeightAtWorld,
          waterHeight: config.seaY
        }
      });

      runtime.ship = shipStep.state;
      if (
        previousRespawnDelaySeconds > 0 &&
        runtime.ship.respawnDelaySeconds === 0
      ) {
        respawnCameraBlendSecondsRef.current = 0.7;
      }

      if (respawnCameraBlendSecondsRef.current > 0) {
        respawnCameraBlendSecondsRef.current = Math.max(
          0,
          respawnCameraBlendSecondsRef.current - dt
        );
        runtime.camera.x = MathUtils.damp(
          runtime.camera.x,
          runtime.ship.x,
          4.5,
          dt
        );
        runtime.camera.z = MathUtils.damp(
          runtime.camera.z,
          runtime.ship.z,
          4.5,
          dt
        );
      } else {
        runtime.camera.x = runtime.ship.x;
        runtime.camera.z = runtime.ship.z;
      }
      runtime.score += Math.trunc(
        Math.round(
          Math.abs(runtime.ship.velX) +
            Math.abs(runtime.ship.velY) +
            Math.abs(runtime.ship.velZ)
        ) * dt
      );

      if (thrustActive) {
        emitShipThrustParticles(
          particleSystem,
          {
            direction: getPlayerShipExhaustDirection(
              runtime.ship.yaw,
              runtime.ship.pitch
            ),
            origin: getPlayerShipExhaustOrigin(runtime.ship),
            surface: particleSurface
          },
          config,
          Math.random,
          dt
        );
      }

      if (
        input.shipFireHeld &&
        !runtime.ship.landed &&
        runtime.ship.respawnDelaySeconds <= 0 &&
        runtime.bullets.length < ZARCH_BULLET_CAPACITY &&
        runtime.shipFireCooldownSeconds <= 0
      ) {
        runtime.bullets.push(
          createShipBullet({
            ship: runtime.ship,
            spec: DEFAULT_ZARCH_BULLET_SPEC
          })
        );
        runtime.shipFireCooldownSeconds =
          DEFAULT_ZARCH_BULLET_SPEC.fireCooldownSeconds;
      }

      if (shipStep.event?.kind === 'crash') {
        emitShipCrashParticles(
          particleSystem,
          {
            origin: {
              x: shipStep.event.x,
              y: shipStep.event.y,
              z: shipStep.event.z
            },
            water: shipStep.event.water
          },
          config
        );
      }
    }

    if (runtime.bullets.length > 0) {
      const nextBullets = [];

      for (const bullet of runtime.bullets) {
        const result = stepZarchBullet({
          adjustWorldPoint: point =>
            clampOrWrapFocus({
              terrain,
              x: point.x,
              z: point.z
            }),
          deltaSeconds: dt,
          spec: DEFAULT_ZARCH_BULLET_SPEC,
          state: bullet,
          surface: {
            isWaterAtWorld: terrain.isWaterAtWorld,
            isWorldPointLoaded: terrain.isWorldPointLoaded,
            sampleHeightAtWorld: terrain.sampleHeightAtWorld,
            waterHeight: config.seaY
          }
        });

        if (result.event?.kind === 'land' || result.event?.kind === 'water') {
          emitBulletImpactParticles(
            particleSystem,
            {
              origin: {
                x: result.event.x,
                y: result.event.y,
                z: result.event.z
              },
              water: result.event.kind === 'water'
            },
            config
          );
        }

        if (result.state) {
          nextBullets.push(result.state);
        }
      }

      runtime.bullets = nextBullets;
    }

    const { cameraClipRadius, clipRadius, viewRadius } =
      getLandscapeViewMetrics({
        landscapeClipScale: config.landscapeClipScale,
        viewRadiusBase: config.viewRadiusBase,
        zoom: runtime.camera.zoom
      });
    const pullBack = cameraClipRadius * config.cameraPullbackMultiplier;
    const cameraHeight = cameraClipRadius * config.cameraHeightMultiplier;
    const focusY = runtime.mode === 'ship' && runtime.ship ? runtime.ship.y : 0;

    camera.position.set(
      -Math.sin(runtime.camera.yaw) * pullBack,
      focusY + cameraHeight,
      -Math.cos(runtime.camera.yaw) * pullBack
    );
    camera.lookAt(0, focusY, 0);

    const camTileX = Math.floor(runtime.camera.x / TILE);
    const camTileZ = Math.floor(runtime.camera.z / TILE);

    terrain.requestVisibleChunks(camTileX, camTileZ, viewRadius);

    if (shipGroupRef.current) {
      if (
        runtime.mode === 'ship' &&
        runtime.ship &&
        runtime.ship.respawnDelaySeconds <= 0
      ) {
        shipGroupRef.current.visible = true;
        shipGroupRef.current.rotation.order = 'YXZ';
        shipGroupRef.current.position.set(
          runtime.ship.x - runtime.camera.x,
          runtime.ship.y,
          runtime.ship.z - runtime.camera.z
        );
        shipGroupRef.current.rotation.set(
          runtime.ship.pitch,
          runtime.ship.yaw,
          0
        );
      } else {
        shipGroupRef.current.visible = false;
      }
    }

    let tileIndex = 0;
    let treeIndex = 0;

    for (let dz = -viewRadius; dz <= viewRadius; dz += 1) {
      for (let dx = -viewRadius; dx <= viewRadius; dx += 1) {
        const gx = camTileX + dx;
        const gz = camTileZ + dz;
        const worldX = gx * TILE - runtime.camera.x;
        const worldZ = gz * TILE - runtime.camera.z;

        if (!terrain.containsTile(gx, gz)) {
          continue;
        }

        const tileMesh = ensureTilePoolMesh(pools, clipPlanes, tileIndex);
        const displayTile = getDisplayTileHeights({
          seaY: config.seaY,
          selectedHeightPlane,
          selectedTileKeys,
          terrain,
          tileX: gx,
          tileZ: gz
        });

        if (!displayTile) {
          continue;
        }

        const {
          heights: [h00, h10, h01, h11],
          isWater,
          touchesWater
        } = displayTile;

        const elevation =
          terrain.getTileAverageHeight(gx, gz) ??
          (h00 + h10 + h01 + h11) * 0.25;
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
          !isWater &&
          !touchesWater &&
          terrain.isTileLoaded(gx, gz) &&
          terrain.shouldHaveTree(gx, gz);

        if (!canPlaceTree) {
          continue;
        }

        const treeEntry = ensureTreePoolEntry(pools, clipPlanes, treeIndex);
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

    for (let index = tileIndex; index < pools.tilePool.length; index += 1) {
      pools.tilePool[index].visible = false;
    }

    for (let index = treeIndex; index < pools.treePool.length; index += 1) {
      pools.treePool[index].pine.visible = false;
      pools.treePool[index].round.visible = false;
    }

    let selectionHighlightIndex = 0;
    for (const tile of selectedHeightTiles) {
      if (!terrain.containsTile(tile.tileX, tile.tileZ) || !terrain.isTileLoaded(tile.tileX, tile.tileZ)) {
        continue;
      }

      const mesh = ensureHighlightPoolMesh(
        pools.selectionHighlightPool,
        pools.root,
        clipPlanes,
        selectionHighlightIndex,
        0x4a_d7_ff
      );

      if (
        setHighlightTileGeometry(
          mesh,
          getDisplayTileHeights({
            seaY: config.seaY,
            selectedHeightPlane,
            selectedTileKeys,
            terrain,
            tileX: tile.tileX,
            tileZ: tile.tileZ
          })?.heights ?? null,
          runtime,
          tile.tileX,
          tile.tileZ,
          0.25
        )
      ) {
        selectionHighlightIndex += 1;
      }
    }

    for (
      let index = selectionHighlightIndex;
      index < pools.selectionHighlightPool.length;
      index += 1
    ) {
      pools.selectionHighlightPool[index]!.visible = false;
    }

    let haloHighlightIndex = 0;
    for (const tile of previewHaloTiles) {
      if (!terrain.containsTile(tile.tileX, tile.tileZ) || !terrain.isTileLoaded(tile.tileX, tile.tileZ)) {
        continue;
      }

      const mesh = ensureHighlightPoolMesh(
        pools.haloHighlightPool,
        pools.root,
        clipPlanes,
        haloHighlightIndex,
        0xff_b347
      );

      if (
        setHighlightTileGeometry(
          mesh,
          getDisplayTileHeights({
            seaY: config.seaY,
            selectedHeightPlane,
            selectedTileKeys,
            terrain,
            tileX: tile.tileX,
            tileZ: tile.tileZ
          })?.heights ?? null,
          runtime,
          tile.tileX,
          tile.tileZ,
          0.2
        )
      ) {
        haloHighlightIndex += 1;
      }
    }

    for (let index = haloHighlightIndex; index < pools.haloHighlightPool.length; index += 1) {
      pools.haloHighlightPool[index]!.visible = false;
    }

    clipPlanes[0].setComponents(1, 0, 0, clipRadius);
    clipPlanes[1].setComponents(-1, 0, 0, clipRadius);
    clipPlanes[2].setComponents(0, 0, 1, clipRadius);
    clipPlanes[3].setComponents(0, 0, -1, clipRadius);

    if (editEnabled && editorMode === 'entities' && input.hoverPointer) {
      // Entity mode hover: raycast entities for hover, terrain for placement preview
      const rect = state.gl.domElement.getBoundingClientRect();
      const handle = staticEntitiesHandleRef.current;

      if (handle && entityEditState?.tool === 'select') {
        const entityHit = handle.raycastToEntity(
          input.hoverPointer,
          rect,
          particleRaycaster,
          particleNdc,
          camera,
          intersections
        );
        onEntityHover(entityHit?.entityId ?? null);
      } else {
        onEntityHover(null);
      }

      // Terrain hit for placement preview
      if (entityEditState?.tool === 'place' && entityEditState.activeArchetypeId) {
        const tile = raycastToTile(input.hoverPointer, rect, particleRaycaster, particleNdc, camera, pools.tilePool, intersections);
        if (tile && terrain.isTileLoaded(tile.gx, tile.gz)) {
          const hit = intersections[0];
          if (hit) {
            const worldScale = TILE / map.resolution.metersPerTile;
            const worldX = (hit.point.x + runtime.camera.x) / worldScale;
            const worldZ = (hit.point.z + runtime.camera.z) / worldScale;
            entityPlacementPreviewRef.current = {
              worldX,
              worldZ,
              valid: true
            };
          } else {
            entityPlacementPreviewRef.current = null;
          }
        } else {
          entityPlacementPreviewRef.current = null;
        }
      } else {
        entityPlacementPreviewRef.current = null;
      }

      pools.tileHighlight.visible = false;
    } else if (editEnabled && editorMode === 'terrain' && input.hoverPointer) {
      const rect = state.gl.domElement.getBoundingClientRect();
      const tile = raycastToTile(input.hoverPointer, rect, particleRaycaster, particleNdc, camera, pools.tilePool, intersections);
      const validTile = tile && terrain.isTileLoaded(tile.gx, tile.gz) ? tile : null;
      onEditTileHover(validTile ? { tileX: validTile.gx, tileZ: validTile.gz } : null);

      if (validTile && input.editBrushActive) {
        if (input.editBrushStarted) {
          onEditTileSelectionUpdate(validTile.gx, validTile.gz);
        } else {
          onEditTileSelectionStart(validTile.gx, validTile.gz);
          input.editBrushStarted = true;
        }
      }

      if (validTile) {
        const { gx, gz } = validTile;
        const highlightHeights = getDisplayTileHeights({
          seaY: config.seaY,
          selectedHeightPlane,
          selectedTileKeys,
          terrain,
          tileX: gx,
          tileZ: gz
        })?.heights ?? null;

        if (highlightHeights) {
          const hlX = gx * TILE - runtime.camera.x;
          const hlZ = gz * TILE - runtime.camera.z;
          const hlPositions = pools.tileHighlight.geometry.attributes.position as BufferAttribute;
          const yOffset = 0.15;
          const [hh00, hh10, hh01, hh11] = highlightHeights;
          hlPositions.setXYZ(0, hlX, hh00 + yOffset, hlZ);
          hlPositions.setXYZ(1, hlX + TILE, hh10 + yOffset, hlZ);
          hlPositions.setXYZ(2, hlX, hh01 + yOffset, hlZ + TILE);
          hlPositions.setXYZ(3, hlX + TILE, hh11 + yOffset, hlZ + TILE);
          hlPositions.needsUpdate = true;
          pools.tileHighlight.geometry.computeBoundingSphere();
          pools.tileHighlight.visible = true;
        } else {
          pools.tileHighlight.visible = false;
        }
      } else {
        pools.tileHighlight.visible = false;
      }
    } else {
      if (editEnabled) {
        onEditTileHover(null);
        if (editorMode === 'entities') {
          onEntityHover(null);
          entityPlacementPreviewRef.current = null;
        }
      }

      pools.tileHighlight.visible = false;
    }

    if (editEnabled && editorMode === 'entities' && input.queuedEditTap) {
      const rect = state.gl.domElement.getBoundingClientRect();
      const tap = input.queuedEditTap;
      input.queuedEditTap = null;
      const handle = staticEntitiesHandleRef.current;

      if (entityEditState?.tool === 'select' && handle) {
        const entityHit = handle.raycastToEntity(
          tap,
          rect,
          particleRaycaster,
          particleNdc,
          camera,
          intersections
        );
        onEntitySelect(entityHit?.entityId ?? null);
      } else if (entityEditState?.tool === 'place' && entityEditState.activeArchetypeId) {
        const tile = raycastToTile(tap, rect, particleRaycaster, particleNdc, camera, pools.tilePool, intersections);
        if (tile && terrain.isTileLoaded(tile.gx, tile.gz)) {
          const hit = intersections[0];
          if (hit) {
            const worldScale = TILE / map.resolution.metersPerTile;
            const worldX = (hit.point.x + runtime.camera.x) / worldScale;
            const worldZ = (hit.point.z + runtime.camera.z) / worldScale;
            onEntityPlace(worldX, worldZ);
          }
        }
      }
    } else if (editEnabled && editorMode === 'terrain' && input.queuedEditTap) {
      const rect = state.gl.domElement.getBoundingClientRect();
      const tap = input.queuedEditTap;
      input.queuedEditTap = null;
      const tile = raycastToTile(tap, rect, particleRaycaster, particleNdc, camera, pools.tilePool, intersections);

      if (tile && terrain.isTileLoaded(tile.gx, tile.gz)) {
        onEditTileActivate(tile.gx, tile.gz, tap.shiftKey);
      }
    } else if (input.queuedTap) {
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
                x: hit.point.x + runtime.camera.x,
                y: isWater ? config.seaY : hit.point.y,
                z: hit.point.z + runtime.camera.z
              },
              config
            );
          }
        }
      }
    }

    simulateParticleSystem(particleSystem, dt, particleSurface, config);

    for (let index = 0; index < runtime.bullets.length; index += 1) {
      const bullet = runtime.bullets[index];

      bulletDummy.position.set(
        bullet.x - runtime.camera.x,
        bullet.y,
        bullet.z - runtime.camera.z
      );
      bulletDummy.quaternion.copy(camera.quaternion);
      bulletDummy.scale.set(4.4, 1.35, 1);
      bulletDummy.updateMatrix();
      pools.bulletMesh.setMatrixAt(index, bulletDummy.matrix);
    }

    pools.bulletMesh.count = runtime.bullets.length;
    pools.bulletMesh.instanceMatrix.needsUpdate = true;

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
        particleSystem.x[index] - runtime.camera.x,
        particleSystem.y[index],
        particleSystem.z[index] - runtime.camera.z
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
        particleSystem.x[index] - runtime.camera.x,
        surfaceHeight + config.particleShadowLift,
        particleSystem.z[index] - runtime.camera.z
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

  const shadowExtent =
    getLandscapeViewMetrics({
      landscapeClipScale,
      viewRadiusBase,
      zoom: 1
    }).clipRadius *
    2.5 *
    1.2;

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
        <group ref={shipGroupRef} visible={false}>
          {shipModelQuery.data ? (
            <primitive
              object={shipModelQuery.data.object}
              scale={shipModelScale}
            />
          ) : null}
        </group>
        <ZarchStaticEntities
          entityEditEnabled={editEnabled && editorMode === 'entities'}
          handleRef={staticEntitiesHandleRef}
          hoveredEntityId={entityEditState?.hoveredEntityId ?? null}
          map={map}
          placementPreview={
            entityEditState?.tool === 'place' &&
            entityEditState.activeArchetypeId &&
            entityEditState.activeAssetVersionId &&
            entityPlacementPreviewRef.current
              ? {
                  archetypeId: entityEditState.activeArchetypeId,
                  assetVersionId: entityEditState.activeAssetVersionId,
                  valid: entityPlacementPreviewRef.current.valid,
                  worldX: entityPlacementPreviewRef.current.worldX,
                  worldZ: entityPlacementPreviewRef.current.worldZ
                }
              : null
          }
          runtimeRef={runtimeRef}
          selectedEntityId={entityEditState?.selectedEntityId ?? null}
        />
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
