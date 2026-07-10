# Map Chunks

This document describes the current runtime map chunk model. The high-level map architecture remains in [map-architecture.md](./map-architecture.md); this file focuses on the chunk payloads used by the API, gameplay client, admin preview, and terrain editing code.

The primary schema is `MapChunkSchema` in [`packages/contracts/src/schema/maps/index.ts`](../packages/contracts/src/schema/maps/index.ts). Binary chunk decoding lives in [`packages/contracts/src/schema/maps/binary.ts`](../packages/contracts/src/schema/maps/binary.ts).

## Chunk Identity And Space

A map chunk is a tile-space slice of runtime terrain for one map. Chunks are addressed by signed integer coordinates:

- `chunkX`
- `chunkZ`

Signed chunk coordinates are valid for all map kinds. How those signed coordinates resolve depends on the map:

- `wrapped-classic` maps are finite and wrapping. Signed requests are canonicalized onto the finite toroidal world before the server reads or generates cached chunk data.
- `infinite-vector` maps are unbounded. Signed requests generate or read cached terrain for the requested signed chunk coordinate directly.
- exported slice maps are immutable finite snapshots with stored chunk data. `wrapped-classic-slice` maps wrap, while `finite-vector-slice` maps do not.

Chunk dimensions come from `MapMetadata.resolution`:

- `chunkSizeTiles` is the normal number of tiles per chunk along each axis.
- `metersPerTile` converts tile-space positions into world metres.

Runtime code should use the server-provided `resolution`; it should not infer chunk size or tile scale locally.

## Tiles, Samples, And Origins

Chunks carry both tile-layer data and sample-height data:

- `originTileX` and `originTileZ` are the global tile-space origin of the chunk.
- `tileWidth` and `tileHeight` are the number of tiles covered by the chunk.
- `samplesWide` and `samplesHigh` are the dimensions of the height sample grid.

For a full interior chunk, sample dimensions are normally one larger than tile dimensions on each axis because terrain heights are sampled at tile grid vertices. For example, a `32 x 32` tile chunk normally has a `33 x 33` height sample grid.

Tile layers use row-major indexing:

```ts
const localX = tileX - chunk.originTileX;
const localZ = tileZ - chunk.originTileZ;
const index = localZ * chunk.tileWidth + localX;
```

Height samples also use row-major indexing, but with `samplesWide`:

```ts
const localX = sampleX - chunk.originTileX;
const localZ = sampleZ - chunk.originTileZ;
const index = localZ * chunk.samplesWide + localX;
```

Consumers must bounds-check against the corresponding dimensions before indexing. Tile layers are only valid for `tileWidth * tileHeight` entries; height samples are only valid for `samplesWide * samplesHigh` entries.

## Base Height Data

`heights` is the base terrain height layer. It represents generated or snapshotted terrain sample heights before tile height-step overrides are applied.

JSON chunk responses expose `heights` as a `number[]`. Binary chunk responses expose `heights` as a blob and describe the encoding in `layers.height`:

- `float32` means the blob can be decoded as `Float32Array`.
- `uint16` means values are quantized and must be expanded with the layer metadata:

```ts
height = minHeight + encodedValue * step;
```

After decoding, runtime code treats base heights as a `Float32Array` in sample row-major order.

The `layers.height.step` field used by `uint16` decoding is not the same thing as tile edit `heightSteps`. It is only the quantization step for the base height blob.

## Optional Per-Tile Layers

Chunks may include optional per-tile layers. These layers are present only when the chunk has tile override data or derived material data to send.

- `materials` is a per-tile surface material layer. Binary chunks encode it as `uint8` material ids and decode it into material definitions.
- `tileHeightSteps` is a signed per-tile height override layer. Binary chunks encode it as `int8`.
- `tileTypeIndexes` is a per-tile type override layer. Binary chunks encode it as `uint8`; the sentinel value means the default tile type.
- `tileColorIndexes` is a per-tile color override layer. Binary chunks encode it as `uint8`; the sentinel value means no authored color override.

When a tile override layer is absent, consumers should use default values:

- `tileHeightSteps`: `0`
- `tileTypeIndexes`: default tile type, currently `normal`
- `tileColorIndexes`: no authored color override

The server builds tile override arrays from `map_tile_overrides`. If every tile in a chunk is default, the override arrays are omitted instead of sending all-zero or all-sentinel data.

## Tile Height Steps

`tileHeightSteps` stores integer edit steps, not metres. The metre size of one step comes from `ZarchTileEditConfig.heightStepMeters`, currently `4`.

For a tile:

```ts
tileOffsetMetres = tileHeightSteps[index] * editConfig.heightStepMeters;
```

Terrain sampling applies these offsets at grid vertices rather than replacing the base height samples directly. At a grid vertex `(gx, gz)`, the client looks at the four incident tiles:

- `(gx - 1, gz - 1)`
- `(gx, gz - 1)`
- `(gx - 1, gz)`
- `(gx, gz)`

For each incident tile that exists in the map, it adds that tile's step offset. The final vertex offset is the average of the incident offsets:

```ts
finalHeight = baseHeight + average(incidentTileHeightSteps * heightStepMeters);
```

This preserves connected terrain across neighboring tiles. A broad area of `+2` height steps raises its shared vertices by `8` metres. A single edited tile blends at its vertices because neighboring unedited tiles contribute `0` steps to the average.

Tile height edits are terrain-affecting mutations. Updating them bumps the map revision and invalidates affected chunk windows so clients reload fresh chunk data.

## Static Entities In Chunks

Chunks include `staticEntities` as placement metadata for runtime consumption. These records are map-scoped placements of approved archetypes and include map-local authored state such as position, rotation, scale, y-offset, label, and enabled/disabled state.

Static entity inclusion is overlap-aware. A placement can appear in a chunk response when its footprint overlaps the chunk, not only when its anchor point is inside the chunk. Consumers should deduplicate placements by entity id when combining multiple visible chunks.

Exported maps snapshot only static entities whose full footprint is contained by the requested export bounds. Placements that cross an export edge are omitted, while the requested terrain bounds stay unchanged. Exported chunk payloads therefore represent the export snapshot rather than a live view of later source-map or catalog placement changes.
