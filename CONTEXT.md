# Carrier Domain Context

## Exported Map

An Exported Map is a playable map created from an authored source map at a
specific source revision. It is an immutable snapshot: terrain chunks, derived
islands, static-entity placements, export metadata, and export hashes must not
change after creation.

Map renaming and deletion are lifecycle operations and do not change the
snapshot content. Terrain, tile, authored-geometry, derived-island metadata, and
static-entity placement mutations are content operations and are rejected for
Exported Maps.

The wire-level map kinds still use `finite-vector-slice` and
`wrapped-classic-slice`; those names identify export formats, not mutable slice
editing surfaces.

## Static Entity Export Bounds

An Exported Map copies static-entity placements from a source map into a finite
snapshot. The export's terrain bounds are the requested bounds and are not
expanded to fit static entities.

Static entity chunk reads are overlap-aware: a placement can appear in any chunk touched by its footprint.

Static entity export snapshots are containment-aware: a placement is copied only when its full footprint is contained by the requested export bounds. A footprint that touches an export edge exactly is contained; a footprint that crosses any export edge is omitted. Export placement positions are translated into export-local coordinates after selection.

For Exported Maps, the static-entity export manifest is the authority for
archetype and asset-version metadata used by reads. Later catalog edits,
archives, or deletions must not change exported entity summaries, chunk
membership, runtime asset metadata, manifest hashes, or snapshot content. Legacy
Exported Maps missing required static-entity manifest metadata fail closed for
entity-dependent reads instead of falling back to the live catalog.

## Static Entity Grounding

Static Entity Grounding is the canonical rule for deriving a placement's vertical
position from terrain. All runtimes sample the placement anchor plus the four
yaw-rotated footprint corners, average the five terrain heights, and reject the
placement when any sample is unavailable.

A Footprint is the asset-version rectangle used for terrain contact. Placement
Scale multiplies the footprint width and depth before the five sample points are
derived.

`yOffset` is an entity-local vertical offset. Placement Scale multiplies it
before it is added to the average terrain height.

Effective Height is the canonical map-space height in metres:
`averageTerrainHeightMeters + scaledYOffsetMeters`. Admin diagnostics, gameplay
client grounding, and the Go world use the same Effective Height and validity
rule.

Scene Scale is the gameplay client's horizontal map-to-Three.js projection:
`TILE / metersPerTile`. The client keeps Effective Height in map-space metres
and separately derives `sceneY` for rendering by adding the scaled offset's
scene-space displacement to the averaged terrain Y. Scene Scale does not change
the map-space maximum-height-delta tolerance.
