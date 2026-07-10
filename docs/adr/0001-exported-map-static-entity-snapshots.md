# ADR 0001: Exported Map Static Entity Snapshots

## Status

Accepted

## Context

Exported Maps are playable snapshots created from authored source maps. Terrain
chunks and placements are copied into the export at creation time, but static
entity reads previously resolved archetype and asset-version metadata through
the live catalog.

That made exported snapshot behavior depend on later catalog changes. Renaming
or archiving an archetype could alter exported entity summaries, and footprint
changes could alter chunk membership if reads recomputed overlap from current
asset metadata.

## Decision

For Exported Maps, the static-entity export manifest is the authority for
archetype and asset-version metadata used by entity-dependent reads.

Exported Maps reject terrain, tile, authored-geometry, derived-island metadata,
and static-entity placement mutations with `CONFLICT`. Rename and delete remain
allowed lifecycle operations because they do not change snapshot content.

If an Exported Map is missing required static-entity manifest metadata, or if
the manifest does not match its stored hash, entity-dependent reads fail closed.
The repository must not reconstruct missing export metadata from the live
catalog.

## Consequences

- Exported entity summaries and chunk membership stay stable after catalog
  edits, archives, or deletes.
- The manifest hash remains a meaningful integrity check for exported static
  entity metadata.
- Legacy exports without static-entity manifest metadata may not support
  entity-dependent reads until explicitly migrated by a future maintenance task.
- Admin can inspect Exported Maps, but terrain and static-entity editing controls
  are disabled.
