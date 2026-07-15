# Tank Mode

Tank Mode is a local single-player peer of Navigation and Lander. The HUD offers
direct buttons for all three modes. Editing remains available only in
Navigation.

The player Tank is the stable runtime entity `zarch-player-tank`, bound by the
idempotent API provisioning command to `zarch-player-tank-v1`. Its GLB contract
contains `Hull`, `TurretPivot`, `CannonPivot`, and `Muzzle`; runtime code rotates
the pivots and never uses the checked-in file as an implicit fallback.

## Controls and handling

- W/S drive forward and reverse; A/D pivot-steer.
- The chassis is a dynamic box with pitch and roll locked. Forward speed is
  capped at 14 m/s and reverse at 7 m/s.
- Pointer aim traverses the turret at 120 degrees per second. Hull-relative yaw
  is limited to -90 through +90 degrees and fire uses the clamped barrel
  direction. Cannon elevation is fixed at 6 degrees.
- Primary pointer or F fires an 8 kg, 0.12 m radius Shell at 120 m/s. Shells use
  CCD, inherit Tank velocity, have a 0.5 second cooldown, a capacity of 16, and
  a five-second lifetime.
- The elevated follow camera keeps the world heading captured on entry; turning
  the hull does not rotate the camera.

## Boundaries

Tank spawn searches deterministic nearest tile centres for loaded, non-water
terrain at no more than 25 degrees slope. Water shoreline is Tank-only solid;
the water surface receives Shell impacts. Unloaded streamed edges fail closed
with temporary Tank barriers. Procedural trees and eligible authored entities
are solid.

Tank Mode does not add multiplayer authority, damage, AI, rollover, or water
traversal.

## Verification matrix

| Behavior                                     | Automated seam                              |
| -------------------------------------------- | ------------------------------------------- |
| Limited hull-relative yaw                    | Tank aim unit tests                         |
| Articulated model nodes                      | GLB contract test                           |
| Collider ownership and collision matrix      | Crashcat world tests                        |
| Map-metre terrain and wrap images            | Physics geometry tests                      |
| Obstacle Mode persistence and legacy default | Contracts, repository, client, and Go tests |
| Runtime-only binding                         | Idempotent provisioning command             |
