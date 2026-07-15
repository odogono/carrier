# Vehicle Support Additions

> Superseded by [Tank Mode](./tank-mode.md) and ADRs 0003-0004. This document is
> retained as the original exploration; its heightfield-following vehicle model
> was replaced by the accepted Crashcat Tank design.

## Summary

Add vehicles as first-class simulated entities in the client runtime, with arcade handling and deterministic terrain and obstacle queries. Treat this phase as single-player-first: build a local vehicle simulation that follows the heightfield, blocks on trees, water, and cliffs, and resolves contact against other vehicles, while leaving a clean path to later server authority.

## Key Changes

- Replace the current camera-only movement model in `apps/client/src/screens/zarch/use-zarch-runtime.ts` with a `playerVehicle` state plus a camera-follow rig.
- Extend the terrain abstraction in `apps/client/src/helpers/zarch-terrain.ts` so gameplay can query:
  - interpolated height at world position, not just tile corners
  - terrain normal or slope at world position
  - water occupancy at world position
  - cliff or too-steep classification from slope threshold
  - obstacle lookup for nearby trees
- Split render decoration from gameplay obstacle data.
  - Trees cannot stay purely visual or procedural if vehicles must collide with them consistently.
  - Add a deterministic obstacle layer for trees per tile or chunk, with collider radius and world position.
  - Keep cliffs derived from terrain slope; keep water derived from height and water level.
- Add a vehicle simulation module with:
  - position, yaw, speed, steering, throttle, brake, radius or footprint
  - terrain following by sampling height under the chassis and aligning vehicle pitch and roll to terrain normal
  - arcade traction and steering limits based on slope and surface state
  - collision sweeps or stepped movement against static obstacles and terrain hazards
  - vehicle-vehicle broadphase and circle or box overlap resolution
- Add vehicle rendering and interaction:
  - visible player vehicle mesh
  - optional placeholder meshes for AI or other vehicles
  - HUD state for speed, vehicle health or status, and blocked surface warnings
  - camera follow offset decoupled from simulation state so the camera no longer represents the player directly
- Keep networking out of this phase except for future-proofing:
  - do not yet extend `packages/protocol/proto/v1/messages.proto` for authoritative vehicle sync
  - shape local state and input so it can later serialize as `vehicle_input` and `vehicle_state`

## Public Interfaces / Data Additions

- `ZarchTerrain` should grow methods similar to:
  - `sampleHeightAtWorld(x, z)`
  - `sampleNormalAtWorld(x, z)`
  - `isWaterAtWorld(x, z)`
  - `isCliffAtWorld(x, z)`
  - `getStaticObstaclesInRadius(x, z, radius)`
- Add `VehicleState`, `VehicleInputState`, and `VehicleSpec` types.
- Add a map or chunk obstacle representation for trees, either:
  - persisted in map chunks, or
  - deterministically derived from map seed plus tile coordinates and exposed through the terrain layer
- Default collision model:
  - trees: cylinder or circle blockers
  - water: non-drivable volume
  - cliffs: slope-based non-traversable surface
  - vehicles: 2D footprint collision with height sampled from terrain beneath each vehicle

## Test Plan

- Terrain following:
  - vehicle stays grounded over flat, sloped, and uneven sampled terrain
  - vehicle pitch and roll remain stable across chunk boundaries
- Hazard collision:
  - vehicle cannot enter water tiles
  - vehicle cannot climb slopes above the cliff threshold
  - vehicle stops or slides appropriately when contacting a tree
- Vehicle interaction:
  - two vehicles cannot overlap after a collision step
  - low-speed contact resolves without jitter
  - higher-speed contact does not tunnel through another vehicle
- Streaming and runtime behavior:
  - unloaded terrain or obstacle chunks are treated as non-drivable until loaded
  - camera follow remains smooth while vehicle simulation is blocked or colliding
- Regression coverage:
  - existing terrain chunk sampling tests remain valid
  - new tests for obstacle generation determinism and world-position terrain sampling

## Assumptions

- First milestone is local and single-player, not server-authoritative multiplayer.
- Handling target is arcade, not wheel-by-wheel simulation.
- Trees become gameplay obstacles, not just visual decoration.
- Cliffs are derived from slope threshold; no separate authored cliff assets are required.
- Vehicles use a simple footprint and chassis alignment model rather than full rigid-body physics for v1.
