import type { MapMetadata, RuntimeMapChunk } from 'carrier-contracts/types';

import type { StaticEntityObstacleCollider } from '@/helpers/zarch-static-entities';
import type { ZarchTerrain } from '@/helpers/zarch-terrain';

import type { ZarchStaticCollider } from './zarch-physics-world';

type TriangleGeometry = {
  indices: number[];
  positions: number[];
};

type ZarchStaticColliderPatchTerrain = Pick<
  ZarchTerrain,
  | 'isTileLoaded'
  | 'isWaterTile'
  | 'sampleHeight'
  | 'shouldHaveTree'
  | 'treeType'
>;

export type ZarchStaticColliderPatchInput<
  Terrain extends ZarchStaticColliderPatchTerrain =
    ZarchStaticColliderPatchTerrain
> = {
  centerTileX: number;
  centerTileZ: number;
  obstacleColliders: StaticEntityObstacleCollider[];
  radiusTiles: number;
  seaY: number;
  terrain: Terrain;
  tileMeters: number;
  wrapOffsets: Array<{ x: number; z: number }>;
};

export const getTerrainPatchContentSignature = ({
  centerTileX,
  centerTileZ,
  obstacleColliders,
  radiusTiles,
  seaY,
  terrain,
  tileMeters,
  wrapOffsets
}: ZarchStaticColliderPatchInput) => {
  const terrainState = [];
  for (
    let z = centerTileZ - radiusTiles - 1;
    z <= centerTileZ + radiusTiles + 1;
    z += 1
  ) {
    for (
      let x = centerTileX - radiusTiles - 1;
      x <= centerTileX + radiusTiles + 1;
      x += 1
    ) {
      terrainState.push([
        x,
        z,
        terrain.sampleHeight(x, z),
        terrain.isTileLoaded(x, z),
        terrain.isWaterTile(x, z),
        terrain.shouldHaveTree(x, z),
        terrain.treeType(x, z)
      ]);
    }
  }

  return JSON.stringify({
    centerTileX,
    centerTileZ,
    obstacleColliders: [...obstacleColliders].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    radiusTiles,
    seaY,
    terrainState,
    tileMeters,
    wrapOffsets
  });
};

export type ChunkPhysicsGeometry = {
  shoreline: TriangleGeometry | null;
  terrain: TriangleGeometry;
  waterSurface: TriangleGeometry | null;
};

export const buildTerrainPatchGeometry = ({
  centerTileX,
  centerTileZ,
  radiusTiles,
  terrain,
  tileMeters
}: {
  centerTileX: number;
  centerTileZ: number;
  radiusTiles: number;
  terrain: {
    sampleHeight: (x: number, z: number) => number | null;
  };
  tileMeters: number;
}): TriangleGeometry => {
  const result: TriangleGeometry = { indices: [], positions: [] };
  for (
    let z = centerTileZ - radiusTiles;
    z <= centerTileZ + radiusTiles;
    z += 1
  ) {
    for (
      let x = centerTileX - radiusTiles;
      x <= centerTileX + radiusTiles;
      x += 1
    ) {
      const heights = [
        terrain.sampleHeight(x, z),
        terrain.sampleHeight(x + 1, z),
        terrain.sampleHeight(x, z + 1),
        terrain.sampleHeight(x + 1, z + 1)
      ];
      if (heights.some(height => height === null)) {
        continue;
      }
      pushQuad(result, [
        [x * tileMeters, heights[0]!, z * tileMeters],
        [(x + 1) * tileMeters, heights[1]!, z * tileMeters],
        [x * tileMeters, heights[2]!, (z + 1) * tileMeters],
        [(x + 1) * tileMeters, heights[3]!, (z + 1) * tileMeters]
      ]);
    }
  }
  return result;
};

