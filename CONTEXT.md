# Carrier Domain Context

## Static Entity Export Bounds

A static entity export snapshot copies placements from a source map into a finite exported map. The export's terrain bounds are the requested bounds and are not expanded to fit static entities.

Static entity chunk reads are overlap-aware: a placement can appear in any chunk touched by its footprint.

Static entity export snapshots are containment-aware: a placement is copied only when its full footprint is contained by the requested export bounds. A footprint that touches an export edge exactly is contained; a footprint that crosses any export edge is omitted. Export placement positions are translated into export-local coordinates after selection.
