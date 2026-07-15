# Crashcat Streamed-World Collider Bridge Research

## Question and verdict

[Issue #15](https://github.com/odogono/carrier/issues/15) asks for the fixed-step
lifecycle, map-metre/scene conversion, streamed terrain, authored OBBs, water
boundaries, collision layers, and body-ID ownership of the client Crashcat
world. Merged [PR #20](https://github.com/odogono/carrier/pull/20) implements all
seven surfaces, but the result is **not yet one fully specified collider
bridge**.

The issue #15 follow-up resolves that baseline: the active Tank scene now uses
one `createZarchStaticColliderBridge`, content-complete patch signatures replace
loaded-count invalidation, absent desired owners are removed, authored OBB Y is
derived from map-metre Effective Height, and unloaded holes receive fail-closed
barriers. The findings below describe the PR #20 baseline that motivated those
changes; the final section records the implemented resolution.

The accepted architecture says that each map owns one map-metre world, dirty
owners are replaced before simulation, and streamed/wrapped geometry has stable
domain owners ([ADR 0004](../adr/0004-map-metre-client-physics-world.md#decision)).
The runtime broadly follows that decision. However, it contains two different
terrain bridge designs, only one of which is used by the scene; its patch
invalidation is not content-complete; and the documentation does not state the
host-owned scheduling and cleanup rules that Crashcat deliberately leaves to
the application.

## Primary-source constraints from Crashcat 0.0.5

The installed package is the source of truth for the API Carrier actually
ships (`apps/client/node_modules/crashcat/package.json`, version `0.0.5`).

- `updateWorld` advances by seconds. Crashcat recommends a fixed `1/60`-second
  accumulator for stability and determinism, but provides no scheduler or
  accumulator itself
  (`apps/client/node_modules/crashcat/README.md:469-524` and
  `apps/client/node_modules/crashcat/dist/src/update.d.ts:3-9`). Carrier must
  own frame clamping, maximum catch-up work, interpolation, pause/reset, and
  ordering of collider reconciliation versus stepping.
- Crashcat uses SI metres and a y-up, right-handed coordinate system; renderer
  conversion is a caller responsibility
  (`apps/client/node_modules/crashcat/README.md:528-542`). The package's own
  render-scaling example multiplies physics positions only at the presentation
  boundary (`apps/client/node_modules/crashcat/README.md:2427-2446`).
- Static triangle meshes are the intended terrain representation. Inputs are
  flat positions and triangle indices, with configurable degenerate-triangle
  tolerance and active-edge processing
  (`apps/client/node_modules/crashcat/README.md:1267-1299` and
  `apps/client/node_modules/crashcat/dist/src/shapes/triangle-mesh.d.ts:6-46`).
  Crashcat does not define chunk seams, water holes, rebuild cadence, or
  streamed ownership.
- A box is defined by half extents; applying a body position and quaternion
  turns it into a world-oriented box
  (`apps/client/node_modules/crashcat/README.md:1196-1205` and
  `apps/client/node_modules/crashcat/dist/src/body/rigid-body.d.ts:20-33`).
  There is no Carrier-aware OBB primitive or yaw conversion.
- Crashcat has no water-domain concept. Carrier must choose generic meshes or
  primitives for shoreline and surface behavior.
- Object layers are the primary collision matrix; broadphase layers partition
  candidate searches. The application allocates both and enables the desired
  pairs before creating the world
  (`apps/client/node_modules/crashcat/README.md:420-464` and
  `apps/client/node_modules/crashcat/dist/src/layers.d.ts:1-22`). Per-body
  groups and masks are an additional bidirectional filter, not a replacement
  (`apps/client/node_modules/crashcat/README.md:972-1006`).
- Bodies are pooled. Long-lived code must store `BodyId`, resolve it through
  `rigidBody.get`, and tolerate stale IDs after removal
  (`apps/client/node_modules/crashcat/README.md:548-590` and
  `apps/client/node_modules/crashcat/dist/src/body/body-id.d.ts:1-17`). Body
  removal from a contact callback is unsafe and must be deferred until
  `updateWorld` returns (`apps/client/node_modules/crashcat/README.md:1472-1505`).
  Crashcat exposes no world-dispose API, so Carrier must remove owned bodies and
  release references.

## PR #20 baseline by issue requirement

| Requirement                           | Current implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Assessment                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed-step lifecycle                  | The Tank simulation clamps contributed frame time to 0.1 seconds, accumulates it, steps at 60 Hz, caps catch-up at five steps, and drops the remainder after the cap (`apps/client/src/screens/zarch/zarch-player-tank.ts:168-245`). Static geometry is reconciled earlier in the same render callback before `stepPlayerTankSimulation` (`apps/client/src/screens/zarch/zarch-scene.tsx:1213-1418`). Tank and Shell bodies are removed on mode exit or map cleanup (`zarch-player-tank.ts:154-166`; `zarch-scene.tsx:1029-1092`).                     | Implemented, but policy is split across files and absent from the ADR. No render interpolation is used, and the reason for dropping backlog is not specified.                                                                                                                                                                                                                         |
| Map metres to scene coordinates       | `getSceneMetersScale` is `24 / metersPerTile`; static X/Z render positions multiply by it (`apps/client/src/helpers/zarch-static-entities.ts:46-61`). Tank physics remains in metres, terrain sampling converts physics X/Z into scene X/Z, pointer aim converts back, and the camera converts Tank positions back to scene units (`zarch-scene.tsx:1158-1193`, `1392-1413`, `1447-1463`).                                                                                                                                                             | The horizontal boundary is explicit and tested indirectly. Vertical conversion is inconsistent for authored OBBs: grounding adds `scaledYOffsetMeters * sceneScale` while physics consumes the resulting `sceneY` as map metres (`zarch-static-entities.ts:85-113`; `zarch-static-entities.tsx:511-524`). This diverges whenever `metersPerTile !== 24`.                              |
| Loaded-terrain generation and cleanup | Runtime builds a 25-by-25-tile patch from loaded height samples, skipping any quad with a missing corner (`apps/client/src/screens/zarch/zarch-physics-geometry.ts:22-55`). It replaces the stable `terrain:active` body and removes it on mode/map cleanup (`zarch-scene.tsx:1247-1266`, `1029-1092`). Separately, `createZarchChunkColliderBridge` builds per-chunk terrain/water/shoreline wrap images and reconciles owner additions/removals (`zarch-physics-world.ts:234-321`), with one add/remove test (`zarch-physics-world.test.ts:88-130`). | Two competing bridges exist. The chunk reconciler is never imported by runtime code. The active patch key uses loaded-tile **count**, not loaded coordinates or height content (`zarch-scene.tsx:1221-1247`), so equal-count topology changes can retain stale geometry.                                                                                                              |
| Static-entity OBBs                    | Eligible active, validly grounded, `obstacleMode: solid` entities expose a centre, scaled half extents, and negated yaw (`apps/client/src/helpers/zarch-static-entities.ts:20-28`; `apps/client/src/screens/zarch/zarch-static-entities.tsx:487-526`). The physics wrapper creates a static box and y-axis quaternion, including nearby wrap images (`zarch-physics-world.ts:208-219`; `zarch-scene.tsx:1367-1388`).                                                                                                                                   | Shape and yaw policy are implemented. Besides the Y-unit mismatch above, the patch signature includes centre and yaw but omits half extents (`zarch-scene.tsx:1238-1247`), so asset collision-box or entity-scale changes can fail to rebuild an existing body.                                                                                                                       |
| Water boundary representation         | Loaded water tiles receive a horizontal triangle surface at `seaY` for Shells and vertical perimeter quads from `seaY - 20` to `max(corner heights) + 5` for the Tank (`zarch-physics-geometry.ts:57-184`). The chunk variant uses the same surface/perimeter split (`zarch-physics-geometry.ts:220-335`).                                                                                                                                                                                                                                             | The two-surface policy matches `docs/tank-mode.md:26-32`. On a dry-only rebuild the runtime does not remove an existing `water-surface:active` or `shoreline:active` before conditionally recreating it (`zarch-scene.tsx:1247-1294`), so old water bodies can persist until mode/map cleanup. Exact depth/top margins are implementation constants, not documented design decisions. |
| Collision layers                      | Eight object layers map to moving/static broadphase layers. Tank collides with terrain, shoreline, obstacle, vegetation, and stream boundary; Shell collides with terrain, water surface, obstacle, and vegetation (`apps/client/src/screens/zarch/zarch-physics-world.ts:36-98`). Tests assert representative allowed and forbidden pairs (`zarch-physics-world.test.ts:16-48`).                                                                                                                                                                      | The intended matrix is implemented, but the test does not exhaust all 36 unordered pairs. In particular it does not prove every unintended pair remains disabled.                                                                                                                                                                                                                     |
| Body-ID ownership                     | Static bodies are keyed by `kind:id`; replacement removes the old body before recording the new `BodyId`, and `userData` retains the domain owner (`zarch-physics-world.ts:31-34`, `63`, `151-193`). Tank and Shell simulations separately own their dynamic IDs and defer Shell removal until after stepping (`zarch-player-tank.ts:100-166`, `205-245`, `287-297`).                                                                                                                                                                                  | Correctly follows Crashcat's pooled-ID guidance. Ownership is split between the wrapper, scene arrays, and simulation. There is no single `clear`/`dispose` operation that iterates every static and dynamic owner, and `createZarchChunkColliderBridge.clear` is unused.                                                                                                             |

## Gaps identified in PR #20

1. **Choose one runtime bridge.** Prefer a single reconciler whose input is the
   desired owner set for terrain, water, shoreline, streamed boundaries,
   vegetation, and authored OBB wrap images. Remove or integrate the currently
   unused chunk bridge so tests exercise the production path.
2. **Make invalidation content-based.** Owner versions/signatures must change on
   loaded-coordinate changes, height/terrain revision changes, water
   transitions, editor drafts, OBB centre/yaw/**half-extents** changes, and wrap
   image changes. Reconciliation must remove a previously present owner when its
   new geometry is empty.
3. **State the coordinate contract.** Physics X/Y/Z, collider dimensions,
   heights, offsets, vehicle speeds, and Shell speeds are map metres. Only
   renderer X/Z are scaled by `24 / metersPerTile`; either keep render Y equal to
   metres or define and consistently apply a separate Y transform. Correct the
   authored-collider grounding path to honor that rule.
4. **Centralize lifecycle ownership.** Document one world per selected map,
   create-on-demand behavior, collider sync before each physics tick, 60 Hz
   stepping, five-step catch-up/drop policy, deferred contact removals, mode/map
   cleanup, and a bridge-level `clear` that removes every owned body before
   releasing the world reference.
5. **Name water and stream-boundary geometry precisely.** Preserve distinct
   Shell water surfaces and Tank shoreline walls. Specify whether unloaded holes
   inside the active patch must fail closed; the current four outer patch boxes
   (`zarch-scene.tsx:1295-1334`) do not outline internal unloaded regions.

## Verification suggestions

- Add a production-bridge reconciliation test that streams chunks in/out,
  changes heights without changing loaded count, transitions wet to dry, shifts
  wrap focus, and proves obsolete body IDs no longer resolve.
- Add table-driven assertions for every Tank/Shell/static layer pair, including
  all forbidden dynamic-dynamic and water/stream combinations.
- Add a non-default-resolution test (`metersPerTile` other than 24) covering
  Tank terrain height, authored OBB X/Y/Z centre, scaled dimensions, pointer aim,
  and render projection.
- Add an OBB replacement test where only entity scale or collision-box dimensions
  change.
- Add lifecycle tests for repeated Tank entry/exit and map switches, asserting
  `rigidBody.iterate(world)` contains no bodies owned by the departed mode/map.
- Add a long-frame test that locks the chosen five-substep/drop behavior and a
  contact test proving Shell removal occurs after `updateWorld`, never inside
  the listener.

## Implemented resolution

- `createZarchStaticColliderBridge` is the sole production static-body
  reconciler. It accepts the desired terrain, shoreline, water, stream-boundary,
  vegetation, and authored-obstacle owner set; preserves unchanged Body IDs,
  replaces only dirty owners, removes owners that disappeared, and exposes one
  `clear` operation for mode and map cleanup.
- Patch invalidation serializes terrain samples, loaded/water topology including
  the neighbor halo, vegetation state, wrap offsets, and complete authored OBB
  centres, rotations, and half extents, plus Sea Y and tile scale. Equal loaded
  counts, dimension-only changes, and geometry-setting changes therefore rebuild
  the correct bodies.
- Authored obstacle collider Y uses canonical `effectiveHeightMeters`; render
  `sceneY` remains presentation-only.
- Stream boundaries are one triangle mesh around every loaded-to-unloaded edge,
  including internal holes. Wet-to-dry transitions omit water owners from the
  desired set, so reconciliation removes the old bodies.
- ADR 0004 now records fixed-step scheduling, catch-up/drop behavior, deferred
  contact removal, map-metre conversion, content invalidation, barrier extents,
  and cleanup ownership.
- Focused coverage locks non-default-resolution OBBs, terrain topology and height
  changes, OBB dimension changes, internal unloaded barriers, the complete
  collision matrix, stale water cleanup, bridge clearing, and long-frame
  fixed-step catch-up.

With those changes, issue #15 has one documented and production-tested collider
bridge contract and can be closed after the repository verification gate passes.
