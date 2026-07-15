# Issue 17: Shell Contacts and Feedback

## Question

Can Tank Shells use the authored GLB muzzle and Crashcat collision authority to
produce one deterministic land-or-water impact before safe post-step cleanup?

## Conclusion

Yes. The scene now applies the current hull and turret pose before resolving the
authored `Muzzle`. Its position and negative-Z direction are converted from the
render hierarchy into map-metre physics coordinates. There is no positional or
elevation fallback: an unresolved muzzle prevents firing.

Crashcat 0.0.5 body CCD reliably reports thin convex contacts, but testing found
that fast bodies can cross static triangle meshes without a contact callback,
including with back-face contact enabled. Each fixed step therefore combines
normal Crashcat callbacks with an explicit Crashcat sphere shape sweep over the
Shell's intended displacement. This retains Crashcat as collision authority and
covers terrain and water meshes as well as authored boxes and vegetation
cylinders.

## Accepted behavior

- Shell queries include only terrain, water surface, authored obstacle, and
  vegetation owners. Tank, shoreline, streamed-region boundaries, and other
  Shells remain excluded by the collision matrix and query filter.
- Every candidate captures the contact point and stable collider owner. When a
  step has more than one candidate, distance from the Shell's pre-step position
  wins, followed by owner kind and owner ID.
- A step returns at most one immutable Shell Impact per Shell. Terrain,
  authored-obstacle, and vegetation contacts classify as land; water-surface
  contacts classify as water.
- Impacted bodies are removed only after Crashcat finishes the fixed update.
  Five-second lifetime expiry, capacity release, and mode cleanup use fixed
  simulation time and do not emit feedback.
- The scene converts map-metre contact coordinates back through Scene Scale and
  reuses the existing bullet land-burst and water-spray presets. Impacts add no
  score and no audio.
- A visually hidden HUD value exposes cumulative impact count and the latest
  land/water class for the Tank browser journey without changing the production
  HUD.

## Evidence

Focused Bun tests cover non-unit Scene Scale muzzle conversion, 120 m/s contact
against thin terrain, water, authored-box, and vegetation-cylinder colliders,
collision filtering, deterministic same-step selection, single-event cleanup,
fixed-step expiry, and effect dispatch. The Tank Playwright journey provisions
an authored obstacle, fires a Shell, observes the hidden land-impact signal, and
confirms the Shell is gone before its lifetime expires. Repository verification
remains the final integration gate.
