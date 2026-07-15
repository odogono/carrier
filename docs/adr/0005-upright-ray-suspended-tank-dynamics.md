# ADR 0005: Upright Ray-Suspended Tank Dynamics

## Status

Accepted.

## Context

The first Tank prototype used a dynamic box with pitch and roll locked while
runtime code directly replaced its planar and angular velocities. That proved
the Crashcat integration but could not express suspension travel, terrain
attitude, momentum-preserving impacts, or track-like steering. Physical wheel
bodies would provide richer articulation at substantially greater simulation,
tuning, and runtime-asset complexity.

## Decision

The local Tank remains one dynamic hull with four ray-suspension contacts and a
reduced safety collider. Spring, damping, drive, and lateral-grip forces are
applied at the contacts. Independent left/right drive forces provide
differential steering, while a compliant upright controller permits limited
terrain-following pitch and roll and prevents rollover.

Loaded terrain without contact is genuine airtime. Missing streamed support is
a separate fail-closed condition that restores the last stable supported pose
after a short grace period. The rendered hull follows the physical attitude;
the unrigged track meshes remain attached to it.

## Consequences

- Terrain and impacts affect Tank motion without giving up the no-rollover
  boundary.
- Vehicle handling remains independent of render scale and runtime asset
  articulation.
- Development controls and diagnostics can tune the model while production
  uses one committed set of defaults.
- Wheel bodies and a fallback velocity controller are intentionally excluded.
