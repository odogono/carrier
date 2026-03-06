# `docs/static-entities-plan.md`

## Summary
Introduce static entities as a shared world model across API, client, and Go engine, without forcing a full ECS into persistence or serialization.

Use a single static-entity schema with two provenance modes:
- `authored` for buildings, bridges, and hand-placed props
- `generated` for trees and similar natural props (deferred to a later milestone)

The first milestone focuses on authored entities only. Trees remain client-only procedural decoration for now. The `generated` source mode is included in the schema for forward-compatibility but is not implemented yet.

## Core Model
Define a shared static-entity record in `packages/contracts` with:
- `id`
- `mapId`
- `archetypeId`
- `source` as `authored | generated`
- `position` as `{ x, y, z }`
- `rotation` as `{ yaw }` (extensible to pitch/roll for future prop types)
- optional `scale`
- `bounds` as a discriminated union (see below)
- `state` as `active | destroyed | disabled`

### Bounds
Define `StaticEntityBounds` as a discriminated union so both gameplay collision and rendering know the shape:
- `{ type: 'cylinder', radius: number, height: number }` — for trees and narrow props
- `{ type: 'aabb', halfExtents: [number, number, number] }` — for buildings, bridges, and box-shaped props

Default bounds live on the archetype. Entity instances only override bounds when they differ from the archetype default.

### Archetypes
Define an `ArchetypeDefinition` type and a registry constant in `packages/contracts` so API, client, and Go engine all import from one canonical source.

Each archetype carries:
- default bounds (collision shape and dimensions)
- render prefab ID (resolved to a mesh/model on the client)
- collision model hint (cylinder, aabb)

Initial archetypes for v1:
- `building_placeholder`
- `bridge_placeholder`

Entity instances only carry placement and state. All shape, collision, and render defaults come from the archetype.

### Chunk Overlap
Entities are assigned to their origin chunk. Large entities (buildings, bridges) may extend into adjacent chunks. Archetypes should declare an overlap margin or `chunkSpan` so chunk/window queries can include entities from neighboring chunks whose bounds overlap the query region. This avoids needing to retrofit cross-chunk discovery later.

## Implementation Phases

### Phase 1: Shared schema and archetype registry
Goal: establish one canonical static-entity model without changing gameplay yet.

Changes:
- add `StaticEntity`, `StaticEntityState`, `StaticEntityBounds`, and related types in `packages/contracts`
- add `ArchetypeDefinition` type and archetype registry constant in `packages/contracts`
- define `StaticEntityBounds` as a discriminated union (cylinder | aabb)
- use `rotation: { yaw }` instead of a flat `rotationYaw` scalar
- include `source` field (`authored | generated`) in the schema, but only `authored` is used in this milestone
- add chunk-level `staticEntities` field to the `MapChunk` contract
- document the split between:
  - archetype definition (shape, collision, render prefab)
  - placement instance (position, rotation, state)
  - render asset resolution (prefab ID to mesh)

Acceptance:
- contracts compile cleanly
- API/client type generation or imports remain stable
- no runtime behavior changes required yet

### Phase 2: API and persistence for authored entities
Goal: expose authored static entities through existing map/chunk APIs.

Changes:
- add authored static-entity persistence table:
  ```sql
  CREATE TABLE static_entities (
    id TEXT PRIMARY KEY,
    map_id TEXT NOT NULL,
    archetype_id TEXT NOT NULL,
    chunk_x INTEGER NOT NULL,
    chunk_z INTEGER NOT NULL,
    position_x REAL NOT NULL,
    position_y REAL NOT NULL,
    position_z REAL NOT NULL,
    rotation_yaw REAL NOT NULL DEFAULT 0,
    scale REAL,
    state TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE
  );
  ```
- extend `MapChunk` responses to include `staticEntities`
- add CRUD endpoints for authored entities through the API
- when serving a chunk:
  - load authored entities assigned to that chunk
  - include large entities from adjacent chunks whose bounds overlap into the requested chunk region
  - return the merged result

Design rule:
- authored placements are stored directly as DB rows
- chunk assignment is by origin position; overlap is handled at query time

Acceptance:
- chunk responses include authored static entities
- large entities near chunk edges are discoverable from adjacent chunk queries
- CRUD operations create, read, update, and delete authored entities

