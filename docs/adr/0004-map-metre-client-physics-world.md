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

## Consequences

Vehicle tuning and asset collision dimensions are independent of render scale.
Collider replacement is explicit and removable as chunks stream or editor
drafts change. Shells collide with terrain, water surfaces, authored obstacles,
and vegetation; the Tank additionally collides with shoreline and temporary
stream boundaries.
