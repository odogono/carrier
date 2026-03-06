# `docs/static-entities-plan.md`

## Summary
Introduce static entities as a shared world model across API, client, and Go engine, without forcing a full ECS into persistence or serialization.

Use a single static-entity schema with two provenance modes:
- `authored` for buildings, bridges, and hand-placed props
- `generated` for trees and similar natural props

Trees become the first real static entities. They stop being client-only procedural decoration and instead flow through chunk/world data as deterministic generated placements with stable IDs and optional lifecycle overrides.

## Core Model
Define a shared static-entity record in `packages/contracts` with:
- `id`
- `mapId`
- `archetypeId`
- `source` as `authored | generated`
- `position`
- `rotationYaw`
- optional `scale`
- `bounds`
- `state` with `active | destroyed | disabled`

Define archetypes/prefabs in code for v1, including at least:
- `tree_pine`
- `tree_round`
- placeholder building/bridge archetypes for later authored props

Treat archetypes as the bridge between logic and rendering:
- gameplay shape and collision defaults live on the archetype
- render asset or render prefab mapping also hangs off the archetype
- entity instances only carry placement and state

## Trees in Scope
Replace the current client-only tree rules with generated static entities.
- tree generation should use `map.seed` plus tile/chunk coordinates, not only global tile hash
- generated trees should receive deterministic IDs such as `mapId:tree:gx:gz`
- tree generation should respect terrain constraints such as water exclusion
- generated trees should be returned in chunk/world entity results exactly like authored props

Do not persist every generated tree as a DB row in v1.
Persist only:
- map seed and generation config
- authored placements
- override/state rows for generated entities that differ from default, such as destroyed trees

## Implementation Phases

### Phase 1: Shared schema and terminology
Goal: establish one canonical static-entity model without changing gameplay yet.

Changes:
- add `StaticEntity`, `StaticEntityState`, `StaticEntityBounds`, and related types in `packages/contracts`
- add `source` and `archetypeId` concepts from the start
- add chunk-level `staticEntities` to the map contract
- document the split between:
  - archetype definition
  - placement instance
  - render asset resolution

Acceptance:
- contracts compile cleanly
- API/client type generation or imports remain stable
- no runtime behavior changes required yet

### Phase 2: Tree generation becomes entity generation
Goal: convert trees from tile decoration into generated static entities.

Changes:
- move tree placement logic out of the client terrain rendering path
- create a deterministic tree generator shared conceptually across API and engine
- seed tree generation with `map.seed`
- emit tree placements with stable IDs, archetype IDs, bounds, and default active state
- keep generation chunk-aware so API and engine can request entities per chunk

Acceptance:
- same chunk request always yields the same tree entities for the same map seed
- different seeds produce different layouts
- trees are absent from invalid terrain such as water if generation rules require it

### Phase 3: API and persistence layering
Goal: expose static entities through existing map/chunk APIs.

Changes:
- extend `MapChunk` responses to include `staticEntities`
- add authored static-entity persistence tables
- add generated-entity override/state persistence keyed by `entity_id`
- when serving a chunk:
  - load authored entities for the chunk
  - generate tree entities for the chunk
  - apply overrides
  - return the merged result

Design rule:
- authored placements are stored directly
- generated trees are derived at read time
- override rows store only state deltas such as destroyed/disabled

Acceptance:
- chunk responses include both authored and generated static entities
- destroyed generated trees reappear correctly as destroyed via override lookup
- no need to materialize full generated-tree tables

### Phase 4: Client world/entity consumption
Goal: stop rendering trees from tile heuristics and render all static props from entity data.

Changes:
- remove direct `shouldHaveTree` and `treeType` usage from the visible-scene path
- add a client-side static-entity store keyed by entity ID
- resolve `archetypeId` to a render prefab catalog
- render trees and later props from `staticEntities`
- keep terrain responsible only for ground/water/height sampling

Design rule:
- tile visuals come from terrain
- world props come from entity data
- render assets are resolved through prefab IDs, not raw model paths per placement

Acceptance:
- trees still render correctly from chunk data
- missing prefab mappings fall back to placeholder geometry
- destroyed or disabled entities can be hidden or swapped to a broken-state mesh later

### Phase 5: Go engine world integration
Goal: let the engine reason about trees and other static props as first-class world objects.

Changes:
- add matching Go structs for static entities, bounds, and lifecycle state
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
- engine can query tree/building collision candidates from chunk/world data
- state updates can target generated tree IDs and authored prop IDs uniformly

### Phase 6: Authored props and editor/admin path
Goal: add buildings and bridges on top of the same model.

Changes:
- add authored archetypes for bridges/buildings
- add placement creation/editing support through API/admin paths
- define anchor position and chunk assignment rules for larger props
- ensure chunk/window queries include large overlapping props when needed

Acceptance:
- authored bridges/buildings coexist with generated trees in the same chunk entity stream
- client and engine consume them without type-specific special casing

## Test Plan
- contract validation accepts valid static entities and rejects invalid bounds/state/archetype references
- tree generation is deterministic for a given map seed and chunk input
- tree generation varies across seeds
- generated trees are filtered correctly by terrain rules
- chunk responses return authored and generated entities together
- generated entity overrides apply correctly without persisting full generated rows
- client rendering resolves archetypes from entity data rather than tile-only heuristics
- engine chunk and ID indices return correct static collision/query results
- large authored props near chunk edges are still discoverable by world/window queries

## Assumptions
- first milestone targets static props only
- trees should become gameplay-relevant entities now
- generated trees should support lifecycle changes through override rows
- archetypes live in code/config for v1 rather than user-authored DB records
- realtime protobuf changes are out of scope until dynamic/server-authoritative entities arrive