export const buildWaterBoundaryPatchGeometry = ({
  centerTileX,
  centerTileZ,
  radiusTiles,
  seaY,
  terrain,
  tileMeters
}: {
  centerTileX: number;
  centerTileZ: number;
  radiusTiles: number;
  seaY: number;
  terrain: {
    isTileLoaded: (x: number, z: number) => boolean;
    isWaterTile: (x: number, z: number) => boolean;
  };
  tileMeters: number;
}): TriangleGeometry => {
  const result: TriangleGeometry = { indices: [], positions: [] };
  const bottom = seaY - 20;
  const top = seaY + 20;
  for (
    let z = centerTileZ - radiusTiles;
    z <= centerTileZ + radiusTiles;
    z += 1
  ) {
    for (
      let x = centerTileX - radiusTiles;
      x <= centerTileX + radiusTiles;
      x += 1
    ) {
      if (!terrain.isTileLoaded(x, z) || !terrain.isWaterTile(x, z)) {
        continue;
      }
      const minX = x * tileMeters;
      const maxX = minX + tileMeters;
      const minZ = z * tileMeters;
      const maxZ = minZ + tileMeters;
      const edges = [
        {
          neighbor: [x - 1, z],
          vertices: [
            [minX, bottom, minZ],
            [minX, top, minZ],
            [minX, bottom, maxZ],
            [minX, top, maxZ]
          ]
        },
        {
          neighbor: [x + 1, z],
          vertices: [
            [maxX, bottom, maxZ],
            [maxX, top, maxZ],
            [maxX, bottom, minZ],
            [maxX, top, minZ]
          ]
        },
        {
          neighbor: [x, z - 1],
          vertices: [
            [maxX, bottom, minZ],
            [maxX, top, minZ],
            [minX, bottom, minZ],
            [minX, top, minZ]
          ]
        },
        {
          neighbor: [x, z + 1],
          vertices: [
            [minX, bottom, maxZ],
            [minX, top, maxZ],
            [maxX, bottom, maxZ],
            [maxX, top, maxZ]
          ]
        }
      ] as const;
      for (const edge of edges) {
        if (
          !terrain.isTileLoaded(edge.neighbor[0], edge.neighbor[1]) ||
          !terrain.isWaterTile(edge.neighbor[0], edge.neighbor[1])
        ) {
          pushQuad(result, edge.vertices);
        }
      }
    }
  }
  return result;
};

export const buildWaterSurfacePatchGeometry = ({
  centerTileX,
  centerTileZ,
  radiusTiles,
  seaY,
  terrain,
  tileMeters
}: {
  centerTileX: number;
  centerTileZ: number;
  radiusTiles: number;
  seaY: number;
  terrain: {
    isTileLoaded: (x: number, z: number) => boolean;
    isWaterTile: (x: number, z: number) => boolean;
  };
  tileMeters: number;
}): TriangleGeometry => {
  const result: TriangleGeometry = { indices: [], positions: [] };
  for (
    let z = centerTileZ - radiusTiles;
    z <= centerTileZ + radiusTiles;
    z += 1
  ) {
    for (
      let x = centerTileX - radiusTiles;
      x <= centerTileX + radiusTiles;
      x += 1
    ) {
      if (!terrain.isTileLoaded(x, z) || !terrain.isWaterTile(x, z)) {
        continue;
      }
      pushQuad(result, [
        [x * tileMeters, seaY, z * tileMeters],
        [(x + 1) * tileMeters, seaY, z * tileMeters],
        [x * tileMeters, seaY, (z + 1) * tileMeters],
        [(x + 1) * tileMeters, seaY, (z + 1) * tileMeters]
      ]);
    }
  }
  return result;
};

export const buildStreamBoundaryPatchGeometry = ({
  centerTileX,
  centerTileZ,
  radiusTiles,
  terrain,
  tileMeters
}: {
  centerTileX: number;
  centerTileZ: number;
  radiusTiles: number;
  terrain: {
    isTileLoaded: (x: number, z: number) => boolean;
  };
  tileMeters: number;
}): TriangleGeometry => {
  const result: TriangleGeometry = { indices: [], positions: [] };
  const bottom = -20;
  const top = 40;

  for (
    let z = centerTileZ - radiusTiles;
    z <= centerTileZ + radiusTiles;
    z += 1
  ) {
    for (
      let x = centerTileX - radiusTiles;
      x <= centerTileX + radiusTiles;
      x += 1
    ) {
      if (!terrain.isTileLoaded(x, z)) {
        continue;
      }
      const minX = x * tileMeters;
      const maxX = minX + tileMeters;
      const minZ = z * tileMeters;
      const maxZ = minZ + tileMeters;
      const edges = [
        {
          neighbor: [x - 1, z],
          vertices: [
            [minX, bottom, minZ],
            [minX, top, minZ],
            [minX, bottom, maxZ],
            [minX, top, maxZ]
          ]
        },
        {
          neighbor: [x + 1, z],
          vertices: [
            [maxX, bottom, maxZ],
            [maxX, top, maxZ],
            [maxX, bottom, minZ],
            [maxX, top, minZ]
          ]
        },
        {
          neighbor: [x, z - 1],
          vertices: [
            [maxX, bottom, minZ],
            [maxX, top, minZ],
            [minX, bottom, minZ],
            [minX, top, minZ]
          ]
        },
        {
          neighbor: [x, z + 1],
          vertices: [
            [minX, bottom, maxZ],
            [minX, top, maxZ],
            [maxX, bottom, maxZ],
            [maxX, top, maxZ]
          ]
        }
      ] as const;

      for (const edge of edges) {
        if (!terrain.isTileLoaded(edge.neighbor[0], edge.neighbor[1])) {
          pushQuad(result, edge.vertices);
        }
      }
    }
  }

  return result;
};

