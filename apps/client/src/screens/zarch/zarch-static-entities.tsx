import {
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type RefObject
} from 'react';

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  SphereGeometry,
  type Intersection,
  type Material,
  type PerspectiveCamera,
  type Plane,
  type Vector2
} from 'three';
import { useFrame } from '@react-three/fiber';

import type {
  AssetVersion,
  MapMetadata,
  RuntimeMapChunk,
  StaticEntity
} from 'carrier-contracts/types';

import { apiUrl, client } from '@/helpers/api-link';
import {
  createNormalizedModel,
  fetchAndParseGltf,
  isMeshObject,
  setModelShadowProps,
  type NormalizedModel
} from '@/helpers/three-model-utils';
import {
  getMapChunkQueryKey,
  getVisibleChunkWindow
} from '@/helpers/zarch-map-terrain';
import {
  collectChunkStaticEntities,
  getSceneMetersScale,
  getStaticEntityGrounding,
  shouldUseStaticEntityInstancing
} from '@/helpers/zarch-static-entities';
import {
  TILE,
  getLandscapeViewMetrics,
  type ZarchTerrain
} from '@/helpers/zarch-terrain';
import { useSceneConfigRef } from '@/hooks/use-scene-controls';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ZarchRuntimeState } from './use-zarch-runtime';
import { wrapWorldCoordinate } from './zarch-minimap';

