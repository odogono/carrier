# Carrier Map Model Reset

## Summary

Adopt one top-level `map` resource with two explicit variants:

- `wrapped-classic`: finite size in metres, deterministic seed-based terrain, toroidal wrap on both axes, generated on demand rather than stored as a baked full map
- `infinite-vector`: infinite authored/runtime world, flat authored source objects, signed lazy chunk generation, and a dedicated editor with full polygon booleans

The implementation plan should compare the earlier “bounded vector runtime” idea, but recommend against it as the first delivery target. Treat bounded vector maps as a later export/slicing mode from `infinite-vector`, not as the primary runtime architecture.

## Public Model And API Changes

Use descriptive public names, not “Type A / Type B”.

Introduce a discriminated shared model roughly like:

```ts
type MapKind = 'wrapped-classic' | 'infinite-vector';

type MapExtent =
  | {
      kind: 'finite';
      widthMeters: number;
      heightMeters: number;
      wrapX: true;
      wrapZ: true;
    }
  | { kind: 'infinite' };

type MapResolution = {
  metersPerTile: number;
  chunkSizeTiles: number;
};

type MapMetadata = {
  id: string;
  name: string | null;
  kind: MapKind;
  extent: MapExtent;
  resolution: MapResolution;
  createdAt: string;
  updatedAt: string;
};
```

Key contract changes:

- `maps.create`, `maps.find`, `maps.list`, and `maps.update` become variant-aware and stop assuming every map has `widthTiles` and `heightTiles`
- `maps.getChunk` accepts signed `chunkX` and `chunkZ` for both variants — current Zod schemas enforce `.min(0)` on `GetMapChunkInput` and `MapChunkSchema` and must be changed to allow negative values
- `wrapped-classic` create input includes `seed`, `generator` (`'diamond-square' | 'island-clusters'`), and finite size in metres — `generator` is variant-specific and only present on `wrapped-classic`
- `infinite-vector` create input creates an empty infinite world plus default resolution settings — no `generator` field
- `renderUnitsPerTile` is removed from the server model; it is a client rendering concern and stays as a client-side constant
- Add Type B authoring CRUD routes for flat source objects:
  - source polygons: list/create/update/delete
  - point terrain controls: list/create/update/delete
  - derived islands: list/update metadata
  - boolean ops: server-authoritative `applyBoolean`, which creates new polygon objects and retires inputs
  - admin overview: authored-content bounds/clusters for navigation
- Derived island metadata owns island `name` and default owner/faction; live ownership remains match/game state

## Implementation Changes

### 1. Shared runtime model

- Generalize runtime/client/admin code so extent is variant-specific instead of always finite
- Finite maps keep dimensions and toroidal semantics
- Infinite maps remove global camera clamps and global-world minimap assumptions
- Keep one chunk-loading interface, but support signed chunk coordinates and absence of global bounds

### 2. `wrapped-classic` runtime

- Do not persist baked chunks as authoritative storage
- Generate heights/materials deterministically from `seed + canonical wrapped coordinates`
- Canonicalize sample/chunk lookup modulo finite world size so crossing any edge wraps seamlessly
- Use logical signed chunk requests around the camera, but resolve them onto the finite toroidal world internally
- Rewrite chunk generation to produce individual chunks from seed without generating the full heightfield first — the current `buildGeneratedMapChunks` generates the entire heightfield then slices, which is incompatible with on-demand generation. Diamond-square is inherently global, so `wrapped-classic` will likely need a different algorithm (e.g. layered seeded noise) that can produce any chunk independently given only the seed and chunk coordinates
- The `map_chunks` table becomes a cache for `wrapped-classic`, not authoritative storage — the chunk API handler must generate-on-miss rather than only querying stored chunks

### 3. `infinite-vector` persistence and generation

Persist authored data separately from generated terrain cache:

- `map_source_polygons`: flat top-level closed straight-edge polygons in world metres, procedural params, active/retired status, bbox
- `map_control_points`: flat top-level point controls with position, type, radius/strength/elevation
- `map_derived_islands`: resolved connected-land records with stable IDs, editable metadata, lineage info for merge/split remapping. ID stability algorithm: on boolean union, the surviving island keeps the ID of the largest-area operand; on split, the largest fragment keeps the original ID and new fragments receive new IDs. Lineage records track parent/child relationships for admin audit
- `map_chunks`: signed chunk coordinates plus cached generated terrain

Generation rules:

- source polygons are construction inputs, not gameplay regions
- boolean ops run on the server, create new source polygons, and retire operands
- resolved land masses define authoritative derived islands
- chunk generation is lazy and signed in all directions
- chunk invalidation is localized: invalidate only chunks whose bounds intersect the dirty region. The dirty region is the modified polygon/control-point bbox expanded by the maximum coastline noise radius (a generation parameter, concrete value TBD during Phase 3) plus the largest control-point influence radius touching that bbox
- compile/cache spatial indexes and resolved geometry per map revision in process memory