export const buildZarchStaticColliderPatch = ({
  centerTileX,
  centerTileZ,
  obstacleColliders,
  radiusTiles,
  seaY,
  terrain,
  tileMeters,
  wrapOffsets
}: ZarchStaticColliderPatchInput<
  ZarchStaticColliderPatchTerrain & Pick<ZarchTerrain, 'getTileAverageHeight'>
>): ZarchStaticCollider[] => {
  const colliders: ZarchStaticCollider[] = [];
  const triangleEntries = [
    {
      geometry: buildTerrainPatchGeometry({
        centerTileX,
        centerTileZ,
        radiusTiles,
        terrain,
        tileMeters
      }),
      kind: 'terrain' as const
    },
    {
      geometry: buildWaterBoundaryPatchGeometry({
        centerTileX,
        centerTileZ,
        radiusTiles,
        seaY,
        terrain,
        tileMeters
      }),
      kind: 'shoreline' as const
    },
    {
      geometry: buildWaterSurfacePatchGeometry({
        centerTileX,
        centerTileZ,
        radiusTiles,
        seaY,
        terrain,
        tileMeters
      }),
      kind: 'water-surface' as const
    },
    {
      geometry: buildStreamBoundaryPatchGeometry({
        centerTileX,
        centerTileZ,
        radiusTiles,
        terrain,
        tileMeters
      }),
      kind: 'stream-boundary' as const
    }
  ];

  for (const { geometry, kind } of triangleEntries) {
    if (geometry.indices.length > 0) {
      colliders.push({
        geometry,
        owner: { id: 'active', kind },
        shape: 'triangle'
      });
    }
  }

  for (
    let tileZ = centerTileZ - radiusTiles;
    tileZ <= centerTileZ + radiusTiles;
    tileZ += 1
  ) {
    for (
      let tileX = centerTileX - radiusTiles;
      tileX <= centerTileX + radiusTiles;
      tileX += 1
    ) {
      if (
        !terrain.isTileLoaded(tileX, tileZ) ||
        !terrain.shouldHaveTree(tileX, tileZ)
      ) {
        continue;
      }
      const large = terrain.treeType(tileX, tileZ) === 1;
      colliders.push({
        center: [
          (tileX + 0.5) * tileMeters,
          (terrain.getTileAverageHeight(tileX, tileZ) ?? 0) + (large ? 4 : 2.5),
          (tileZ + 0.5) * tileMeters
        ],
        halfHeight: large ? 4 : 2.5,
        owner: { id: `${tileX}:${tileZ}`, kind: 'vegetation' },
        radius: large ? 1.5 : 0.8,
        shape: 'cylinder'
      });
    }
  }

  for (const collider of obstacleColliders) {
    for (const offset of wrapOffsets) {
      colliders.push({
        center: [
          collider.center[0] + offset.x,
          collider.center[1],
          collider.center[2] + offset.z
        ],
        halfExtents: collider.halfExtents,
        owner: {
          id: `${collider.id}@${offset.x}:${offset.z}`,
          kind: 'obstacle'
        },
        shape: 'box',
        yawRadians: collider.yawRadians
      });
    }
  }

  return colliders;
};

const getHeight = (chunk: RuntimeMapChunk, x: number, z: number) =>
  chunk.heights[z * chunk.samplesWide + x] ?? 0;

const isWaterTile = (chunk: RuntimeMapChunk, x: number, z: number) => {
  if (x < 0 || z < 0 || x >= chunk.tileWidth || z >= chunk.tileHeight) {
    return false;
  }

  return (
    (getHeight(chunk, x, z) +
      getHeight(chunk, x + 1, z) +
      getHeight(chunk, x, z + 1) +
      getHeight(chunk, x + 1, z + 1)) *
      0.25 <=
    0
  );
};

