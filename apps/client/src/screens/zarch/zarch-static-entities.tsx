import { useEffect, useMemo, useRef, type RefObject } from 'react';

import {
  Box3,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  Vector3,
  type BufferGeometry,
  type Material
} from 'three';
import { useFrame } from '@react-three/fiber';

import type {
  AssetVersion,
  MapMetadata,
  RuntimeMapChunk
} from 'carrier-contracts/types';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { apiUrl, client } from '@/helpers/api-link';
import {
  getMapChunkQueryKey,
  getVisibleChunkWindow
} from '@/helpers/zarch-map-terrain';
import {
  collectChunkStaticEntities,
  getSceneMetersScale,
  getStaticEntityGrounding,
  getTerrainGrids
} from '@/helpers/zarch-static-entities';
import { TILE } from '@/helpers/zarch-terrain';
import { useSceneConfigRef } from '@/hooks/use-scene-controls';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ZarchRuntimeState } from './use-zarch-runtime';
import { wrapWorldCoordinate } from './zarch-minimap';

type InstancedAssetRuntime = {
  geometry: BufferGeometry;
  material: Material;
};

type NormalizedModel = {
  object: Group;
  size: Vector3;
};

type LoadedAssetRuntime = {
  instanced: InstancedAssetRuntime | null;
  normalized: NormalizedModel;
};

type AssetRuntimeCacheEntry = {
  error?: Error;
  promise?: Promise<LoadedAssetRuntime>;
  runtime?: LoadedAssetRuntime;
};

type CloneEntry = {
  assetVersionId: string;
  object: Group;
};

type InstancedEntry = {
  capacity: number;
  mesh: InstancedMesh<BufferGeometry, Material>;
};

type ZarchStaticEntitiesProps = {
  map: MapMetadata;
  runtimeRef: RefObject<ZarchRuntimeState>;
};

const assetRuntimeCache = new Map<string, AssetRuntimeCacheEntry>();
const gltfLoader = new GLTFLoader();

const setModelShadowProps = (object: Object3D) => {
  object.traverse(child => {
    if (!(child instanceof Mesh)) {
      return;
    }

    child.castShadow = true;
    child.frustumCulled = false;
    child.receiveShadow = true;
  });
};

const createNormalizedModel = (source: Object3D): NormalizedModel => {
  const clone = source.clone(true);
  const group = new Group();
  group.add(clone);

  const bounds = new Box3().setFromObject(group);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());

  clone.position.x -= center.x;
  clone.position.z -= center.z;
  clone.position.y -= bounds.min.y;

  return {
    object: group,
    size
  };
};

const getInstancedRuntime = (
  normalized: NormalizedModel
): InstancedAssetRuntime | null => {
  const meshes: Mesh[] = [];

  normalized.object.updateMatrixWorld(true);
  normalized.object.traverse(child => {
    if (!(child instanceof Mesh) || Array.isArray(child.material)) {
      return;
    }

    meshes.push(child);
  });

  if (meshes.length !== 1) {
    return null;
  }

  const mesh = meshes[0];
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);

  return {
    geometry,
    material: mesh.material
  };
};

const getAssetRuntimeUrl = (assetVersionId: string) =>
  `${apiUrl}/maps/assets/${encodeURIComponent(assetVersionId)}/runtime`;

const loadAssetRuntime = async (assetVersionId: string) => {
  const url = getAssetRuntimeUrl(assetVersionId);
  const response = await fetch(url, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`Failed to load runtime asset ${assetVersionId}`);
  }

  const gltf = await gltfLoader.parseAsync(
    await response.arrayBuffer(),
    url
  );
  const normalized = createNormalizedModel(gltf.scene);
  setModelShadowProps(normalized.object);

  return {
    instanced: getInstancedRuntime(normalized),
    normalized
  } satisfies LoadedAssetRuntime;
};

const ensureAssetRuntime = (assetVersionId: string) => {
  const cached = assetRuntimeCache.get(assetVersionId);

  if (cached?.runtime || cached?.promise || cached?.error) {
    return cached;
  }

  const nextEntry: AssetRuntimeCacheEntry = {};
  nextEntry.promise = loadAssetRuntime(assetVersionId)
    .then(runtime => {
      nextEntry.runtime = runtime;
      return runtime;
    })
    .catch(error => {
      nextEntry.error =
        error instanceof Error ? error : new Error(String(error));
      return undefined;
    })
    .finally(() => {
      delete nextEntry.promise;
    });

  assetRuntimeCache.set(assetVersionId, nextEntry);
  return nextEntry;
};

const disposeInstancedEntry = (entry: InstancedEntry) => {
  entry.mesh.removeFromParent();
  entry.mesh.geometry.dispose();
};