### 4. `infinite-vector` editor

Create a dedicated editor route/workspace, separate from the current detail page.

Editor requirements for v1:

- local viewport plus authored-world overview pane
- modes for pan/select/draw polygon/edit vertices/apply booleans/add-edit-delete point controls
- live geometry feedback while editing
- terrain/chunk refresh only after commit/completed operation, not during drag
- inspector panels for source polygon params, point controls, and derived island metadata
- admin overview only; no player-facing infinite-world overview in v1

Tech recommendation after reevaluation:

- use `polyclip-ts` (Martinez polygon clipping algorithm, pure TypeScript, no native deps) for boolean operations — runs server-side and can also run client-side for preview if needed. Evaluate `polygon-clipping` as a fallback if `polyclip-ts` has issues with degenerate cases. WASM Clipper2 is an option if performance becomes a problem but adds build complexity
- keep the editor stack canvas/scene-graph based and compatible with large pan/zoom scenes; prefer the existing admin Konva direction unless reevaluation finds a clear blocker before implementation starts

## Test Plan

- Contract tests for discriminated finite/infinite map metadata and signed chunk coordinates
- `wrapped-classic` tests for toroidal seam equality across all four edges and deterministic regeneration from seed
- `wrapped-classic` gameplay tests proving camera/chunk requests can cross boundaries without visible seams
- `infinite-vector` CRUD tests for polygon lifecycle, retired inputs after boolean ops, and point-control validation
- `infinite-vector` chunk tests for signed negative/positive chunk generation, determinism, and localized invalidation
- Derived-island tests for connected-land resolution, metadata editing, merge/split remapping, and best-effort ID preservation
- Admin editor tests for overview/local-view sync, commit-triggered terrain refresh, and full boolean-operation flows

## Assumptions And Defaults

- Breaking map-contract changes are acceptable — existing map data can be dropped and recreated
- Canonical authored coordinates are world metres
- `wrapped-classic` remains parameter-authored, not a full geometry editor
- `infinite-vector` uses procedural polygon params plus point controls only; ridges/curves are deferred
- True infinite runtime is the primary Type B target; bounded vector runtime is deferred as a later export/slice mode
- Absolute world coordinates are acceptable for now; floating-origin work is explicitly deferred
- `island-clusters` generator is retained as a `wrapped-classic` generator option alongside `diamond-square` — both must be rewritten for per-chunk on-demand generation
- `renderUnitsPerTile` is a client-side rendering constant, not part of the server map model
- Static entities (see `docs/static-entities-plan.md`) must use signed world-metre coordinates compatible with both map variants; derived-island association for static entities is deferred but the coordinate system must not block it
- Single-admin editing is the v1 concurrency model for `infinite-vector`; optimistic locking via a map revision counter on write operations is sufficient. Multi-user concurrent editing is deferred

## Phased Roadmap

### Phase 0: Contract Reset

Status: Complete

Goal: replace the finite-only shared map model with a typed finite/infinite model.

- Add `kind`, `extent`, and `resolution` to shared map contracts
- Remove hard assumptions that every map has `widthTiles` and `heightTiles`
- Remove `renderUnitsPerTile` from server-side `MapMetadata` and `MapResolution`; keep it as a client constant
- Change `chunkX`/`chunkZ` Zod schemas from `.min(0)` to unrestricted `.int()` in `GetMapChunkInput`, `MapChunkSchema`, and `MapChunkBinarySchema`
- Make `generator` variant-specific: present on `wrapped-classic` create input, absent on `infinite-vector`
- Keep old generators working behind adapters only long enough to complete migration

Exit criteria:

- API, admin, and client compile against the new discriminated map model
- Existing finite maps still list and load through compatibility code
- Contract tests cover both finite and infinite metadata shapes

### Phase 1: Shared Runtime Generalization

Status: Complete

Goal: make client and admin runtime code stop depending on global finite bounds.

- Refactor chunk lookup, viewport math, and map helpers around variant-aware extents
- Split finite-only behavior such as clamped camera/minimap math from shared terrain interfaces
- Refactor admin viewport hook (`use-map-viewport.ts`) to remove finite-bounds clamping for infinite maps — replace with authored-content-cluster navigation for `infinite-vector`
- Introduce signed chunk request paths end to end

Exit criteria:

- Finite maps still render correctly
- Runtime code can request negative chunk coordinates without type or routing failures
- No shared helper assumes `widthTiles`/`heightTiles` exist unconditionally

### Phase 2: `wrapped-classic`

Status: Complete

Goal: deliver the Zarch-like wrapped world as the first complete new map variant.

