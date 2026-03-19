# Map Data Optimization Evaluation

This document captures the implemented evaluation pass for terrain height encoding and the runtime-first surface/material split.

## Current path

The current map pipeline is:

- generation produces a `Float32Array`
- SQLite stores raw float32 bytes in `map_chunks.heights`
- the repository decodes back to `Float32Array`
- the API widens heights to `number[]`
- the gameplay client and admin viewer consume JS numbers and derive visuals from elevation

That means the current bottleneck is not just storage. The large expansion is the JSON response shape, because a `33x33` sample chunk is only `4.25 KiB` as raw float32 bytes but about `20.72 KiB` once exposed as `number[]` in JSON.

## Measured results

Generated with `bun run evaluate:map-data` in [apps/api/package.json](/Users/alex/work/carrier/apps/api/package.json).

Representative `32x32` tile chunk (`33x33` samples):

| candidate | storage / wire bytes | avg sample error | max tile-average error | water drift | shoreline drift | color drift |
| --- | --- | --- | --- | --- | --- | --- |
| current float32 JSON | `20.72 KiB` wire | n/a | n/a | none | none | none |
| float32 binary envelope | `4.46 KiB` wire estimate | `0` | `0` | none | none | none |
| uint16 per chunk | `2.13 KiB` height bytes | `0.0003 m` | `0.0006 m` | `0 / 1024` | `0 / 1024` | `0 / 1024` |
| uint8 per chunk | `1.06 KiB` height bytes | `0.0873 m` | `0.1447 m` | `1 / 1024` | `1 / 1024` | `1 / 1024` |

Large map totals:

- `diamond-square 1024x1024`: float32 DB `4356 KiB`, current JSON `21414.14 KiB`, uint16 DB `2178 KiB`, uint8 DB `1089 KiB`
- `island-clusters 1024x1024`: float32 DB `4356 KiB`, current JSON `21206.11 KiB`, uint16 DB `2178 KiB`, uint8 DB `1089 KiB`

## Recommendation

Use a phased migration:

1. Remove API widening first. Keep float32 heights, but stop sending them as `number[]` once binary chunk transport is acceptable.
2. Prototype `uint16` quantization next. The measured error was effectively negligible for the representative chunk, with no water, shoreline, or color drift.
3. Reject `uint8` as the default target. It is smaller, but it already caused water and shoreline mismatches in the evaluation, which is enough to make it unsafe as the primary terrain format.

## Surface/material direction

The repo now includes a shared surface-material abstraction in [surface.ts](/Users/alex/work/carrier/packages/contracts/src/schema/maps/surface.ts):

- explicit materials: `default`, `water`, `shore`, `grass-low`, `grass-mid`, `grass-high`, `rock`, `road`, `damage`
- fallback classification from elevation when no explicit material is present
- shared RGB resolution so gameplay and admin can stay visually aligned

Both the gameplay client and admin viewer now route terrain coloring through this material layer abstraction instead of duplicating raw elevation-band logic:

- [zarch-terrain.ts](/Users/alex/work/carrier/apps/client/src/helpers/zarch-terrain.ts)
- [terrain-colors.ts](/Users/alex/work/carrier/apps/admin/src/lib/terrain-colors.ts)

That does not yet persist material data in chunk responses. It does establish the runtime seam needed for a later authoritative per-tile material layer.

## Proposed future wire shape

Recommended future chunk model:

- keep `heights` as sample-resolution data
- add encoding metadata to `layers.height` for quantized formats
- add an optional tile-resolution `materials` layer sized `tileWidth * tileHeight`

Conceptually:

```ts
type FutureMapChunk = {
  chunkX: number;
  chunkZ: number;
  mapId: string;
  originTileX: number;
  originTileZ: number;
  tileWidth: number;
  tileHeight: number;
  samplesWide: number;
  samplesHigh: number;
  layers: {
    height: {
      unit: 'metres';
      encoding: 'float32' | 'uint16';
      minHeight?: number;
      step?: number;
    };
    material?: {
      encoding: 'uint8';
      unit: 'surface-material';
    };
  };
  heights: ArrayBuffer;
  materials?: Uint8Array;
};
```

## Acceptance criteria for the later implementation

- `uint16` only ships if water and shoreline classification remain unchanged on the chosen benchmark set.
- client terrain queries, HUD, minimap, and admin bitmap must all remain within the measured `uint16` tolerance envelope
- explicit `road` and `damage` materials must override elevation-derived fallback colors consistently in both client and admin
- authoring remains out of scope until the storage/runtime layer is in place
