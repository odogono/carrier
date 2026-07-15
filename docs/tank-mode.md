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
- The chassis is a 2,400 kg dynamic hull supported by four independent
  ray-suspension contacts. A reduced hull collider remains for obstacle contact
  and penetration safety. Suspension defaults to 1.8 Hz, a 0.9 damping ratio,
  1.45 metres ride distance, and 0.35 metres compression and droop travel.
- Left and right track forces provide differential steering. Forward speed is
  capped at 14 m/s and reverse at 7 m/s; lateral grip exists only at supported
  contacts, so impacts and airborne momentum remain physical.
- Traction is full through 25 degrees of slope, fades linearly to zero at 35
  degrees, and does not suppress natural downhill sliding beyond that limit.
- A compliant upright controller follows the supported terrain attitude up to
  12 degrees. A weaker world-up assist remains active in genuine airtime, and
  exceeding 25 degrees restores the last stable supported pose.
- Pointer aim traverses the turret at 120 degrees per second. Hull-relative yaw
  is limited to -90 through +90 degrees and fire uses the clamped barrel
  direction. Cannon elevation is fixed at 6 degrees.
- Primary pointer or F fires an 8 kg, 0.12 m radius Shell at 120 m/s. Shells use
  CCD, inherit Tank velocity, have a 0.5 second cooldown, a capacity of 16, and
  a five-second lifetime.
- The elevated follow camera keeps the world heading captured on entry; turning
  the hull does not rotate the camera. Its focus uses frame-rate-independent
  damping with a 0.4-second velocity lead capped at six map metres, returning
  to the hull at rest.

## Boundaries

Tank spawn searches deterministic nearest tile centres for loaded, non-water
terrain at no more than 25 degrees slope. Water shoreline is Tank-only solid;
the water surface receives Shell impacts. Unloaded streamed edges fail closed
with temporary Tank barriers. If terrain disappears beneath the Tank, the
simulation restores the last pose with at least three valid support contacts
after a 0.5-second grace period and clears both velocities. Loaded terrain with
no suspension contact remains genuine ballistic airtime. Procedural trees and
eligible authored entities are solid.

Development builds expose Tank suspension, drive, upright, and camera tuning
alongside live contact, compression, slope, speed, airborne, and recovery
diagnostics. Production uses the committed defaults without a runtime fallback.

Tank Mode does not add multiplayer authority, damage, AI, rollover, or water
traversal.

## Verification matrix

| Behavior                                     | Automated seam                              |
| -------------------------------------------- | ------------------------------------------- |
| Limited hull-relative yaw                    | Tank aim unit tests                         |
| Suspension support and uneven compression    | Tank dynamics unit tests                    |
| Differential pivot and momentum              | Tank dynamics and browser journey tests     |
| Slope traction and upright recovery          | Tank dynamics unit tests                    |
| Stream loss versus genuine airtime           | Tank dynamics unit tests                    |
| Damped velocity-led camera                   | Tank camera unit tests                      |
| Articulated model nodes                      | GLB contract test                           |
| Collider ownership and collision matrix      | Crashcat world tests                        |
| Map-metre terrain and wrap images            | Physics geometry tests                      |
| Obstacle Mode persistence and legacy default | Contracts, repository, client, and Go tests |
| Runtime-only binding                         | Idempotent provisioning command             |