- Add `wrapped-classic` map creation and metadata handling
- Implement deterministic on-demand chunk generation from seed
- Add toroidal sample and chunk canonicalization on both axes
- Update gameplay camera, chunk prefetch, and minimap logic for wrap semantics

Exit criteria:

- Crossing any edge wraps seamlessly in gameplay
- Border chunk seams are byte-identical under toroidal lookup
- No baked chunk persistence is required for authoritative terrain

### Phase 3: `infinite-vector` Backend

Status: Complete

Goal: stand up the infinite authored/runtime world model without the editor yet.

- Add authored-object persistence for source polygons and point controls
- Add derived-island persistence and remapping rules (largest-area-wins ID stability)
- Implement signed lazy chunk generation and cache invalidation by dirty bounds
- Target chunk generation latency under 50ms per chunk; if exceeded, add background pre-generation of chunks around the viewport
- Add server-authoritative boolean operations (using `polyclip-ts`) and object retirement
- Add map revision counter for optimistic locking on write operations
- Add admin overview data endpoints for authored-content navigation

Exit criteria:

- The API can create, edit, and resolve an infinite-vector world without client-only logic
- Signed chunks generate correctly in positive and negative space
- Boolean ops return canonical new polygons and retire operands

### Phase 4: `infinite-vector` Editor

Status: Complete

Goal: ship a usable authoring workspace for polygons, booleans, controls, and derived-island metadata.

- Add a dedicated editor route in admin at `/maps/:id/editor` (new route in `apps/admin/src/router.tsx`)
- Implement local viewport plus overview navigation
- Add polygon draw/select/edit/delete flows
- Add point-control placement and editing
- Add boolean operation UX backed by server-authoritative execution
- Add derived-island metadata editing for names and default owner/faction

Exit criteria:

- A new infinite-vector world can be authored end to end from the admin UI
- Geometry updates are live during editing
- Terrain refresh occurs after commit and reflects the saved state

### Phase 5: Cleanup And Deferred Paths

Status: Complete

Goal: remove transition scaffolding and document deferred work clearly.

- Remove deprecated shared helpers and stale compatibility framing from the package surfaces
- Standardize runtime callers on explicit `isFiniteMap(map)` checks and direct `map.extent` access
- Rewrite stale architecture and planning docs so the discriminated reset model is the only current guidance
- Capture the deferred branch explicitly as follow-up work instead of leaving it implicit in old notes

Exit criteria:

- No core runtime path depends on deprecated finite-only contracts
- Deferred items are explicitly captured as follow-up work, not hidden in the main path

Deferred backlog after Phase 5:

- bounded-vector export or slice mode from `infinite-vector`
- floating-origin evaluation after larger-world runtime usage
- player-facing infinite-world overview once gameplay requirements justify it

## Library Dependencies

- `polyclip-ts`: polygon boolean operations (union, difference, intersection, xor) — pure TypeScript, no native deps. Used server-side in Phase 3 and potentially client-side for editor preview in Phase 4
- Fallback: `polygon-clipping` if `polyclip-ts` has issues with degenerate edge cases
- Escalation path: WASM build of Clipper2 if performance is insufficient

## Subsystem Checklist

### Shared contracts

- Define `MapKind`, `MapExtent`, and `MapResolution` (without `renderUnitsPerTile`)
- Update all map routes to be variant-aware
- Change `chunkX`/`chunkZ` Zod schemas from `.min(0)` to unrestricted `.int()` across `GetMapChunkInput`, `MapChunkSchema`, and related schemas
- Make `generator` variant-specific on create input (present for `wrapped-classic`, absent for `infinite-vector`)
- Add authoring and derived-island routes for `infinite-vector`

### API and persistence

- Migrate map storage for typed finite/infinite metadata
- Add tables for source polygons, point controls, and derived islands
- Add signed chunk cache support
- Implement server-authoritative boolean operations using `polyclip-ts`
- Implement localized invalidation and revision/cache bookkeeping
- Add map revision counter for optimistic locking

### Admin app

- Update list/detail screens for typed map metadata
- Refactor viewport hook to support both finite-clamped and unbounded navigation
- Add dedicated infinite-vector editor route at `/maps/:id/editor`
- Add overview plus local viewport navigation
- Add polygon editing, boolean operations, point controls, and derived-island inspector flows

### Gameplay client

- Generalize terrain interfaces away from unconditional finite extents
- Add toroidal runtime behavior for `wrapped-classic`
- Separate finite minimap logic from infinite-map navigation assumptions
- Ensure signed chunk loading works cleanly

### Testing

- Add contract coverage for both map variants
- Add toroidal seam and wrap traversal tests
- Add signed chunk generation and invalidation tests
- Add boolean operation and derived-island identity tests
- Add editor flow tests for authoring critical paths
