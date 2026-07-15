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

## Gameplay Modes

A Gameplay Mode is one of three mutually exclusive local client activities.
Navigation Mode moves the map focus without a player body. Lander Mode flies the
existing thrust-driven craft. Tank Mode drives the local physics-driven Tank.
Mode changes pass through Navigation so mode-specific bodies and projectiles are
cleaned up before the next mode begins.

A Shell is a short-lived ballistic projectile fired by the Tank. It uses
continuous collision detection and is removed on its first impact or lifetime
expiry.

A Shell Impact is a Shell's first accepted physical contact. It produces local
land or water feedback and ends the Shell without implying damage or
destruction.

Tank Suspension is the Tank's compliant terrain-contact behavior. It supports
the hull independently at four corners, allowing limited vertical travel,
pitch, and roll while the Tank remains upright.

## Gameplay Obstacles

A Gameplay Obstacle blocks a locally simulated Tank or Shell. An Authored
Obstacle is an active, validly grounded Static Entity whose immutable asset
version has Obstacle Mode `solid`. Obstacle Mode `none` makes the asset
non-blocking. Legacy exported manifests that omit Obstacle Mode resolve to
`solid` without rewriting the immutable snapshot.

A Vegetation Obstacle is the deterministic cylinder collider derived from the
same procedural tree rule used for rendering. Terrain, shoreline, authored, and
vegetation colliders all use canonical map metres in the client physics world.
