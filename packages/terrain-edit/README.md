# carrier-terrain-edit

Shared terrain editing logic for Zarch tile overrides.

This package is intentionally UI-free. It centralizes the terrain edit domain
model so the editing rules live in one place instead of being duplicated inside
React components.

It currently provides:

- Tile edit state and reducer logic
- Draft edit and merge helpers
- Height step offset calculations
- Area selection, preview halo, flatten, raise, and lower edit solvers

The package is used by both frontend applications:

- `apps/client` uses it for the in-game Zarch tile editor
- `apps/admin` uses it for the map editor and terrain preview/rendering helpers

It is not a server package. Its role is to provide shared TypeScript terrain
editing behavior for the client/admin surfaces that author or preview terrain
tile overrides.
