# Static Entities Stage 2: Shared Gameplay Obstacle Layer

## Summary

Build the next static-entities stage around a shared, pre-networking gameplay obstacle model rather than new placement types or multiplayer sync.

The goal is to make authored static entities usable as deterministic gameplay blockers in both the TypeScript client runtime and the Go engine, while keeping current rendering, editor authoring, and export/import behavior intact.

This stage formalizes blocking semantics at the asset-version level, propagates them through contracts and export manifests, and exposes obstacle-queryable records in both runtimes. Invalid placements remain visible and editable, but they must be excluded from gameplay obstacle indexing.

## Public Interfaces And Model Changes

Add a typed gameplay obstacle field to `AssetVersion` in `packages/contracts/src/schema/maps/authored.ts`:

- `obstacleMode: 'none' | 'solid'`

Update asset review input:

- `UpdateAssetVersionReviewInput` gains optional `obstacleMode`

Update export snapshot shape in `packages/contracts/src/schema/maps/index.ts`:

- `StaticEntityExportAssetVersion` gains `obstacleMode`
- manifest normalization and compatibility hashing must include `obstacleMode`

Keep `collisionClass` as descriptive/review metadata only. Do not use it as the gameplay rule source.

## Behavior Rules

Use a minimal blocking-only model for this stage:

- `obstacleMode = 'solid'` means the asset can contribute gameplay blockers
- `obstacleMode = 'none'` means the asset never contributes gameplay blockers

An entity is obstacle-eligible only when all of the following are true:

- placement `state` is `active`
- resolved asset version has `obstacleMode = 'solid'`
- grounding validity is `true`

Entities that fail those checks must still:

- remain in authored data
- remain renderable in admin and client
- remain exportable/importable

They must not:

- enter gameplay obstacle spatial indexes
- appear in gameplay obstacle query results

Obstacle shape for this stage uses the existing derived collision box and placement transform:

- client and engine continue deriving oriented collision boxes from asset collision dimensions plus placement yaw/scale
- broadphase queries may continue using footprint/collision AABB coverage
- no new fine-grained collision mesh work is included in this stage

## Phases

### Phase 1: Contracts And Persistence

Goal: formalize gameplay obstacle semantics on asset versions.

Changes:

- add `obstacleMode` enum and schema fields to shared contracts
- update export manifest schema and normalization/hash behavior
- add persistence support for `obstacleMode` in the map repository
- default/backfill existing asset versions to `solid`

Acceptance:

- contracts compile cleanly
- repository reads/writes preserve `obstacleMode`
- exported manifest hashes change when `obstacleMode` changes

### Phase 2: Admin Review Integration

Goal: make obstacle semantics reviewable and explicit in the existing asset workflow.

Changes:

- add `obstacleMode` to asset review update handling in the API
- add an admin review control on `apps/admin/src/pages/assets.tsx`
- show current obstacle behavior alongside collision and grounding metadata
- preserve current approve/create-archetype workflow

Acceptance:

- admins can set blocking vs non-blocking before approval
- approved assets retain immutable reviewed obstacle semantics
- archetype creation behavior is unchanged aside from carrying the new field indirectly through the bound asset version

### Phase 3: Engine Obstacle Semantics

Goal: make Go world loading and spatial indexing explicitly obstacle-aware.

Changes:

- extend exported manifest parsing in `apps/game/internal/world/load.go` to ingest `obstacleMode`
- extend world model types in `apps/game/internal/world/types.go` so obstacle eligibility is explicit
- keep `World.Entities` as the full resolved entity set
- index only obstacle-eligible entities in the gameplay spatial index
- define existing radius/AABB queries as gameplay obstacle queries

Acceptance:

- active, valid, solid entities are queryable as gameplay obstacles
- disabled, non-blocking, or invalid entities remain loaded but do not appear in obstacle queries
- current export loading remains deterministic

### Phase 4: Client Runtime Obstacle Layer

Goal: give the client runtime the same obstacle semantics and query surface as the engine.

Changes:

- extend static-entity runtime helpers in `apps/client/src/helpers/zarch-static-entities.ts` and related runtime code to resolve gameplay obstacle records from chunk placements plus referenced archetypes and asset versions
- expose client-side helpers for obstacle candidate lookup by radius or AABB
- keep this as infrastructure only; do not change controls, vehicles, or local movement behavior yet
- ensure client obstacle inclusion rules match engine rules exactly

Acceptance:

- client can build a deterministic local obstacle set from visible/resolved static entities
- client inclusion/exclusion behavior matches engine parity rules
- rendering behavior remains unchanged for blocking and non-blocking assets alike

### Phase 5: Cross-Runtime Parity And Hardening

Goal: prevent divergence between TS and Go interpretations.

Changes:

- align obstacle eligibility and resolved geometry expectations across contracts, client helpers, and Go loader tests
- add parity-focused fixtures for representative cases
- document the canonical rule set for future gameplay systems to reuse

Acceptance:

- the same placement and manifest inputs yield the same blocker/non-blocker outcome in TS and Go
- obstacle query behavior is stable for future vehicle/simulation work
- no networking or protobuf changes are required

## Test Plan

Add or update tests for:

- contract validation of `obstacleMode` on authored asset versions and export manifest entries
- repository persistence and default/backfill behavior
- export/import manifest compatibility when only obstacle semantics differ
- Go world loading and indexing for:
  - `active + valid + solid`
  - `active + invalid + solid`
  - `active + valid + none`
  - `disabled + valid + solid`
- client helper parity for the same cases
- regression coverage proving rendering and archetype/catalog resolution continue to work for non-blocking assets and invalid-but-visible placements

## Assumptions And Defaults

- This stage is pre-networking only
- No protobuf or websocket schema changes are included
- Blocking semantics remain asset-version-owned, not placement-owned or archetype-owned
- Invalid placements stay warning-only in authoring and export flows
- Invalid placements never participate in gameplay blocker queries
- Existing reviewed assets are migrated to `obstacleMode = 'solid'` by default
- This stage prepares shared infrastructure for later vehicle and simulation work, but does not itself implement vehicle movement or authoritative collision resolution
