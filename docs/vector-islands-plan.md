# Vector Island Map System - Implementation Outline

## Context

The current map system stores every generated chunk up front in SQLite. That works for bitmap-first generators, but it wastes storage on ocean and does not support named islands, precise boundaries, or editor-driven terrain authoring.

This plan defines a minimal, implementation-ready v1 for vector-authored islands while keeping the existing chunk response shape used by the admin viewer and gameplay client.

## 1. Decisions For v1

- Add a new generator type: `vector-islands`.
- Keep `maps` as the top-level resource. Do not introduce a separate `worlds` resource.
- Keep `maps.getChunk` output unchanged. Clients continue to request `MapChunk` the same way they do today.
- Add separate map-definition routes for vector authoring instead of overloading `maps.find` or `maps.update`.
- Generate vector chunks lazily on first read, then persist them in `map_chunks`.
- Version cached chunks with `definition_revision` so stale chunks are detectable after edits.
- Invalidate the entire cached chunk set for a vector map on any definition edit in v1. Partial invalidation is deferred.
- Ship a narrow terrain model first:
  - single outer polygon per island
  - no polygon holes
  - no region hierarchy
  - no erosion pass
  - no CDT ridge overlay in v1

## 2. Public API And Contracts

### Map metadata

Extend shared `MapMetadata` with:

```ts
type MapMetadata = {
  id: string;
  name: string | null;
  generator: 'diamond-square' | 'island-clusters' | 'vector-islands';
  seed: string;
  widthTiles: number;
  heightTiles: number;
  widthMeters: number;
  heightMeters: number;
  metersPerTile: number;
  renderUnitsPerTile: number;
  chunkSizeTiles: number;
  createdAt: string;
  updatedAt: string;
  definitionRevision?: number;
  hasVectorDefinition?: boolean;
};
```

`maps.list` and `maps.find` continue to return metadata only.

### Vector definition document

Add a new shared schema for the full vector-authored map definition:

```ts
type VectorMapDefinition = {
  ocean: {
    waterLevel: number;
    deepOceanDepth: number;
  };
  islands: Array<{
    id: string;
    name: string;
    boundary: Array<{ x: number; z: number }>;
    controlPoints: Array<{
      x: number;
      z: number;
      elevation: number;
      kind: 'peak' | 'valley' | 'plain';
      influenceMeters?: number;
    }>;
    coastline: {
      roughness: number;
      noiseScale: number;
      maxDisplacementMeters: number;
    };
  }>;
};
```

Validation rules:

- `boundary` is closed implicitly. The API accepts unique vertices only and closes the loop on read/use.
- All coordinates are in world metres, not tile indices.
- Every island boundary must stay within map bounds.
- Every control point must fall inside its island boundary.
- `waterLevel` defaults to `-10` to match current terrain behavior.

### New routes

Add:

- `maps.getDefinition({ id }) -> { mapId, definitionRevision, definition }`
- `maps.updateDefinition({ id, expectedRevision, definition }) -> MapMetadata`

Behavior:

- `maps.create` continues to create map metadata. When `generator === 'vector-islands'`, it also requires an initial `definition`.
- `maps.update` remains metadata-only and continues to support name changes.
- `maps.updateDefinition` replaces the full vector document in one write. There is no per-island CRUD in v1.
- `expectedRevision` is required for optimistic concurrency. Reject mismatches with `CONFLICT`.

## 3. Persistence Model

### Tables

Keep existing `maps` and `map_chunks` tables, and add a new `map_definitions` table.

`maps`

- existing columns
- `definition_revision INTEGER NOT NULL DEFAULT 0`

`map_definitions`

