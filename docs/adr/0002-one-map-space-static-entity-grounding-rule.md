# ADR 0002: One Map-Space Static-Entity Grounding Rule

## Status

Accepted.

## Context

Static-entity grounding was being computed in multiple places with different
details. Admin preview and Go world loading used footprint-aware samples, while
the gameplay client duplicated the sampler and positioned entities from the
center terrain height. Placement scale was applied to some footprint and
collision dimensions, but not consistently to the vertical offset.

This made the same authored placement capable of producing different vertical
positions or validity across admin diagnostics, client rendering, and gameplay
world collision.

## Decision

All runtimes use one canonical map-space grounding rule:

- scale the asset-version footprint width and depth by placement scale;
- sample the placement anchor and the four yaw-rotated footprint corners;
- average the five terrain heights;
- scale `yOffset` by placement scale;
- define `effectiveHeightMeters` as average terrain height plus scaled offset;
- compute validity from the maximum sample-height delta;
- return no grounding result when any terrain sample is unavailable.

`maxHeightDeltaMeters` remains a fixed map-space tolerance. Placement scale can
move sample points farther apart, but it does not multiply the allowed terrain
delta.

The gameplay client additionally computes `sceneY` for Three.js rendering. It
keeps `effectiveHeightMeters` in canonical map-space metres, samples terrain at
scene-projected X/Z, and projects only the scaled offset displacement through
the map-to-scene scale.

## Consequences

Admin diagnostics, client rendering, and Go world loading now agree on
effective height and validity for the same placement and terrain.

The client has a rendering-specific `sceneY` field because scene coordinates are
not the domain model. Code that needs canonical grounding should use
`effectiveHeightMeters`.

Shared fixture tests cover the cross-runtime rule with non-square footprint,
non-zero yaw, non-unit scale, non-zero offset, uneven terrain, valid and invalid
tolerances, and non-unit client scene scale.