const pushQuad = (
  target: TriangleGeometry,
  vertices: readonly (readonly [number, number, number])[]
) => {
  const start = target.positions.length / 3;
  target.positions.push(...vertices.flat());
  target.indices.push(
    start,
    start + 2,
    start + 1,
    start + 1,
    start + 2,
    start + 3
  );
};

export const buildChunkPhysicsGeometry = ({
  chunk,
  map,
  seaY
}: {
  chunk: RuntimeMapChunk;
  map: Pick<MapMetadata, 'resolution'>;
  seaY: number;
}): ChunkPhysicsGeometry => {
  const spacing = map.resolution.metersPerTile;
  const originX = chunk.originTileX * spacing;
  const originZ = chunk.originTileZ * spacing;
  const terrain: TriangleGeometry = { indices: [], positions: [] };
  const waterSurface: TriangleGeometry = { indices: [], positions: [] };
  const shoreline: TriangleGeometry = { indices: [], positions: [] };

  for (let z = 0; z < chunk.samplesHigh; z += 1) {
    for (let x = 0; x < chunk.samplesWide; x += 1) {
      terrain.positions.push(
        originX + x * spacing,
        getHeight(chunk, x, z),
        originZ + z * spacing
      );
    }
  }

  for (let z = 0; z < chunk.tileHeight; z += 1) {
    for (let x = 0; x < chunk.tileWidth; x += 1) {
      const topLeft = z * chunk.samplesWide + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + chunk.samplesWide;
      const bottomRight = bottomLeft + 1;
      terrain.indices.push(
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight
      );

      if (!isWaterTile(chunk, x, z)) {
        continue;
      }

      const minX = originX + x * spacing;
      const maxX = minX + spacing;
      const minZ = originZ + z * spacing;
      const maxZ = minZ + spacing;
      pushQuad(waterSurface, [
        [minX, seaY, minZ],
        [maxX, seaY, minZ],
        [minX, seaY, maxZ],
        [maxX, seaY, maxZ]
      ]);

      const top =
        Math.max(
          getHeight(chunk, x, z),
          getHeight(chunk, x + 1, z),
          getHeight(chunk, x, z + 1),
          getHeight(chunk, x + 1, z + 1)
        ) + 5;
      const bottom = seaY - 20;
      const edges = [
        {
          neighbor: [x - 1, z],
          vertices: [
            [minX, bottom, minZ],
            [minX, top, minZ],
            [minX, bottom, maxZ],
            [minX, top, maxZ]
          ]
        },
        {
          neighbor: [x + 1, z],
          vertices: [
            [maxX, bottom, maxZ],
            [maxX, top, maxZ],
            [maxX, bottom, minZ],
            [maxX, top, minZ]
          ]
        },
        {
          neighbor: [x, z - 1],
          vertices: [
            [maxX, bottom, minZ],
            [maxX, top, minZ],
            [minX, bottom, minZ],
            [minX, top, minZ]
          ]
        },
        {
          neighbor: [x, z + 1],
          vertices: [
            [minX, bottom, maxZ],
            [minX, top, maxZ],
            [maxX, bottom, maxZ],
            [maxX, top, maxZ]
          ]
        }
      ] as const;

      for (const edge of edges) {
        if (!isWaterTile(chunk, edge.neighbor[0], edge.neighbor[1])) {
          pushQuad(shoreline, edge.vertices);
        }
      }
    }
  }

  return {
    shoreline: shoreline.indices.length > 0 ? shoreline : null,
    terrain,
    waterSurface: waterSurface.indices.length > 0 ? waterSurface : null
  };
};

export const getNearestWrapOffsets = ({
  focusX,
  focusZ,
  map
}: {
  focusX: number;
  focusZ: number;
  map: Pick<MapMetadata, 'extent'>;
}) => {
  if (map.extent.kind !== 'finite') {
    return [{ x: 0, z: 0 }];
  }

  const extent = map.extent;

  const xCenters = extent.wrapX
    ? [-1, 0, 1].map(
        offset =>
          (Math.round(focusX / extent.widthMeters) + offset) *
          extent.widthMeters
      )
    : [0];
  const zCenters = extent.wrapZ
    ? [-1, 0, 1].map(
        offset =>
          (Math.round(focusZ / extent.heightMeters) + offset) *
          extent.heightMeters
      )
    : [0];

  return zCenters.flatMap(z => xCenters.map(x => ({ x, z })));
};
