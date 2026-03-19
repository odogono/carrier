# Vector Islands Plan

Superseded by the adopted `infinite-vector` architecture in [docs/map-model-reset-plan.md](./map-model-reset-plan.md).

This file is retained only as historical context for the earlier bounded vector runtime exploration. It should not be used as implementation guidance.

## Why It Is Superseded

- it models vector terrain as another generator on the old finite-first map contract
- it assumes whole-map bounds as a primary runtime concept
- it predates the current authored-object persistence model, derived-island model, and signed infinite chunk generation

## Current Direction

Use the reset plan and current codebase instead:

- `wrapped-classic` is the finite toroidal runtime
- `infinite-vector` is the authored infinite world runtime
- bounded vector output, if revisited, should be treated as an export or slice mode from `infinite-vector`, not a separate primary runtime
