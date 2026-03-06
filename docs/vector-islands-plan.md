# Vector Island Map System — Research & Design

## Context

The current map system generates a full heightfield bitmap split into 32x32 tile chunks, all stored in SQLite. Every tile exists in storage — including ~62% ocean tiles. The goal is to explore representing islands as vector closed paths with height control points, enabling named regions, precise boundaries, and reduced storage.

---

## 1. Height Interpolation from Sparse Control Points

### Recommended: Poisson/Laplace Solver

The best fit for "closed boundary + interior control points" is solving the Laplace equation on a grid:
- Set height=0 at all points on/outside the island boundary (Dirichlet boundary condition)
- Set elevation constraints at grid cells nearest to control points (peaks, valleys)
- Solve iteratively (Gauss-Seidel with SOR, or multigrid) — produces the smoothest possible surface
- **No overshoot guaranteed** — max/min values only occur at constraints
- Coastal falloff to water level happens automatically via boundary conditions
- Cost: O(grid cells) to solve once, then O(1) per-sample lookup via bilinear interpolation
- Must discretize to a grid per island (256x256 or 512x512 is sufficient), not evaluable per-sample on the fly

### Strong alternative: RBF with Thin-Plate Spline kernel

- Evaluable per-sample on demand — no grid needed
- Sample the boundary polygon densely at height=0, add interior control points
- Solve NxN linear system once (N = total control points), then evaluate at O(N) per sample
- Can overshoot (produce negative heights in some configurations) — needs clamping
- JS library: [thibauts/rbf](https://github.com/thibauts/rbf)

### Other methods considered

| Method | Per-Sample Cost | Smooth? | Overshoot? | Ridge Support | Boundary Handling |
|--------|----------------|---------|------------|---------------|-------------------|
| **Poisson** | O(1) lookup | Yes (harmonic) | No | Good w/ gradient constraints | Excellent (native) |
| **RBF (TPS)** | O(N) | Yes (C2) | Yes | Needs dense points | Manual (boundary sampling) |
| **Delaunay+CDT** | O(log N) | No (faceted) | No | Excellent (constrained edges) | Natural with boundary edges |
| **IDW** | O(N) | No (flat at points) | No | Poor | Manual |
| **MBA B-Spline** | O(1) | Yes (C2) | Slight | Poor | Rectangular domain only |

**All methods need fractal noise layers on top** — the base interpolation provides only large-scale shape. Add 4-6 octaves of simplex noise scaled by base elevation for natural detail.

### Recommended composite approach

1. **Poisson solver** for the smooth base shape (handles boundary + peaks naturally)
2. **CDT overlay** for structural ridges/valleys (constrained edges create sharp features)
3. **fBm noise** for surface detail, amplitude scaled by elevation and distance-from-coast
4. **Coastal noise displacement** for natural shoreline irregularity (see section 2)

---

## 2. Coastline Generation

### The key architectural insight: two coastlines

- **Gameplay boundary**: The clean vector polygon — used for "which island am I on?" point-in-polygon queries. Fast, simple, authoritative.
- **Visual coastline**: The noisy displaced version — used for heightmap generation and rendering. Can be arbitrarily complex without affecting gameplay performance.

Maximum noise amplitude defines the maximum visual deviation from the gameplay boundary.

### Noise displacement technique

Walk along the closed polygon vertices, displace each along its outward normal by a noise value. For seamless closure, map the 1D path parameter onto a circle in 2D noise space:

```
noise_x = cos(2 * PI * t / path_length) * noise_scale
noise_y = sin(2 * PI * t / path_length) * noise_scale
displacement = fbm2D(noise_x, noise_y) * amplitude
```

This guarantees continuity at the path closure point.

### Controlling roughness

- **Persistence** (0.3-0.7): Higher = rougher coastline. Real coastlines have fractal dimension ~1.1-1.3.
- **Octaves** (3-6): More octaves = finer detail.
- **Spatial modulation**: Multiply noise amplitude by a second low-frequency noise to create varied coast character (smooth bays vs. jagged headlands).
- **Per-island parameters**: Each island definition can specify its own roughness, allowing rocky volcanic islands vs. smooth sandy atolls.

### Erosion

Full erosion simulation is too expensive for on-demand generation. Instead:
- Classify coastal tiles by slope angle (beach < 15deg, cliff > 60deg)
- Use noise-based material selection at the coast
- Optionally run a lightweight erosion pass once during initial generation

---

## 3. On-Demand Chunk Generation

### Determinism is guaranteed

Height at any point depends only on world-space coordinates + fixed vector data + seed. No chunk reads another chunk's output. Same inputs always produce same outputs.

### Chunk border seamlessness

If the height function is purely `f(worldX, worldZ, vectors, seed)`, borders are automatically seamless — two independently generated chunks sharing an edge produce identical values at shared sample points. Your existing 33x33 samples for 32x32 tiles (shared border samples) already handles this.

For neighborhood-dependent operations (blur, erosion), use padding: generate extra samples beyond chunk boundaries equal to the operation's effect radius.

### Performance estimate

Per chunk (33x33 = 1,089 samples):
- Point-in-polygon test: ~50-200ns per sample
- Distance to polygon edge: ~200-500ns per sample
- fBm noise (4 octaves): ~100-400ns per sample
- **Total: ~1-2ms per chunk**

This is well within real-time budgets (16.6ms frame at 60fps). Burst generation (many chunks at once) can use Web Workers for parallelism.

### Recommended caching strategy: Generate Once, Cache Persistently

This matches your current architecture with a small change:

**Current**: Generate all chunks at map creation time → store in SQLite → serve via API
**Proposed**: Generate each chunk on first API request if not stored → persist to SQLite → subsequent requests read from SQLite

Benefits:
- No upfront generation delay for large maps
- Only visited areas consume storage
- Client-side code doesn't change at all
- If vector data changes (editor), invalidate affected chunks → regenerate on next request
- Storage is tiny: 33x33 float32 chunk = ~4.3 KB. Even 200x200 chunks (40K tiles x 40K tiles) = ~1.7 MB

The generation trigger moves from `buildGeneratedMapChunks()` to a lazy check inside `MapRepository.getChunk()`.

---

## 4. Data Model Design

### Island definition

```typescript
type IslandDefinition = {
  id: string;
  name: string;
  // Closed polygon boundary (gameplay boundary)
  boundary: Array<{ x: number; z: number }>;
  // Height control points within the boundary
  controlPoints: Array<{
    x: number;
    z: number;
    elevation: number;       // metres above water level
    type: 'peak' | 'saddle' | 'valley' | 'ridge' | 'plain';
    influence?: number;      // optional radius of influence
  }>;
  // Ridge/valley lines as polylines with elevation profiles
  featureLines: Array<{
    type: 'ridge' | 'valley';
    points: Array<{ x: number; z: number; elevation: number }>;
  }>;
  // Coastline generation parameters
  coastline: {
    roughness: number;       // 0-1, fractal persistence
    noiseScale: number;      // base frequency
    maxDisplacement: number; // max deviation from boundary (metres)
  };
  // Arbitrary attributes
  attributes: Record<string, unknown>;
};
```

### Region hierarchy

```typescript
type Region = {
  id: string;
  name: string;
  parentId: string | null;   // island ID or parent region ID
  boundary: Array<{ x: number; z: number }>;  // closed polygon
  attributes: Record<string, unknown>;
};
```

Regions can nest: `World > Island > Mountain Range > Peak`. Point-in-polygon tests walk the hierarchy from most specific to least.

### World definition (replaces current MapMetadata partially)

```typescript
type WorldDefinition = {
  id: string;
  name: string;
  seed: string;
  // World bounds (the ocean area)
  widthMeters: number;
  heightMeters: number;
  metersPerTile: number;
  renderUnitsPerTile: number;
  chunkSizeTiles: number;
  // Island definitions
  islands: IslandDefinition[];
  // Nested regions within islands
  regions: Region[];
  // Ocean parameters
  ocean: {
    waterLevel: number;      // metres (current: -10)
    deepOceanDepth: number;
  };
};
```

### Storage

- `worlds` table: world-level metadata + seed
- `islands` table: island definitions as JSON blobs (boundary, control points, coastline params)
- `regions` table: region hierarchy (id, parent_id, boundary, attributes)
- `map_chunks` table: generated heightmap chunks (same as current, but lazily populated)

### Querying "which island am I on?"

```typescript
function findIsland(worldX: number, worldZ: number, islands: IslandDefinition[]): IslandDefinition | null {
  // Quick bounding-box pre-filter, then point-in-polygon on boundary
  for (const island of islands) {
    if (!inBoundingBox(worldX, worldZ, island.bbox)) continue;
    if (pointInPolygon(worldX, worldZ, island.boundary)) return island;
  }
  return null; // in the ocean
}
```

For many islands, use a spatial index (R-tree or grid) for the bounding-box pre-filter.

---

## 5. Generation Pipeline Summary

```
IslandDefinition (vector data)
  │
  ├─ Boundary polygon ──────────────► Gameplay queries (point-in-polygon)
  │
  ├─ Noisy boundary (displaced) ────► Defines land/water per sample
  │
  ├─ Control points + feature lines ► Poisson solver → base heightmap
  │                                    CDT → ridge/valley structure
  │
  └─ fBm noise layers ─────────────► Surface detail
                                       │
                                       ▼
                              Final height per sample
                                       │
                                       ▼
                              Chunk (33x33 Float32Array)
                                       │
                                       ▼
                              SQLite (persisted on first generate)
                                       │
                                       ▼
                              API → Client (unchanged)
```

---

## 6. Key Libraries

- **Poisson solver**: Custom implementation (~100 lines Gauss-Seidel iterator)
- **RBF interpolation**: [thibauts/rbf](https://github.com/thibauts/rbf)
- **Delaunay/CDT**: [Delaunator](https://github.com/mapbox/delaunator), [cdt2d](https://www.npmjs.com/package/cdt2d)
- **Simplex noise**: [simplex-noise](https://www.npmjs.com/package/simplex-noise)
- **Point-in-polygon**: trivial ray-casting implementation

---

## 7. Verification Plan

1. **Unit tests**: Generate height from a simple island (square boundary, single peak) and verify:
   - Height is 0 at boundary, peak value at peak, smooth gradient between
   - Adjacent chunks produce identical values at shared edges
   - Same seed/vectors always produce identical output
2. **Visual test**: Render generated islands in admin map viewer, compare against current heightmap output
3. **Performance test**: Measure chunk generation time, verify < 5ms per chunk
4. **Region queries**: Create test islands, verify point-in-polygon correctly identifies island membership
5. **Coastline quality**: Visual inspection of noisy coastline at various roughness settings

---

## 8. Migration Path

Phase 1: Add vector island data model alongside existing system (non-breaking)
Phase 2: Implement height generation from vector islands as new generator type
Phase 3: Add region/naming system using island boundaries
Phase 4: Build island editor in admin UI
Phase 5: Optionally deprecate bitmap-first generators