- `map_id TEXT PRIMARY KEY`
- `definition_json TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `FOREIGN KEY (map_id) REFERENCES maps(id) ON DELETE CASCADE`

`map_chunks`

- existing chunk columns
- `definition_revision INTEGER NOT NULL DEFAULT 0`

### Chunk cache semantics

- Legacy generators keep their current eager-generation behavior until the lazy path is proven.
- `vector-islands` maps use lazy generation only.
- A cached chunk is reusable only when `chunk.definition_revision === map.definition_revision`.
- On `maps.updateDefinition`, increment `maps.definition_revision` and delete all cached chunks for that map in the same transaction.

This keeps v1 invalidation simple and correct. Fine-grained chunk invalidation is a later optimization.

## 4. Generation Architecture

### Compile step

Vector chunk generation must not solve each island from scratch on every chunk request. The server should compile the map definition into process-local artifacts keyed by `(mapId, definitionRevision)`.

Compiled artifact contents:

- island bounding boxes
- island spatial index for quick candidate lookup
- noisy coastline polygons derived from seed plus coastline params
- per-island solve grid and bilinear sampler for base elevation

Compiled artifacts are held in memory only. They are rebuilt after process restart on first vector chunk request.

### Base terrain model

Use a Poisson/Laplace solve for the base island surface.

Per island:

1. Expand the island bounding box by `maxDisplacementMeters`.
2. Rasterize the displaced visual coastline into a solve mask.
3. Create a solve grid over that box at roughly one solve cell per four map tiles on the longest axis, clamped to `129..513` samples.
4. Set boundary and outside-mask cells to `waterLevel`.
5. Pin control-point cells to `waterLevel + elevation`.
6. Run Gauss-Seidel with SOR until the max delta is below a fixed epsilon or a max iteration count is reached.
7. Sample the solved grid with bilinear interpolation during chunk generation.

### Coastline model

Maintain two coastlines:

- gameplay boundary: clean polygon used for island membership and editor manipulation
- visual coastline: displaced polygon used for land/water masking and terrain generation

Displacement rules:

- parameterize the closed path by arc length
- sample seamless fBm noise in circularized 2D noise space
- displace along the outward normal
- clamp displacement to `maxDisplacementMeters`

### Detail noise

After sampling the base solve:

- add 4 octaves of deterministic fBm noise
- scale noise amplitude by normalized base elevation so beaches stay quieter than mountain interiors
- taper detail down near the visual coastline so coast transitions remain readable

### Chunk generation flow

For `maps.getChunk(mapId, chunkX, chunkZ)` on a `vector-islands` map:

1. Read map metadata and definition revision.
2. Read the chunk row.
3. If the chunk exists for the current revision, return it.
4. Otherwise acquire a process-local single-flight lock for `(mapId, definitionRevision, chunkX, chunkZ)`.
5. Recheck the row after the lock is acquired.
6. Compile the vector definition if the compiled artifact is not already cached.
7. Generate the chunk's `33 x 33` corner-sample grid from world coordinates.
8. Persist the chunk with the current `definition_revision` using an upsert.
9. Return the stored chunk payload.

If generation fails, return an API error and do not write a partial chunk row.

## 5. Runtime And Client Impact

- `MapChunk` stays unchanged, so [apps/client/src/screens/zarch/use-server-map-terrain.ts](/Users/alex/work/carrier/apps/client/src/screens/zarch/use-server-map-terrain.ts) and the admin map viewer continue to read chunks the same way.
- First access to a vector chunk is slower than current reads because it may trigger compile plus generation work.
- The API route behavior changes even though the response shape does not. The repository must now support read-through cache population and revision-aware staleness checks.
- The admin detail page needs a vector-definition editor flow in addition to metadata editing. It should fetch and save the full definition document through the new routes.

## 6. Capacity And Performance

- A normal `33 x 33` chunk contains `1,089` float32 samples.
- Raw height payload per chunk is `1,089 * 4 = 4,356` bytes, about `4.25 KiB` before SQLite overhead.
- `200 x 200` chunks means `40,000` chunks total.
- Raw chunk storage for that full cache is about `174 MB` before indexes and row overhead.

Implications:

- lazy generation still reduces storage when players only visit a small fraction of the world
- persistent caching is still worthwhile
- the plan should not rely on tiny-cache assumptions

Performance targets:

- cached chunk read should remain dominated by SQLite read and decode costs
- uncached vector chunk generation should target under `10 ms` for a warm compiled artifact
- first chunk for a map revision may be slower because it includes compile time

## 7. Tests And Verification

### Contract and repository tests

- creating a `vector-islands` map stores metadata plus initial definition
- `maps.getDefinition` returns the exact saved document and revision
- `maps.updateDefinition` increments `definition_revision`
- stale chunk rows are not reused across revisions
- concurrent requests for the same uncached chunk produce one stored row

### Terrain correctness tests

- simple square island with one peak keeps boundary samples at `waterLevel`
- control-point elevations are honored at pinned cells
- adjacent chunks share identical border samples
- repeated generation for the same seed, definition, and revision is byte-identical
- coast displacement is deterministic for a given seed

### Integration checks

- admin map viewer can open and render a vector map through existing chunk APIs
- gameplay client can traverse a vector map without seam artifacts
- process restart rebuilds compiled artifacts and still returns the same chunk bytes for the same revision

## 8. Rollout Plan

### Phase 1 - Cache infrastructure

- add `definition_revision` fields and repository support for revision-aware chunk reads
- keep legacy generators on the existing eager path
- add single-flight chunk generation utilities

### Phase 2 - Vector contracts and persistence

- add `vector-islands` generator to shared contracts
- add `map_definitions` storage
- add `maps.getDefinition` and `maps.updateDefinition`
- allow `maps.create` to accept an initial vector definition

### Phase 3 - Vector terrain generation

- implement compile cache
- implement coastline displacement
- implement Poisson base solve and chunk sampling
- enable lazy generation for `vector-islands`

### Phase 4 - Admin authoring

- add vector-definition create/edit UI
- add validation feedback for out-of-bounds polygons and invalid control points
- keep metadata editing and chunk preview intact

### Phase 5 - Follow-up enhancements

- partial chunk invalidation for localized edits
- region hierarchy and named subregions
- holes, lakes, rivers, and ridge lines
- optional persistence of compiled solve artifacts

## Appendix A - Research Notes

These notes are intentionally non-normative. They capture useful research and alternatives that informed the v1 plan, but they are not all in scope for the first implementation.

### Interpolation options considered

#### Recommended base approach: Poisson/Laplace solve

- Good fit for closed boundary plus sparse interior elevation constraints
- Handles coastal falloff naturally through boundary conditions
- Avoids overshoot, so extrema remain at constrained values
- Produces a smooth harmonic surface that can be sampled cheaply after solving
- Requires discretizing each island into a solve grid rather than evaluating purely on demand

#### Strong alternative: RBF with thin-plate spline kernel

- Evaluates directly per sample without a precomputed grid
- Can use densely sampled boundary points at water level plus interior control points
- Solves a single `N x N` system up front, then evaluates in `O(N)` per sample
- More flexible for sparse authoring, but can overshoot and may need clamping
- Still worth reconsidering if the Poisson compile step proves too heavy for editing workflows

#### Other methods considered

| Method | Per-sample cost | Smoothness | Overshoot risk | Ridge support | Boundary handling |
| --- | --- | --- | --- | --- | --- |
| Poisson | `O(1)` lookup after solve | Smooth harmonic surface | No | Limited in v1 | Native |
| RBF (TPS) | `O(N)` | `C2` smooth | Yes | Indirect | Manual boundary sampling |
| Delaunay + CDT | `O(log N)` lookup | Faceted | No | Strong | Natural with constrained edges |
| IDW | `O(N)` | Weak | No | Poor | Manual |
| MBA B-spline | `O(1)` | `C2` smooth | Slight | Poor | Better for rectangular domains |

### Composite terrain approach considered

The broader research direction was:

1. Poisson solver for the large-scale base shape
2. CDT overlay for sharper ridge and valley structures
3. fBm noise for surface detail
4. Coastal displacement noise for shoreline irregularity

The v1 implementation keeps only items 1, 3, and 4. CDT-based ridge overlays are deferred.

### Coastline research

The earlier research recommendation was to maintain two coastlines:

- gameplay boundary: simple authoritative polygon for point-in-polygon queries
- visual coastline: displaced polygon used for terrain generation and rendering

The displacement technique uses arc-length parameterization around the closed path and samples seamless noise in circularized 2D space:

```txt
noise_x = cos(2 * PI * t / path_length) * noise_scale
noise_y = sin(2 * PI * t / path_length) * noise_scale
displacement = fbm2D(noise_x, noise_y) * amplitude
```

That avoids a visible seam where the polygon loop closes.

Roughness controls discussed during research:

- persistence around `0.3..0.7`
- `3..6` octaves
- low-frequency modulation to vary coast character across one island
- per-island roughness values for different island styles

### Erosion notes

Full erosion simulation was considered too expensive for on-demand chunk generation. The lower-cost alternatives discussed were:

- classify coastal areas by slope and derive beaches versus cliffs from terrain gradients
- use noise-based material selection near coasts
- optionally run a lightweight one-time erosion pass as an offline or editor-time enhancement later

### Library options discussed

- Poisson solver: custom implementation is still the default recommendation
- RBF interpolation: [thibauts/rbf](https://github.com/thibauts/rbf)
- Delaunay triangulation: [Delaunator](https://github.com/mapbox/delaunator)
- constrained triangulation: [cdt2d](https://www.npmjs.com/package/cdt2d)
- simplex noise: [simplex-noise](https://www.npmjs.com/package/simplex-noise)
- point-in-polygon: trivial ray-casting implementation is likely sufficient for v1

## Appendix B - Admin Editor Expansion Notes

The current admin viewer is a good base for an editor:

- [apps/admin/src/components/map-viewer/map-viewer.tsx](/Users/alex/work/carrier/apps/admin/src/components/map-viewer/map-viewer.tsx) already owns container sizing, zoom controls, and chunk loading
- [apps/admin/src/components/map-viewer/map-canvas.tsx](/Users/alex/work/carrier/apps/admin/src/components/map-viewer/map-canvas.tsx) already renders chunk bitmaps into a single canvas
- [apps/admin/src/hooks/use-map-viewport.ts](/Users/alex/work/carrier/apps/admin/src/hooks/use-map-viewport.ts) already provides pan and pointer-relative zoom behavior

What it lacks is a vector-aware overlay, hit testing, and editing modes.

### Recommended editor architecture

Keep the existing raster terrain rendering path as the background layer and add an editor overlay above it.

Preferred composition:

1. Base terrain canvas: keep the current chunk-bitmap rendering for map context
2. Overlay layer: add either an SVG overlay or a second transparent canvas for editable geometry
3. Right-side inspector: selected island, polygon vertex list, control-point form fields, coastline parameters
4. Top toolbar: mode switching such as pan, select, draw island, edit vertices, add control point, delete point, preview terrain

This is lower risk than replacing the viewer outright, because chunk rendering can stay exactly as it is.

### Rendering model for editing

The editor should render several visual layers at once:

- terrain bitmap from generated chunks
- gameplay boundary polygon for each island
- visual coastline preview generated from the boundary plus coastline noise params
- control points with different colors or glyphs by type
- optional influence-radius circles for selected control points
- hover and selection states for islands, segments, and points
- optional solve-grid or invalidation debug overlays in a developer mode

At low zoom:

- show only island fills, outlines, and selected control points
- hide fine vertex handles

At medium and high zoom:

- show per-vertex handles
- show insert-point affordances on edges
- show control-point influence radii for the active island only

### Coordinate system changes needed

The current viewport is tile-based. The vector plan uses world-metre coordinates. The editor should standardize on world metres internally and convert to screen space at render time.

Recommended helpers:

- `worldMetersToScreenPx(x, z, viewport, map)`
- `screenPxToWorldMeters(x, y, viewport, map)`
- `tileToWorldMeters(tile, metersPerTile)`
- `worldMetersToTile(world, metersPerTile)`

The viewport hook can still keep the same shape, but its center values should become world-space values once vector editing is added.

### Editing modes

Recommended initial mode set:

- pan: current viewer interaction only
- select: click island, polygon edge, or control point
- draw-island: place polygon vertices, close loop explicitly
- edit-boundary: drag vertices, insert vertex on edge, delete vertex
- add-control-point: place a peak, valley, or plain point inside the selected island
- edit-control-point: drag position, adjust elevation and influence in the inspector
- preview: show regenerated coastline and terrain preview without edit handles

Important interaction rules:

- keep panning available via space-drag or middle mouse even in edit modes
- require explicit selection before destructive actions like vertex delete
- debounce expensive preview recomputations while dragging
- do optimistic local rendering first, then persist definition changes through the API

### Terrain preview behavior

The editor should not wait for persisted chunk regeneration after every drag if that makes the interaction sluggish.

Recommended preview strategy:

- local overlay preview while editing: redraw gameplay boundary, coastline preview, and control points immediately
- lightweight local terrain preview: optionally render only the selected island's preview on the overlay
- persisted terrain preview: trigger `updateDefinition`, bump revision, and refetch chunks on pointer-up or explicit save

That gives fast editing feedback without forcing full server regeneration on every pointer move.

### Suggested component split

- `MapEditorViewport`: wraps the existing viewport state plus screen/world conversions
- `MapTerrainLayer`: current chunk-backed raster drawing
- `MapVectorOverlay`: polygons, handles, hover states, selections
- `MapEditorToolbar`: mode switching and preview toggles
- `MapEditorInspector`: form-driven editing for selected objects
- `useMapEditorState`: selected island, hovered handle, draft edits, dirty state
- `useVectorDefinition`: fetch/save for `maps.getDefinition` and `maps.updateDefinition`

### Library options for vector editing

#### Best fit if keeping the current custom renderer: D3 utilities

Useful modules:

- `d3-drag` for pointer drag behavior
- `d3-polygon` for geometry helpers such as point containment, centroid, and perimeter calculations

Why it fits:

- lightweight and composable
- works with SVG, HTML, or canvas
- lets the existing viewer stay mostly custom

Tradeoff:

- no ready-made scene graph or editor widgets, so handles and hit testing still need app code

#### Best fit if willing to move the overlay to a richer canvas scene graph: `react-konva`

Why it fits:

- React-friendly canvas scene graph
- built-in drag events
- good support for polygons, anchor handles, and zoomable stages
- strong example coverage for pointer-relative zoom and editable anchor points

Tradeoff:

- larger migration from the current hand-drawn canvas
- best if the overlay or the whole viewer moves into Konva, not as a tiny helper

#### Good vector-graphics toolkit if we want path editing primitives: Paper.js

Why it helps:

- strong path and segment model
- built-in hit testing
- useful if coastlines or future curved paths become more sophisticated

Tradeoff:

- more opinionated scene/document model
- less natural fit for the current React component structure than D3 or Konva

#### Less preferred for this use case: Fabric.js

Why it was considered:

- supports custom controls and polygon editing
- has examples for editable polygon points

Why it is less attractive here:

- optimized more for general object-canvas editing than map-specific geometry workflows
- likely heavier than needed for polygon and control-point editing

### Recommendation

For v1 editor work:

- keep the current terrain canvas
- add an SVG overlay for vectors and handles
- use lightweight geometry and drag helpers rather than adopting a full editor framework immediately

Best practical choices:

- use custom overlay logic plus `d3-drag` and `d3-polygon` if minimal change is the priority
- use `react-konva` only if the team wants a more ambitious rewrite of the overlay interaction layer
