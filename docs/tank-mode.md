# Tank Mode

Tank Mode is a local single-player peer of Navigation Mode and Lander Mode.
The HUD offers a direct button for each Gameplay Mode. Changing between Lander
and Tank passes through Navigation so the outgoing mode is cleaned up before the
new one starts. Editing is available only in Navigation.

This document is the normative behavior specification for the first Tank. The
numeric values under **Committed defaults** describe the current tuning baseline;
they may be tuned without changing the domain contract as long as the behavioral
limits and acceptance criteria below remain true.

## Entry, exit, and runtime asset

The player Tank is the stable runtime entity `zarch-player-tank`, bound by the
idempotent API provisioning command to `zarch-player-tank-v1`. Its GLB contract
contains `Hull`, `TurretPivot`, `CannonPivot`, and `Muzzle`. Runtime code rotates
the pivots and never uses the checked-in file as an implicit fallback.

Until that binding and model are ready, the Tank button is unavailable and the
HUD exposes the provisioning failure. Entering Tank searches deterministic
nearest tile centres for loaded, non-water terrain at no more than 25 degrees
of slope, excluding vegetation and authored obstacles. If no valid spawn exists,
the client remains in Navigation and reports the failure.

The Tank keeps an unwrapped local position while driving on a finite wrapped
map. Nearby translated collider images make seam traversal continuous. Leaving
Tank canonicalizes its final position into Navigation coordinates. Leaving Tank,
changing maps, or unmounting the scene removes the Tank and every Shell body and
clears the static collider owners. The empty Crashcat world may remain alive for
the selected map session; changing maps releases that world.

## Controls and physical behavior

- W/S apply forward and reverse track drive; A/D apply differential
  pivot-steering. Driving is map-aligned and independent of camera rotation.
- The Tank is one dynamic hull supported by four independent ray-suspension
  contacts. Contact forces provide spring support, damping, drive, and lateral
  grip while the reduced hull collider handles obstacle contact and penetration
  safety.
- Supported slopes retain full traction through 25 degrees, then fade to zero
  at 35 degrees. Steeper terrain may produce natural downhill sliding.
- A compliant upright controller follows supported terrain while preventing
  rollover. Loaded terrain without contact is genuine airtime. Missing streamed
  support is a separate fail-closed condition that restores the last stable
  supported pose after a short grace period and clears both velocities.
- Pointer world position aims the turret within a hull-relative -90 to +90 degree
  arc. Out-of-arc aim is clamped; firing continues along the clamped barrel
  direction. Missing authored `Muzzle` data prevents firing.
- Primary pointer or F fires a fixed-speed ballistic Shell from the authored
  `Muzzle`. Shells inherit Tank velocity, use Crashcat CCD plus an explicit shape
  sweep, accept only their nearest deterministic contact, emit one land burst or
  water spray, and are removed after that physics step. Shell Impacts do not
  imply damage, destruction, persistence, or score changes.
- The elevated follow camera retains the world heading captured on Tank entry.
  Hull steering does not rotate the camera; damped velocity lead returns to the
  Tank at rest.

## Collision boundaries

Terrain, procedural trees, and active validly grounded Static Entities whose
immutable asset version has Obstacle Mode `solid` block the Tank. Obstacle Mode
`none` is non-blocking; legacy exported manifests without the field resolve to
`solid` without being rewritten.

Water uses separate collision surfaces: shoreline barriers block the Tank while
the water surface accepts Shell Impacts. Unloaded streamed edges, including
internal holes, fail closed with temporary Tank barriers. Shells collide with
terrain, water surfaces, vegetation, and authored obstacles, but not shoreline
or stream-boundary bodies.

## Committed defaults

- Hull mass: 2,400 kg; forward/reverse caps: 14/7 m/s.
- Drive response: 8 m/s² acceleration and 1.15 lateral grip.
- Suspension: 1.8 Hz, 0.9 damping ratio, 1.45 m ride distance, and 0.35 m
  compression and droop travel.
- Upright response: strength 200, damping 20, airborne strength 0.28, a 12
  degree supported target limit, and a 25 degree recovery limit.
- Recovery: restore the last supported pose after 0.5 s without streamed
  support; refresh that pose with at least three contacts below 20 degrees of
  tilt.
- Turret traverse: 120 degrees/s with a -90 to +90 degree hull-relative arc.
- Shell: 8 kg, 0.12 m radius, 120 m/s, 0.5 s cooldown, 16-Shell capacity, and
  five seconds of fixed-simulation lifetime.
