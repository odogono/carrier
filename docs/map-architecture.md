# Map Architecture

This document describes the current map and map-linked content system. The old finite-only model and the earlier `vector-islands` proposal are no longer the source of truth.

The primary contract lives in `packages/contracts/src/schema/maps/index.ts`. Authored terrain, static-entity, and content-catalog contracts live in `packages/contracts/src/schema/maps/authored.ts`.

## Top-Level Model

All maps share one `MapMetadata` shape. The runtime model is split across:

- `MapMetadata.kind`
  - the authored or exported map family
- `extent.kind`
  - whether the map behaves as `finite` or `infinite`
- `resolution`
  - `metersPerTile` and `chunkSizeTiles`
- `export`
  - optional source-link metadata for exported slices

Current map kinds:

| Kind | Extent | Wraps | Mutable | Primary source of terrain |
| --- | --- | --- | --- | --- |
| `wrapped-classic` | `finite` | yes | yes | deterministic generator + persisted overrides |
| `infinite-vector` | `infinite` | no | yes | authored polygons, controls, and derived state |
| `finite-vector-slice` | `finite` | no | no | snapshot exported from `infinite-vector` |
| `wrapped-classic-slice` | `finite` | yes | no | wrapped snapshot exported from `infinite-vector` |

Important invariants:

- `extent.kind` is the source of truth for finite versus infinite runtime behavior.
- `widthTiles`, `heightTiles`, `widthMeters`, and `heightMeters` exist only on finite extents.
- `chunkX` and `chunkZ` are signed for all map kinds.
- `resolution` is part of the server contract and must not be inferred locally.
- `export` exists only for exported maps and records:
  - export bounds
  - source map id
  - source revision
  - export timestamp
  - static-entity snapshot metadata, including manifest hash

The map system now has four distinct data layers:

- terrain authoring data
  - source polygons, control points, and derived islands for `infinite-vector`
- tile overrides
  - per-tile authored height/color/type adjustments
- static entities
  - archetype placements on a specific map
- shared catalog content
  - asset versions, archetypes, and Zarch runtime entities reused across maps

## Revision And Invalidation Model

Most authored mutations are guarded by `expectedRevision`. The server uses the map revision as the optimistic concurrency boundary for terrain, tile, and placement edits.

Terrain-affecting mutations bump the map revision and invalidate generated chunk data by scope:

- `wrapped-classic`
  - regeneration clears all cached chunks, tile overrides, and static entities
- `infinite-vector`
  - polygon, control-point, boolean, and tile-edit mutations invalidate by dirty bounds
- exported slices
  - immutable after creation; chunk data is stored as snapshot state

## Server Responsibilities

The repository implementation lives in `apps/api/src/maps/repository.ts`.

For the detailed chunk payload model, including height samples, binary decoding, tile override layers, and static entity inclusion, see [map-chunks.md](./map-chunks.md).

### `wrapped-classic`

- Metadata is persisted in `maps`.
- `map_chunks` stores cached generated chunk rows, not authoritative terrain source data.
- Missing chunks are generated on demand from `seed`, `generator`, generator params, and canonical wrapped chunk coordinates.
- Signed chunk requests are canonicalized onto the finite toroidal world before cache lookup.
- Tile overrides are persisted in `map_tile_overrides`.
- Static entity placements are persisted in `map_static_entities`.
- Regeneration wipes cached chunks, tile overrides, and static entities, then bumps revision.

### `infinite-vector`

- Metadata is persisted in `maps`.
- Source polygons, control points, derived islands, and static entities are authoritative authored state.
- `map_chunks` stores cached generated terrain for signed chunk coordinates.
- Signed chunk generation is derived from authored terrain state, not from a finite canonical grid.
- Terrain invalidation is localized by dirty bounds after terrain-affecting mutations.
- Boolean operations are server-authoritative and retire their input polygons.
- Overview data is a first-class derived surface used by the editor for bounds and clustering.

### Exported slices

- Exports are created only from `infinite-vector` maps.
- Export metadata is persisted on the exported map row through the `export` field.
- Exported maps are immutable finite snapshots with stored chunk data.
- `finite-vector-slice` exports are finite and non-wrapping.
- `wrapped-classic-slice` exports are finite and wrapping on both axes.
- Derived islands are clipped into export-local coordinates and snapshotted into the export.
- Overlapping static entities are snapshotted into the export, along with:
  - entity count
  - archetype count
  - manifest hash
  - optional manifest detail

Export snapshot semantics:

- the exported map keeps a direct link to the source map id and source revision
- exported terrain no longer depends on future source-map edits
- exported static-entity metadata is versioned as a snapshot, not a live view of the catalog or placements

## Tile Editing

Tile editing is part of the shared map architecture rather than a gameplay-only concern.

- `maps.getTileEditConfig` returns the global tile-edit configuration.
- The config includes:
  - palette entries used for authored tile colors
  - tile type definitions such as `normal` and `landing-pad`
  - height-step limits
- `maps.updateTiles` applies batch tile overrides with:
  - `heightSteps`
  - `typeId`
  - `colorIndex`
- Tile edits are revision-guarded through `expectedRevision`.
- Wrapped finite maps canonicalize tile coordinates before persistence.
- Default-value resets are normalized away instead of storing no-op rows.
- Tile edits are terrain-affecting mutations and therefore invalidate affected chunk windows.