type InstancedAssetRuntime = {
  geometry: BufferGeometry;
  material: Material;
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

export type EntityRaycastResult = {
  entity: StaticEntity;
  entityId: string;
  kind: 'entity' | 'rotate-handle';
  sceneY: number;
  worldPoint: {
    x: number;
    z: number;
  };
};

export type ZarchStaticEntitiesHandle = {
  raycastToEntity: (
    pointer: { clientX: number; clientY: number },
    rect: DOMRect,
    raycaster: Raycaster,
    ndc: Vector2,
    camera: PerspectiveCamera,
    intersections: Intersection[]
  ) => EntityRaycastResult | null;
};

type PlacementPreview = {
  archetypeId: string;
  assetVersionId: string;
  valid: boolean;
  worldX: number;
  worldZ: number;
} | null;

export type EntityTransformPreview =
  | {
      entityId: string;
      kind: 'move';
      position: StaticEntity['position'];
    }
  | {
      entityId: string;
      kind: 'rotate';
      scale: number;
      yaw: number;
    };

type PositionCursor = {
  x: number;
  z: number;
} | null;

type ZarchStaticEntitiesProps = {
  clippingPlanes: Plane[];
  entityEditEnabled: boolean;
  handleRef: RefObject<ZarchStaticEntitiesHandle | null>;
  hoveredEntityId: string | null;
  map: MapMetadata;
  placementPreviewRef: RefObject<PlacementPreview>;
  positionCursorRef: RefObject<PositionCursor>;
  runtimeRef: RefObject<ZarchRuntimeState>;
  selectedEntityId: string | null;
  terrain: ZarchTerrain;
  transformPreviewRef: RefObject<EntityTransformPreview | null>;
};

const assetRuntimeCache = new Map<string, AssetRuntimeCacheEntry>();

const isMeshBasicMaterial = (
  material: Material
): material is MeshBasicMaterial => material.type === 'MeshBasicMaterial';

const getInstancedRuntime = (
  normalized: NormalizedModel
): InstancedAssetRuntime | null => {
  const meshes: Mesh[] = [];

  normalized.object.updateMatrixWorld(true);
  normalized.object.traverse(child => {
    if (!isMeshObject(child) || Array.isArray(child.material)) {
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
  const gltf = await fetchAndParseGltf(url, `runtime asset ${assetVersionId}`);
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

const applyMaterialClippingPlanes = (
  material: Material | Material[],
  clippingPlanes: Plane[],
  clipShadows: boolean
) => {
  const materials = Array.isArray(material) ? material : [material];

  for (const targetMaterial of materials) {
    const clippedMaterial = targetMaterial as Material & {
      clippingPlanes?: Plane[] | null;
      clipShadows?: boolean;
    };

    clippedMaterial.clippingPlanes = clippingPlanes;
    clippedMaterial.clipShadows = clipShadows;
    targetMaterial.needsUpdate = true;
  }
};

const applyObjectClippingPlanes = (
  object: Object3D,
  clippingPlanes: Plane[],
  clipShadows: boolean
) => {
  object.traverse(child => {
    const renderable = child as Partial<{
      material: Material | Material[];
    }>;

    if (!renderable.material) {
      return;
    }

    applyMaterialClippingPlanes(
      renderable.material,
      clippingPlanes,
      clipShadows
    );
  });
};

export const ZarchStaticEntities = ({
  clippingPlanes,
  entityEditEnabled,
  handleRef,
  hoveredEntityId,
  map,
  placementPreviewRef,
  positionCursorRef,
  runtimeRef,
  selectedEntityId,
  terrain,
  transformPreviewRef
}: ZarchStaticEntitiesProps) => {
  const cloneEntriesRef = useRef(new Map<string, CloneEntry>());
  const instancedEntriesRef = useRef(new Map<string, InstancedEntry>());
  const instanceDummyRef = useRef(new Object3D());
  const rootRef = useRef<Group>(null);
  const selectionOutlineRef = useRef<LineSegments | null>(null);
  const hoverOutlineRef = useRef<LineSegments | null>(null);
  const rotateHandleRef = useRef<Mesh | null>(null);
  const rotateHandleLineRef = useRef<LineSegments | null>(null);
  const positionCursorLineRef = useRef<LineSegments | null>(null);
  const previewMeshRef = useRef<Group | null>(null);
  const previewAssetVersionIdRef = useRef<string | null>(null);
  const visibleEntitiesRef = useRef(new Map<string, StaticEntity>());
  const queryClient = useQueryClient();
  const configRef = useSceneConfigRef();

  const archetypesQuery = useQuery({
    queryFn: () => client.maps.listReferencedArchetypes({ mapId: map.id }),
    queryKey: ['map-referenced-archetypes', map.id, map.revision],
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

    if (previewMeshRef.current) {
      previewMeshRef.current.removeFromParent();
      previewMeshRef.current = null;
      previewAssetVersionIdRef.current = null;
    }
  };

  useEffect(() => cleanupEntries(), [map.id]);
  useEffect(() => cleanupEntries, []);

  // Set up selection/hover outlines
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const outlineMaterial = new LineBasicMaterial({
      clippingPlanes,
      color: 0xf6_d8_4a,
      depthTest: false
    });
    const hoverMaterial = new LineBasicMaterial({
      clippingPlanes,
      color: 0xd6_bf_68,
      depthTest: false,
      opacity: 0.6,
      transparent: true
    });
    const boxGeo = new EdgesGeometry(new BoxGeometry(1, 1, 1));
    const handleMaterial = new MeshBasicMaterial({
      clippingPlanes,
      color: 0x9e_dc_ff,
      depthTest: false
    });
    const handleLineMaterial = new LineBasicMaterial({
      clippingPlanes,
      color: 0x9e_dc_ff,
      depthTest: false
    });
    const cursorMaterial = new LineBasicMaterial({
      clippingPlanes,
      color: 0xff_e5_8a,
      depthTest: false,
      opacity: 0.85,
      transparent: true
    });
    const handleGeo = new SphereGeometry(2.6, 12, 8);
    const handleLineGeo = new BufferGeometry();
    const cursorGeo = new BufferGeometry();

    handleLineGeo.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(6), 3)
    );

    const selectionOutline = new LineSegments(boxGeo, outlineMaterial);
    selectionOutline.visible = false;
    selectionOutline.renderOrder = 15;
    root.add(selectionOutline);
    selectionOutlineRef.current = selectionOutline;

    const hoverOutline = new LineSegments(boxGeo.clone(), hoverMaterial);
    hoverOutline.visible = false;
    hoverOutline.renderOrder = 14;
    root.add(hoverOutline);
    hoverOutlineRef.current = hoverOutline;

    const rotateHandle = new Mesh(handleGeo, handleMaterial);
    rotateHandle.renderOrder = 16;
    rotateHandle.visible = false;
    root.add(rotateHandle);
    rotateHandleRef.current = rotateHandle;

    const rotateHandleLine = new LineSegments(
      handleLineGeo,
      handleLineMaterial
    );
    rotateHandleLine.renderOrder = 16;
    rotateHandleLine.visible = false;
    root.add(rotateHandleLine);
    rotateHandleLineRef.current = rotateHandleLine;

    const cursorPositions = new Float32Array(12);
    cursorGeo.setAttribute('position', new BufferAttribute(cursorPositions, 3));
    cursorGeo.setIndex([0, 1, 2, 3]);
    const positionCursorLine = new LineSegments(cursorGeo, cursorMaterial);
    positionCursorLine.renderOrder = 16;
    positionCursorLine.visible = false;
    root.add(positionCursorLine);
    positionCursorLineRef.current = positionCursorLine;

    return () => {
      selectionOutline.removeFromParent();
      hoverOutline.removeFromParent();
      rotateHandle.removeFromParent();
      rotateHandleLine.removeFromParent();
      positionCursorLine.removeFromParent();
      outlineMaterial.dispose();
      hoverMaterial.dispose();
      handleMaterial.dispose();
      handleLineMaterial.dispose();
      cursorMaterial.dispose();
      boxGeo.dispose();
      handleGeo.dispose();
      handleLineGeo.dispose();
      cursorGeo.dispose();
    };
  }, [clippingPlanes]);

  // Expose raycast handle
  useImperativeHandle(
    handleRef,
    () => ({
      raycastToEntity: (
        pointer,
        rect,
        raycaster,
        ndc,
        camera,
        intersections
      ) => {
        if (rect.width === 0 || rect.height === 0) {
          return null;
        }

        ndc.set(
          ((pointer.clientX - rect.left) / rect.width) * 2 - 1,
          -(((pointer.clientY - rect.top) / rect.height) * 2 - 1)
        );
        raycaster.setFromCamera(ndc, camera);

        const targets: Object3D[] = [];
        const rotateHandle = rotateHandleRef.current;

        if (rotateHandle?.visible) {
          targets.push(rotateHandle);
        }

        for (const entry of cloneEntriesRef.current.values()) {
          if (entry.object.visible) {
            targets.push(entry.object);
          }
        }

        if (targets.length === 0) {
          return null;
        }

        intersections.length = 0;
        raycaster.intersectObjects(targets, true, intersections);

        const hit = intersections[0];
        if (!hit) {
          return null;
        }

        const runtime = runtimeRef.current;
        const worldScale = getSceneMetersScale(map);
        const hitWorldPoint = {
          x: (hit.point.x + runtime.camera.x) / worldScale,
          z: (hit.point.z + runtime.camera.z) / worldScale
        };
        let current: Object3D | null = hit.object;
        while (current) {
          const rotateHandleEntityId = current.userData.entityRotateHandleId as
            | string
            | undefined;
          if (rotateHandleEntityId) {
            const entity = visibleEntitiesRef.current.get(rotateHandleEntityId);

            return entity
              ? {
                  entity,
                  entityId: rotateHandleEntityId,
                  kind: 'rotate-handle',
                  sceneY: hit.point.y,
                  worldPoint: hitWorldPoint
                }
              : null;
          }

          const entityId = current.userData.entityId as string | undefined;
          if (entityId) {
            const entity = visibleEntitiesRef.current.get(entityId);

            return entity
              ? {
                  entity,
                  entityId,
                  kind: 'entity',
                  sceneY: hit.point.y,
                  worldPoint: hitWorldPoint
                }
              : null;
          }
          current = current.parent;
        }

        return null;
      }
    }),
    [map, runtimeRef]
  );

  useFrame(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const transformPreview = transformPreviewRef.current;
    const runtime = runtimeRef.current;
    const config = configRef.current;
    const { viewRadius } = getLandscapeViewMetrics({
      landscapeClipScale: config.landscapeClipScale,
      viewRadiusBase: config.viewRadiusBase,
      zoom: runtime.camera.zoom
    });
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
          getMapChunkQueryKey(
            map.id,
            requestedChunkX,
            requestedChunkZ,
            map.revision
          )
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
        scale: number;
        x: number;
        y: number;
        yaw: number;
        z: number;
      }>
    >();
    visibleEntitiesRef.current.clear();

    for (const entity of collectChunkStaticEntities(visibleChunks)) {
      const renderEntity: StaticEntity =
        transformPreview?.entityId === entity.id
          ? transformPreview.kind === 'move'
            ? {
                ...entity,
                position: transformPreview.position
              }
            : {
                ...entity,
                rotation: { yaw: transformPreview.yaw },
                scale: transformPreview.scale
              }
          : entity;
      const archetype = archetypesById.get(entity.archetypeId);
      if (!archetype) {
        continue;
      }

      const assetVersion = assetVersionsById.get(archetype.assetVersionId);
      if (!assetVersion) {
        continue;
      }

      const sceneX = renderEntity.position.x * worldScale;
      const sceneZ = renderEntity.position.z * worldScale;

      if (
        Math.abs(sceneX - runtime.camera.x) > maxDistance ||
        Math.abs(sceneZ - runtime.camera.z) > maxDistance
      ) {
        continue;
      }

      const grounding = getStaticEntityGrounding({
        assetVersion,
        entity: renderEntity,
        map,
        terrain
      });
      if (!grounding) {
        continue;
      }

      const assetRuntime = ensureAssetRuntime(assetVersion.id);
      if (!assetRuntime.runtime) {
        continue;
      }

      const scale = renderEntity.scale * worldScale;

      if (
        shouldUseStaticEntityInstancing({
          entityEditEnabled,
          instancedRuntimeAvailable: Boolean(assetRuntime.runtime.instanced),
          instancingEligible: assetVersion.instancingEligible
        })
      ) {
        const batch = instanceGroups.get(assetVersion.id) ?? [];
        batch.push({
          scale,
          x: sceneX,
          y: grounding.effectiveY,
          yaw: (-renderEntity.rotation.yaw * Math.PI) / 180,
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
        applyObjectClippingPlanes(object, clippingPlanes, true);
        object.userData.entityId = entity.id;
        root.add(object);
        cloneEntry = {
          assetVersionId: assetVersion.id,
          object
        };
        cloneEntriesRef.current.set(entity.id, cloneEntry);
      }

      cloneEntry.object.position.set(sceneX, grounding.effectiveY, sceneZ);
      cloneEntry.object.rotation.set(
        0,
        (-renderEntity.rotation.yaw * Math.PI) / 180,
        0
      );
      cloneEntry.object.scale.set(scale, scale, scale);
      cloneEntry.object.visible = true;
      visibleCloneIds.add(entity.id);
      visibleEntitiesRef.current.set(entity.id, renderEntity);
    }

    for (const [entityId, cloneEntry] of cloneEntriesRef.current) {
      if (visibleCloneIds.has(entityId)) {
        continue;
      }

      // Three scene objects are mutable render resources owned by this ref.
      // eslint-disable-next-line react-hooks/immutability
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
        applyMaterialClippingPlanes(mesh.material, clippingPlanes, true);
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

      // Three scene objects are mutable render resources owned by this ref.
      // eslint-disable-next-line react-hooks/immutability
      instancedEntry.mesh.count = 0;
      instancedEntry.mesh.visible = false;
    }

    // Selection/hover outlines
    const selectionOutline = selectionOutlineRef.current;
    const hoverOutline = hoverOutlineRef.current;
    const rotateHandle = rotateHandleRef.current;
    const rotateHandleLine = rotateHandleLineRef.current;
    const positionCursorLine = positionCursorLineRef.current;
    const selectedEntry = selectedEntityId
      ? cloneEntriesRef.current.get(selectedEntityId)
      : null;

    if (selectionOutline) {
      if (selectedEntry?.object.visible) {
        const pos = selectedEntry.object.position;
        const scl = selectedEntry.object.scale;
        selectionOutline.position.copy(pos);
        selectionOutline.position.y += scl.y * 0.5;
        selectionOutline.scale.set(scl.x * 1.1, scl.y * 1.1, scl.z * 1.1);
        selectionOutline.rotation.copy(selectedEntry.object.rotation);
        selectionOutline.visible = true;
      } else {
        selectionOutline.visible = false;
      }
    }

    if (hoverOutline) {
      const hovEntry =
        hoveredEntityId && hoveredEntityId !== selectedEntityId
          ? cloneEntriesRef.current.get(hoveredEntityId)
          : null;

      if (hovEntry?.object.visible) {
        const pos = hovEntry.object.position;
        const scl = hovEntry.object.scale;
        hoverOutline.position.copy(pos);
        hoverOutline.position.y += scl.y * 0.5;
        hoverOutline.scale.set(scl.x * 1.05, scl.y * 1.05, scl.z * 1.05);
        hoverOutline.rotation.copy(hovEntry.object.rotation);
        hoverOutline.visible = true;
      } else {
        hoverOutline.visible = false;
      }
    }

    if (rotateHandle && rotateHandleLine) {
      if (selectedEntry?.object.visible && selectedEntityId) {
        const pos = selectedEntry.object.position;
        const scl = selectedEntry.object.scale;
        const yaw = selectedEntry.object.rotation.y;
        const handleDistance = Math.max(scl.x, scl.z) * 3 + 5;
        const handleY = pos.y + Math.max(scl.y * 0.75, 3);
        const handleX = pos.x + Math.sin(yaw) * handleDistance;
        const handleZ = pos.z + Math.cos(yaw) * handleDistance;
        const linePositions = rotateHandleLine.geometry.attributes
          .position as BufferAttribute;

        rotateHandle.position.set(handleX, handleY, handleZ);
        rotateHandle.userData.entityRotateHandleId = selectedEntityId;
        rotateHandle.visible = true;
        linePositions.setXYZ(0, pos.x, handleY, pos.z);
        linePositions.setXYZ(1, handleX, handleY, handleZ);
        linePositions.needsUpdate = true;
        rotateHandleLine.geometry.computeBoundingSphere();
        rotateHandleLine.visible = true;
      } else {
        rotateHandle.visible = false;
        delete rotateHandle.userData.entityRotateHandleId;
        rotateHandleLine.visible = false;
      }
    }

    if (positionCursorLine) {
      const positionCursor = positionCursorRef.current;

      if (positionCursor) {
        const cursorSceneX = positionCursor.x * worldScale;
        const cursorSceneZ = positionCursor.z * worldScale;
        const cursorY =
          (terrain.sampleHeightAtWorld(cursorSceneX, cursorSceneZ) ?? 0) + 0.5;
        const cursorSize = 3.6;
        const positions = positionCursorLine.geometry.attributes
          .position as BufferAttribute;

        positions.setXYZ(0, cursorSceneX - cursorSize, cursorY, cursorSceneZ);
        positions.setXYZ(1, cursorSceneX + cursorSize, cursorY, cursorSceneZ);
        positions.setXYZ(2, cursorSceneX, cursorY, cursorSceneZ - cursorSize);
        positions.setXYZ(3, cursorSceneX, cursorY, cursorSceneZ + cursorSize);
        positions.needsUpdate = true;
        positionCursorLine.geometry.computeBoundingSphere();
        positionCursorLine.visible = true;
      } else {
        positionCursorLine.visible = false;
      }
    }

    // Placement preview ghost
    const preview = placementPreviewRef.current;
    const previewGroup = previewMeshRef.current;

    if (preview && root) {
      const assetRuntime = ensureAssetRuntime(preview.assetVersionId);

      if (assetRuntime.runtime) {
        if (
          previewAssetVersionIdRef.current !== preview.assetVersionId ||
          !previewGroup
        ) {
          // Remove old preview
          if (previewGroup) {
            previewGroup.removeFromParent();
          }

          const ghost = assetRuntime.runtime.normalized.object.clone(true);
          ghost.traverse((child: Object3D) => {
            if (isMeshObject(child)) {
              child.material = new MeshBasicMaterial({
                clippingPlanes,
                color: preview.valid ? 0x66_ff_66 : 0xff_66_66,
                depthWrite: false,
                opacity: 0.4,
                transparent: true
              });
            }
          });
          ghost.renderOrder = 13;
          root.add(ghost);
          previewMeshRef.current = ghost;
          previewAssetVersionIdRef.current = preview.assetVersionId;
        }

        const ghost = previewMeshRef.current;
        if (ghost) {
          const sceneX = preview.worldX * worldScale;
          const sceneZ = preview.worldZ * worldScale;

          // Compute grounding for preview
          const grounding = getStaticEntityGrounding({
            assetVersion: (() => {
              const archetype = archetypesById.get(preview.archetypeId);
              const av = archetype
                ? assetVersionsById.get(archetype.assetVersionId)
                : null;
              return (
                av ?? {
                  footprint: { depthMeters: 1, widthMeters: 1 },
                  maxHeightDeltaMeters: 100
                }
              );
            })(),
            entity: {
              position: { x: preview.worldX, z: preview.worldZ },
              rotation: { yaw: 0 },
              scale: 1,
              yOffset: 0
            },
            map,
            terrain
          });

          ghost.position.set(
            sceneX,
            grounding ? grounding.effectiveY : 0,
            sceneZ
          );
          ghost.scale.set(worldScale, worldScale, worldScale);

          // Update material color based on validity
          const isValid = grounding ? grounding.valid : false;
          ghost.traverse((child: Object3D) => {
            if (
              isMeshObject(child) &&
              isMeshBasicMaterial(child.material as Material)
            ) {
              child.material.color.set(isValid ? 0x66_ff_66 : 0xff_66_66);
            }
          });

          ghost.visible = true;
        }
      }
    } else if (previewGroup) {
      previewGroup.visible = false;
    }
  });

  return <group ref={rootRef} />;
};
