# Map Architecture

This document describes the current map system after the map-model reset. The old finite-only model and the earlier `vector-islands` proposal are no longer the source of truth.

## Top-Level Model

All maps use one shared `MapMetadata` shape with a discriminated runtime model:

- `wrapped-classic`
  - finite extent in metres and tiles
  - wraps on both axes
  - deterministic terrain generation from `seed` and canonical wrapped coordinates
- `infinite-vector`
  - infinite extent
  - authored source polygons and point controls
  - lazy signed chunk generation in all directions

The shared contract lives in `packages/contracts/src/schema/maps/index.ts`.

Important invariants:

- `extent.kind` is the source of truth for finite vs infinite behavior
- `widthTiles` and `heightTiles` exist only on `FiniteExtent`
- `chunkX` and `chunkZ` are signed for both map kinds
- `renderUnitsPerTile` is not part of the server contract; gameplay rendering keeps its own local constant

## Server Responsibilities

The API repository lives in `apps/api/src/maps/repository.ts`.

### `wrapped-classic`

- Metadata is persisted in `maps`
- Chunk rows in `map_chunks` are a cache, not authoritative terrain storage
- Missing chunks are generated on demand from `seed`, `generator`, and canonical wrapped chunk coordinates
- Signed chunk requests are canonicalized onto the finite toroidal world before cache lookup

### `infinite-vector`

- Metadata is persisted in `maps`
- Authored polygons, control points, and derived islands are persisted in dedicated tables
- `map_chunks` stores cached generated terrain for signed chunk coordinates
- Terrain invalidation is localized by dirty bounds after authored mutations
- Boolean operations are server-authoritative and retire their input polygons

## Client and Admin Runtime

Shared runtime code must branch on map kind rather than assume finite dimensions.

### Gameplay client

Gameplay terrain loading lives under `apps/client/src/screens/zarch` and `apps/client/src/helpers/zarch-map-terrain.ts`.

- chunk loading uses signed coordinates
- finite wrapped maps keep toroidal sampling and wrapped chunk prefetch
- infinite maps use unbounded chunk windows and origin-based camera defaults
- the minimap remains finite-map-only behavior

### Admin app

Admin viewport and editor code lives under `apps/admin/src`.

- map detail remains the shared metadata and preview page
- `infinite-vector` maps also expose a dedicated editor at `/maps/:id/editor`
- finite maps use fit-to-bounds and clamped navigation
- infinite maps use unbounded viewport movement plus authored-content overview data

## Current API Surface

Core routes:

- `maps.create`
- `maps.find`
- `maps.list`
- `maps.update`
- `maps.delete`
- `maps.getChunk`
- `maps.getChunkBinary`

`infinite-vector` authoring routes add CRUD for:

- source polygons
- control points
- derived-island metadata
- boolean operations
- overview data

## Deferred Work

These paths are explicitly deferred and should not be inferred from the current implementation:

- bounded-vector export or slice mode derived from `infinite-vector`
- floating-origin support for very large runtime coordinates
- player-facing infinite-world overview UI
