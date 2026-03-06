import { type RefObject, useEffect, useRef } from 'react';

import { PerspectiveCamera as PerspectiveCameraImpl } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  FrontSide,
  Group,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  Plane,
  Vector3
} from 'three';
import type { PerspectiveCamera } from 'three';

import {
  SEA_Y,
  TILE,
  TILE_POOL_SIZE,
  TREE_POOL_SIZE,
  VIEW_R_BASE,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';

import type {
  ZarchInputState,
  ZarchRuntimeState
} from './use-zarch-runtime';

type TileMesh = Mesh<BufferGeometry, MeshLambertMaterial>;

type TreeMeshEntry = {
  pine: Group;
  round: Group;
};

type ScenePools = {
  root: Group;
  tilePool: TileMesh[];
  treePool: TreeMeshEntry[];
};

type ZarchSceneProps = {
  inputRef: RefObject<ZarchInputState>;
  runtimeRef: RefObject<ZarchRuntimeState>;
  terrain: ZarchTerrain;
};

const TILE_BASE_COLOR = new Color();
const TREE_BASE_COLOR = new Color();

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
  const tilePool: TileMesh[] = [];
  const treePool: TreeMeshEntry[] = [];

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

  return { root, tilePool, treePool };
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
    TREE_BASE_COLOR
      .setHex(mesh.userData.baseColor as number)
      .multiplyScalar(brightness);
    material.color.copy(TREE_BASE_COLOR);
  });
};

export const ZarchScene = ({
  inputRef,
  runtimeRef,
  terrain
}: ZarchSceneProps) => {
  const cameraRef = useRef<PerspectiveCamera>(null);
  const clipPlanesRef = useRef<Plane[] | null>(null);
  const forwardRef = useRef(new Vector3());
  const poolsRef = useRef<ScenePools | null>(null);
  const rightRef = useRef(new Vector3());
  const worldRef = useRef<Group>(null);

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

  useFrame((_, delta) => {
    const camera = cameraRef.current;
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

    runtime.velX += ax * 400 * dt;
    runtime.velZ += az * 400 * dt;
    runtime.velX -= runtime.velX * 2.5 * dt;
    runtime.velZ -= runtime.velZ * 2.5 * dt;
    runtime.camX += runtime.velX * dt;
    runtime.camZ += runtime.velZ * dt;
    runtime.score += Math.trunc(
      Math.round(Math.abs(runtime.velX) + Math.abs(runtime.velZ)) * dt
    );

    const viewRadius = Math.round(VIEW_R_BASE * runtime.camZoom);
    const clipRadius = (viewRadius - 0.6) * TILE;
    const pullBack = clipRadius * 1.8;
    const cameraHeight = clipRadius * 1.35;

    camera.position.set(
      -Math.sin(runtime.camYaw) * pullBack,
      cameraHeight,
      -Math.cos(runtime.camYaw) * pullBack
    );
    camera.lookAt(0, 0, 0);

    const camTileX = Math.floor(runtime.camX / TILE);
    const camTileZ = Math.floor(runtime.camZ / TILE);

    let tileIndex = 0;
    let treeIndex = 0;

    for (let dz = -viewRadius; dz <= viewRadius; dz += 1) {
      for (let dx = -viewRadius; dx <= viewRadius; dx += 1) {
        const gx = camTileX + dx;
        const gz = camTileZ + dz;
        const worldX = gx * TILE - runtime.camX;
        const worldZ = gz * TILE - runtime.camZ;
        const tileMesh = pools.tilePool[tileIndex];
        const h00Raw = terrain.sampleHeight(gx, gz);
        const h10Raw = terrain.sampleHeight(gx + 1, gz);
        const h01Raw = terrain.sampleHeight(gx, gz + 1);
        const h11Raw = terrain.sampleHeight(gx + 1, gz + 1);
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
        const h00 = isWater || c00Water ? SEA_Y : h00Raw;
        const h10 = isWater || c10Water ? SEA_Y : h10Raw;
        const h01 = isWater || c01Water ? SEA_Y : h01Raw;
        const h11 = isWater || c11Water ? SEA_Y : h11Raw;
        const tileCenterX = worldX + TILE * 0.5;
        const tileCenterZ = worldZ + TILE * 0.5;
        const distance = Math.sqrt(
          (tileCenterX - camera.position.x) ** 2 +
            (elevation - camera.position.y) ** 2 +
            (tileCenterZ - camera.position.z) ** 2
        );
        const brightness = Math.max(
          0.12,
          1 - MathUtils.clamp(distance / (viewRadius * TILE * 2.8), 0, 1) ** 2 * 0.88
        );
        const positions = tileMesh.geometry.attributes.position as BufferAttribute;

        terrain.tileColor(gx, gz, elevation, TILE_BASE_COLOR);
        tileMesh.material.color.copy(TILE_BASE_COLOR).multiplyScalar(brightness);
        tileMesh.visible = true;
        positions.setXYZ(0, worldX, h00, worldZ);
        positions.setXYZ(1, worldX + TILE, h10, worldZ);
        positions.setXYZ(2, worldX, h01, worldZ + TILE);
        positions.setXYZ(3, worldX + TILE, h11, worldZ + TILE);
        positions.needsUpdate = true;
        tileMesh.geometry.computeVertexNormals();

        tileIndex += 1;

        const canPlaceTree =
          treeIndex < TREE_POOL_SIZE &&
          !isWater &&
          !(c00Water || c10Water || c01Water || c11Water) &&
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
  });

  const shadowExtent = VIEW_R_BASE * 2.5 * TILE * 1.2;

  return (
    <>
      <color args={['#000000']} attach="background" />
      <PerspectiveCameraImpl
        far={5000}
        fov={70}
        makeDefault
        near={1}
        position={[0, 0, 0]}
        ref={cameraRef}
      />
      <group ref={worldRef} />
      <ambientLight intensity={0.6} />
      <directionalLight
        castShadow
        intensity={0.8}
        position={[200, 400, 100]}
        shadow-bias={-0.001}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-far={2000}
        shadow-camera-left={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
      />
    </>
  );
};