- Camera: damping 5 with 0.4 s velocity lead capped at six map metres.
- Simulation: 60 Hz fixed steps, at most 0.1 s frame contribution and five
  catch-up steps, with excess backlog dropped.

Development builds expose suspension, drive, upright, and camera tuning plus
live contact, compression, slope, speed, airborne, and recovery diagnostics.
Production uses the committed defaults without a runtime fallback.

## Acceptance matrix

| Normative behavior                                                                                                                 | Evidence           | Verification seam                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| Navigation, Lander, and Tank are direct peer modes; editing excludes vehicle modes                                                 | Automated + manual | Tank browser journey (Edit from Navigation); Chromium playtest (Edit from Tank and Lander) |
| Runtime-only binding disables Tank until provisioned and has no bundled fallback                                                   | Automated          | Tank provisioning browser journey; GLB/runtime model tests                                 |
| Spawn selects deterministic nearest loaded, obstacle-free, non-water land and fails closed when none exists                        | Automated + manual | Tank spawn unit tests; Chromium failure-state playtest                                     |
| Runtime model exposes the articulated node contract and firing requires `Muzzle`                                                   | Automated          | GLB contract, muzzle conversion, and Tank firing tests                                     |
| WASD drive, pivot steering, speed reversal, and physical momentum remain responsive                                                | Automated + manual | Tank dynamics tests; Tank browser journey; Chromium handling playtest                      |
| Four-point suspension, slope traction, airtime, upright recovery, and stream-loss recovery obey their distinct rules               | Automated + manual | Tank dynamics tests; Chromium suspension/edge playtest                                     |
| Camera heading stays fixed while damped lead follows and recentres                                                                 | Automated + manual | Tank camera tests; Chromium camera playtest                                                |
| Terrain, vegetation, authored obstacles, shoreline, water, and stream boundaries use the agreed collision matrix                   | Automated + manual | Crashcat world and physics geometry tests; Chromium boundary playtest                      |
| Collider invalidation tracks loaded topology, height, water, obstacle dimensions, and stale-owner removal                          | Automated          | Physics geometry and production bridge tests                                               |
| Wrapped maps keep Tank physics unwrapped across a seam and canonicalize Navigation on exit                                         | Automated + manual | Wrapped-seam browser journey; wrap geometry tests; Chromium seam playtest                  |
| Shells use authored muzzle direction, ballistic motion, CCD/sweeps, deterministic first contact, one effect, and post-step cleanup | Automated + manual | Tank, muzzle, impact-dispatch, and browser journey tests; Chromium impact playtest         |
| Fixed-step catch-up, lifetime, capacity, mode exit, direct mode changes, and stale body removal are bounded                        | Automated          | Tank lifecycle tests; direct-mode wrapped-seam browser journey; Crashcat owner tests       |
| Changing maps removes the Tank, every Shell body, and the collider owners, and releases the physics world                          | Manual             | Chromium map-change playtest                                                               |
| Navigation resumes at the Tank final canonical position within the displayed moving-body tolerance                                 | Automated          | Both Tank browser journeys                                                                 |
| Obstacle Mode persists through contracts, repository, exported manifests, client filtering, and Go world loading                   | Automated          | Contracts, repository, client helper, and Go world tests                                   |

## Manual Chromium playtest

Before closing the implementation issue, record pass/fail evidence for:

1. Tank is unavailable with clear feedback before runtime provisioning, then
   becomes selectable after provisioning.
2. Direct mode buttons work; entering Edit returns to Navigation and prevents
   vehicle selection.
3. Driving feels responsive; suspension follows uneven terrain; the camera keeps
   its captured heading and recentres after stopping.
4. Water, authored obstacles, vegetation, and unloaded edges block the Tank
   without rollover or escape into missing terrain.
5. A Shell Impact on land or on water produces its one appropriate effect and no
   persistent damage.
6. A wrapped seam can be crossed continuously, followed by a clean Lander/Tank
   transition and canonical Navigation handoff.
7. Selecting Tank where no valid spawn exists (for example, focused over open
   water) leaves the client in Navigation and shows the spawn failure.
8. Changing maps while driving with Shells in flight removes the Tank and every
   Shell, and the new map starts in Navigation.

Tank Mode does not add multiplayer authority, persistent damage, AI vehicles,
full rollover behavior, or water traversal.