The tile override layer sits on top of the base terrain source:

- generated terrain remains the base height/material field
- tile overrides apply authored adjustments without replacing the entire map model
- runtime consumers fetch the edit config separately from chunk data

## Static Entities

Static entities are map-scoped placements of approved archetypes.

- Placements reference a stable archetype id from the shared catalog.
- A placement stores map-local authored state such as:
  - id
  - label
  - position
  - rotation
  - scale
  - y-offset
  - enabled or disabled state
- CRUD routes exist for create, list, update, and delete.
- Static entities are included in chunk payloads for runtime consumption.
- Export creation snapshots overlapping static entities and records manifest and hash metadata for compatibility checks.

Static entity placement depends on catalog metadata outside the map row itself:

- archetypes provide the stable content identity used on maps
- asset versions provide footprint, collision box, grounding policy, runtime artifact, instancing eligibility, and max-height delta data
- the admin editor computes grounding diagnostics against currently loaded terrain and exposes bulk placement operations

The map system therefore treats static entities as a bridge between:

- shared global content definitions
- map-authored placement state
- runtime chunk payloads consumed by gameplay and previews

## Asset And Archetype Pipeline

The asset and archetype pipeline is shared content infrastructure used by the map, editor, and runtime stack.

### Asset versions

Asset versions move through the lifecycle:

- `uploaded`
- `processing`
- `review`
- `ready`
- `failed`
- `archived`

The current upload entrypoint is a plain HTTP asset endpoint:

- `POST /api/maps/assets`

Review metadata is then managed through the map contracts. Review updates can change:

- footprint
- collision box
- collision class
- grounding policy
- instancing eligibility
- max-height delta
- diagnostics

Approval requires a runtime artifact and transitions the asset version into reusable catalog state.

### Archetypes

Archetypes are created from approved asset versions and become the stable ids used by map static entities.

- archetypes are global catalog records, not map-local data
- maps place archetypes by id rather than binding directly to raw assets
- `listReferencedArchetypes` resolves the subset actually used on a given map

### Zarch runtime entities

Zarch runtime entities are adjacent to, but distinct from, map static entities.

- they bind stable gameplay/runtime ids to approved asset versions
- they describe runtime-facing model data such as render dimensions
- they are global definitions, not map-scoped placements

## Client And Admin Runtime

Shared runtime code must branch on map kind and extent rather than assume finite dimensions.

### Gameplay client

Gameplay terrain loading lives under `apps/client/src/screens/zarch` and `apps/client/src/helpers/zarch-map-terrain.ts`.

- terrain loading supports both finite and infinite maps through one shared chunk path
- chunk loading uses signed coordinates
- chunk payload structure and height-step sampling are described in [map-chunks.md](./map-chunks.md)
- wrapped finite maps keep toroidal sampling and wrapped chunk prefetch
- infinite maps use unbounded chunk windows and origin-based camera defaults
- the minimap remains finite-map-only behavior
- tile editing consumes the server-provided tile edit config and persists authored overrides through `maps.updateTiles`

### Admin app

Admin viewport, detail, and editor code lives under `apps/admin/src`.

- the map detail page is the shared metadata and preview surface for all map kinds
- `infinite-vector` maps expose export creation and export listing on the detail page
- `infinite-vector` maps also expose a dedicated editor at `/maps/:id/editor`
- the editor covers:
  - polygon authoring
  - control-point authoring
  - derived-island metadata edits
  - boolean operations
  - tile-aware terrain preview
  - static entity placement and inspection
- shared viewport and preview code handles:
  - fit-to-bounds and clamped movement for finite maps
  - unbounded movement plus overview-derived framing for infinite maps

## Current API Surface

The map subsystem now spans both ORPC route groups and a single plain HTTP asset-upload endpoint.

### Core maps

- `maps.create`
- `maps.find`
- `maps.list`
- `maps.update`
- `maps.delete`
- `maps.regenerate`
- `maps.getChunk`
- `maps.getChunkBinary`

### Exports

- `maps.createExport`
- `maps.findExport`
- `maps.listExports`

### Tile editing

- `maps.getTileEditConfig`
- `maps.updateTiles`

### Infinite authored terrain

- source polygon create, list, update, delete
- control-point create, list, update, delete
- `maps.listDerivedIslands`
- `maps.updateDerivedIsland`
- `maps.applyBoolean`
- `maps.getOverview`

### Static entities

- `maps.createStaticEntity`
- `maps.listStaticEntities`
- `maps.updateStaticEntity`
- `maps.deleteStaticEntity`
- `maps.listReferencedArchetypes`

### Content pipeline

- `POST /api/maps/assets` for raw asset upload
- `maps.listAssetVersions`
- `maps.getAssetVersion`
- `maps.updateAssetVersionReview`
- `maps.approveAssetVersion`
- `maps.archiveAssetVersion`
- `maps.deleteAssetVersion`
- `maps.createArchetype`
- `maps.listArchetypes`
- `maps.getArchetype`
- `maps.updateArchetype`
- `maps.listZarchRuntimeEntities`
- `maps.getZarchRuntimeEntity`
- `maps.upsertZarchRuntimeEntity`

## Deferred Work

These paths are still deferred and should not be inferred from the current implementation:

- floating-origin support for very large runtime coordinates
- player-facing infinite-world overview UI