export const ZarchStaticEntities = ({
  map,
  runtimeRef
}: ZarchStaticEntitiesProps) => {
  const cloneEntriesRef = useRef(new Map<string, CloneEntry>());
  const instancedEntriesRef = useRef(new Map<string, InstancedEntry>());
  const instanceDummyRef = useRef(new Object3D());
  const rootRef = useRef<Group>(null);
  const queryClient = useQueryClient();
  const configRef = useSceneConfigRef();

  const archetypesQuery = useQuery({
    queryFn: () => client.maps.listReferencedArchetypes({ mapId: map.id }),
    queryKey: ['map-referenced-archetypes', map.id],
    staleTime: 60_000
  });

  const archetypesById = useMemo(
    () =>
      new Map(
        (archetypesQuery.data ?? []).map(archetype => [archetype.id, archetype])
      ),
    [archetypesQuery.data]
  );

  const assetVersionIds = useMemo(
    () =>
      Array.from(
        new Set(
          (archetypesQuery.data ?? []).map(
            archetype => archetype.assetVersionId
          )
        )
      ),
    [archetypesQuery.data]
  );

  const assetVersionQueries = useQueries({
    queries: assetVersionIds.map(assetVersionId => ({
      queryFn: () => client.maps.getAssetVersion({ id: assetVersionId }),
      queryKey: ['asset-version', assetVersionId],
      staleTime: 60_000
    }))
  });

  const assetVersionsById = useMemo(
    () =>
      assetVersionQueries.reduce<Map<string, AssetVersion>>(
        (assetVersions, query) => {
          if (query.data) {
            assetVersions.set(query.data.id, query.data);
          }

          return assetVersions;
        },
        new Map()
      ),
    [assetVersionQueries]
  );

  const cleanupEntries = () => {
    for (const cloneEntry of cloneEntriesRef.current.values()) {
      cloneEntry.object.removeFromParent();
    }

    cloneEntriesRef.current.clear();

    for (const instancedEntry of instancedEntriesRef.current.values()) {
      disposeInstancedEntry(instancedEntry);
    }

    instancedEntriesRef.current.clear();
  };

  useEffect(() => cleanupEntries(), [map.id]);
  useEffect(() => cleanupEntries, []);

  useFrame(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const runtime = runtimeRef.current;
    const config = configRef.current;
    const zoomRadius = config.viewRadiusBase * runtime.camera.zoom;
    const viewRadius = Math.ceil(zoomRadius);
    const camTileX = Math.floor(runtime.camera.x / TILE);
    const camTileZ = Math.floor(runtime.camera.z / TILE);
    const visibleWindow = getVisibleChunkWindow(
      map,
      camTileX,
      camTileZ,
      viewRadius
    );
    const visibleChunks: RuntimeMapChunk[] = [];
    const seenChunkKeys = new Set<string>();
    const worldScale = getSceneMetersScale(map);
    const maxDistance = (viewRadius + 1) * TILE;
    const wrappedChunkCountX =
      map.extent.kind === 'finite' && map.extent.wrapX
        ? Math.max(
            Math.ceil(map.extent.widthTiles / map.resolution.chunkSizeTiles),
            1
          )
        : null;
    const wrappedChunkCountZ =
      map.extent.kind === 'finite' && map.extent.wrapZ
        ? Math.max(
            Math.ceil(map.extent.heightTiles / map.resolution.chunkSizeTiles),
            1
          )
        : null;

    for (
      let chunkZ = visibleWindow.minChunkZ;
      chunkZ <= visibleWindow.maxChunkZ;
      chunkZ += 1
    ) {
      for (
        let chunkX = visibleWindow.minChunkX;
        chunkX <= visibleWindow.maxChunkX;
        chunkX += 1
      ) {
        const requestedChunkX =
          wrappedChunkCountX === null
            ? chunkX
            : wrapWorldCoordinate(chunkX, wrappedChunkCountX);
        const requestedChunkZ =
          wrappedChunkCountZ === null
            ? chunkZ
            : wrapWorldCoordinate(chunkZ, wrappedChunkCountZ);
        const chunk = queryClient.getQueryData<RuntimeMapChunk>(
          getMapChunkQueryKey(map.id, requestedChunkX, requestedChunkZ)
        );

        if (!chunk) {
          continue;
        }

        const key = `${chunk.chunkX}:${chunk.chunkZ}`;
        if (seenChunkKeys.has(key)) {
          continue;
        }

        seenChunkKeys.add(key);
        visibleChunks.push(chunk);
      }
    }

    root.position.set(-runtime.camera.x, 0, -runtime.camera.z);

    const visibleCloneIds = new Set<string>();
    const instanceGroups = new Map<
      string,
      Array<{
        x: number;
        y: number;
        yaw: number;
        z: number;
        scale: number;
      }>
    >();
    const terrains = getTerrainGrids(visibleChunks, map);

    for (const entity of collectChunkStaticEntities(visibleChunks)) {
      const archetype = archetypesById.get(entity.archetypeId);
      if (!archetype) {
        continue;
      }

      const assetVersion = assetVersionsById.get(archetype.assetVersionId);
      if (!assetVersion) {
        continue;
      }

      const sceneX = entity.position.x * worldScale;
      const sceneZ = entity.position.z * worldScale;

      if (
        Math.abs(sceneX - runtime.camera.x) > maxDistance ||
        Math.abs(sceneZ - runtime.camera.z) > maxDistance
      ) {
        continue;
      }

      const grounding = getStaticEntityGrounding({
        assetVersion,
        entity,
        terrains
      });
      if (!grounding) {
        continue;
      }

      const assetRuntime = ensureAssetRuntime(assetVersion.id);
      if (!assetRuntime.runtime) {
        continue;
      }

      const scale = entity.scale * worldScale;

      if (assetVersion.instancingEligible && assetRuntime.runtime.instanced) {
        const batch = instanceGroups.get(assetVersion.id) ?? [];
        batch.push({
          scale,
          x: sceneX,
          y: grounding.effectiveY,
          yaw: (-entity.rotation.yaw * Math.PI) / 180,
          z: sceneZ
        });
        instanceGroups.set(assetVersion.id, batch);
        continue;
      }

      let cloneEntry = cloneEntriesRef.current.get(entity.id);

      if (cloneEntry && cloneEntry.assetVersionId !== assetVersion.id) {
        cloneEntry.object.removeFromParent();
        cloneEntriesRef.current.delete(entity.id);
        cloneEntry = undefined;
      }

      if (!cloneEntry) {
        const object = assetRuntime.runtime.normalized.object.clone(true);
        setModelShadowProps(object);
        root.add(object);
        cloneEntry = {
          assetVersionId: assetVersion.id,
          object
        };
        cloneEntriesRef.current.set(entity.id, cloneEntry);
      }

      cloneEntry.object.position.set(
        sceneX,
        grounding.effectiveY,
        sceneZ
      );
      cloneEntry.object.rotation.set(
        0,
        (-entity.rotation.yaw * Math.PI) / 180,
        0
      );
      cloneEntry.object.scale.set(scale, scale, scale);
      cloneEntry.object.visible = true;
      visibleCloneIds.add(entity.id);
    }

    for (const [entityId, cloneEntry] of cloneEntriesRef.current) {
      if (visibleCloneIds.has(entityId)) {
        continue;
      }

      cloneEntry.object.visible = false;
    }

    for (const [assetVersionId, transforms] of instanceGroups) {
      const assetRuntime = assetRuntimeCache.get(assetVersionId)?.runtime;
      const instancedRuntime = assetRuntime?.instanced;

      if (!instancedRuntime) {
        continue;
      }

      let instancedEntry = instancedEntriesRef.current.get(assetVersionId);

      if (!instancedEntry || transforms.length > instancedEntry.capacity) {
        if (instancedEntry) {
          disposeInstancedEntry(instancedEntry);
        }

        const mesh = new InstancedMesh(
          instancedRuntime.geometry.clone(),
          instancedRuntime.material,
          Math.max(transforms.length, 1)
        );
        mesh.castShadow = true;
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        root.add(mesh);

        instancedEntry = {
          capacity: Math.max(transforms.length, 1),
          mesh
        };
        instancedEntriesRef.current.set(assetVersionId, instancedEntry);
      }

      for (const [index, transform] of transforms.entries()) {
        instanceDummyRef.current.position.set(
          transform.x,
          transform.y,
          transform.z
        );
        instanceDummyRef.current.rotation.set(0, transform.yaw, 0);
        instanceDummyRef.current.scale.set(
          transform.scale,
          transform.scale,
          transform.scale
        );
        instanceDummyRef.current.updateMatrix();
        instancedEntry.mesh.setMatrixAt(index, instanceDummyRef.current.matrix);
      }

      instancedEntry.mesh.count = transforms.length;
      instancedEntry.mesh.instanceMatrix.needsUpdate = true;
      instancedEntry.mesh.visible = transforms.length > 0;
    }

    for (const [
      assetVersionId,
      instancedEntry
    ] of instancedEntriesRef.current) {
      if (instanceGroups.has(assetVersionId)) {
        continue;
      }

      instancedEntry.mesh.count = 0;
      instancedEntry.mesh.visible = false;
    }
  });

  return <group ref={rootRef} />;
};