### Phase 3: Client consumption
Goal: render authored static props from entity data delivered in chunk responses.

Changes:
- add a client-side static-entity store keyed by entity ID, with lifecycle tied to chunk cache (evict entities when React Query GCs the owning chunk)
- build an archetype-to-render-prefab catalog on the client
- render authored props from `staticEntities` in chunk data
- use instanced rendering keyed by archetype for performance when multiple instances share the same prefab
- keep terrain responsible only for ground/water/height sampling

Design rule:
- tile visuals come from terrain
- world props come from entity data
- render assets are resolved through prefab IDs, not raw model paths per placement

Acceptance:
- authored props render correctly from chunk data
- missing prefab mappings fall back to placeholder geometry
- destroyed or disabled entities can be hidden or swapped to a broken-state mesh later

### Phase 4: Go engine integration
Goal: let the engine reason about static props as first-class world objects.

Changes:
- add matching Go structs for static entities, bounds, and lifecycle state
- build a spatial index (grid or similar) for collision and window queries
- load chunk static entities into engine indices by chunk and by ID
- expose engine queries for:
  - entities in chunk/window
  - entity lookup by ID
  - static collision bounds
  - lifecycle state changes
- keep this separate from the current realtime player protobuf flow

Design rule:
- engine should consume the same world entity records as the client/API model
- do not introduce full ECS serialization yet
- if ECS is later adopted in runtime simulation, static entities can be projected into ECS components after load

Acceptance:
- engine can query building/bridge collision candidates from chunk/world data
- state updates can target authored prop IDs
- spatial index returns correct results for window and radius queries

### Phase 5: Admin/editor for authored props
Goal: provide tooling to place and manage authored entities on maps.

Changes:
- add placement creation/editing support through admin UI
- define anchor position and chunk assignment rules for larger props
- visual placement tool or coordinate-based entry form
- ensure the admin can set archetype, position, rotation, scale, and state

Acceptance:
- authored buildings/bridges can be placed through the admin interface
- placed entities appear in chunk responses and render on the client
- entities can be updated or removed through the admin

## Deferred: Generated Entities (Trees)
Tree generation as static entities is deferred to a later milestone. Current state and future notes:

- Trees remain client-only procedural decoration via `shouldHaveTree`/`treeType` in `apps/client/src/helpers/zarch-terrain.ts`
- When revisited, generated entity work should include:
  - seed-based generation using `map.seed` plus chunk coordinates, reusing the `xfnv1a` + `mulberry32` PRNG from `apps/api/src/maps/generation.ts`
  - deterministic entity IDs (e.g., `mapId:tree:gx:gz` with index suffix if multiple entities per tile)
  - override/state persistence for generated entities that differ from default (destroyed, disabled)
  - cross-platform determinism tests verifying TS and Go generators produce identical output for the same seed
  - generation config schema on `MapMetadata` (density, exclusion rules)
  - integration with the vehicles plan (`docs/vehicles-plan.md`) for obstacle queries (`getStaticObstaclesInRadius`)

## Performance
- Entities are embedded in chunk responses alongside height data (no separate fetch per entity)
- Client should use instanced rendering keyed by archetype to handle many instances efficiently
- Go engine should use a spatial grid or similar index for collision and window queries
- The current client tree pool is capped at 160 instances; future entity budgets should account for this baseline

## Test Plan
- contract validation accepts valid static entities and rejects invalid bounds/state/archetype references
- authored entity CRUD: create, read, update state, delete through API
- chunk responses include authored static entities at correct positions
- large entities near chunk edges are discoverable from adjacent chunk queries
- client rendering resolves archetypes to render prefabs from entity data
- placeholder geometry renders for unknown or missing archetype prefabs
- engine spatial index returns correct collision and query results for window and radius lookups

## Assumptions
- first milestone targets authored static props only
- generated entities (trees) are deferred to a later milestone
- archetypes are defined as code constants in `packages/contracts` for v1, not user-authored DB records
- realtime protobuf changes are out of scope until dynamic/server-authoritative entities arrive
- the vehicles plan (`docs/vehicles-plan.md`) will consume static entity data for obstacle queries when generated entities are added later
