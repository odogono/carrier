# ADR 0004: Map-Metre Client Physics World

## Status

Accepted.

## Context

The Three.js scene horizontally projects map metres into render units. Using
those render units for physics would make handling depend on map resolution and
would complicate wrapped-map seams and authored collider dimensions.

## Decision

Each selected map owns one persistent Crashcat world whose X, Y, and Z values
are canonical map metres. Streamed terrain, shoreline, water surface, authored
OBBs, vegetation cylinders, temporary unloaded-region boundaries, the Tank, and
Shells are registered by stable domain owner IDs.

The bridge incrementally replaces dirty collider owners and flushes current
terrain before Tank simulation. Wrapped finite maps keep the Tank in an
unwrapped local frame and materialize translated nearby wrap images; a canonical
coordinate is chosen only when leaving Tank Mode.

The host owns a 60 Hz fixed-step accumulator. Each rendered frame contributes at
most 0.1 seconds, performs at most five physics steps, and drops any remaining
backlog after that cap. Collider reconciliation runs before those steps. Each
step collects immutable Shell contact events from Crashcat contact callbacks and
shape sweeps, selects the nearest contact along the Shell's travel with a stable
owner tie-break, and removes impacted bodies only after `updateWorld` returns.
Fixed simulated time, rather than render time, advances Shell lifetime.

One static-collider bridge owns terrain, shoreline, water-surface, streamed-edge,
vegetation, and authored-obstacle bodies. Its desired owner set is content-based:
terrain samples, loaded and water topology, vegetation, wrap images, and complete
authored OBB dimensions all invalidate it. Owners absent from the next set are
removed, including wet-to-dry transitions. Unloaded edges, including internal
holes, are closed with vertical barriers from -20 to 40 map metres.

All physics axes, heights, offsets, and collider dimensions are map metres.
`24 / metersPerTile` is applied only when crossing the horizontal Three.js render
boundary; authored OBB vertical centres use canonical Effective Height directly.

## Consequences

Vehicle tuning and asset collision dimensions are independent of render scale.
Collider replacement is explicit and removable as chunks stream or editor
drafts change. Shells collide with terrain, water surfaces, authored obstacles,
and vegetation, producing exactly one Shell Impact before post-step removal;
the Tank additionally collides with shoreline and temporary stream boundaries.
Leaving Tank Mode or changing maps clears every static owner and removes the
Tank and Shell bodies without producing impacts. The empty world remains alive
for the selected map session; changing maps also releases that persistent world
reference.
