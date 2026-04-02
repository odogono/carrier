# Asset Behaviors For Zarch Static Entities

## Summary

Static entity animation should be modeled as asset-level `behaviors`, not as special-case gameplay entity types.

A radar tower, a dual-radar installation, and a building with an opening door all fit the same pattern:

- the GLB defines a stable hierarchy with named nodes or animation clips
- the asset version stores behavior metadata describing what parts can move
- the client binds those behaviors when cloning the asset
- the runtime decides which behaviors are active and how they are played

This keeps the current static-entity placement model intact while making the rendering path flexible enough to support simple looping motion now and more complex authored motion later.

## Why `behaviors` Instead Of `rotatingPart`

A single `rotatingPart` field is too narrow. It only solves the first radar tower case and immediately breaks down for:

- multiple moving parts on the same asset
- parts rotating in opposite directions
- non-rotational motion
- authored animation clips like doors, gates, lifts, or folding parts

The right abstraction is a list of behaviors on the asset version.

Example direction for the shared contract in [authored.ts](/Users/alex/work/carrier/packages/contracts/src/schema/maps/authored.ts):

```ts
type AssetBehavior =
  | {
      id: string;
      kind: 'spin';
      nodeName: string;
      axis: 'x' | 'y' | 'z';
      degreesPerSecond: number;
      phaseDegrees?: number;
    }
  | {
      id: string;
      kind: 'clip';
      clipName: string;
      playback: 'once' | 'loop' | 'ping-pong';
      speed?: number;
      startAt?: number;
    };

type AssetVersion = {
  // existing fields...
  behaviors?: AssetBehavior[];
};
```

The key rule is:

- asset-level `behaviors` describes what the model is capable of
- entity/runtime state decides which behaviors are currently active

## GLB Preparation

The GLB should be authored so the runtime only needs to bind to stable names and apply motion. The runtime should not have to infer pivots or repair broken hierarchies.

## Authoring In Blender

This section describes how to prepare a Blender asset so it imports cleanly into the current Zarch static-entity pipeline and is ready for behavior binding.

### Scene Setup

- Use meters as the working unit.
- Model the asset at real scale.
- Treat positive local `Z` as the asset's forward authoring direction and local `Y` as up.
- Place the full asset so the intended placement origin sits at world `0, 0, 0`.
- Put ground contact at `Z = 0` in Blender terms only if that matches your scene convention, but make sure the final export has the asset sitting on the ground plane with no buried base.

For this project, the most important placement rule is:

- the exported asset root should represent the world placement point
- the base should already sit on the ground plane at that root

That matches the normalization path in [three-model-utils.ts](/Users/alex/work/carrier/apps/client/src/helpers/three-model-utils.ts), which recenters horizontally and grounds the imported scene.

### Object And Hierarchy Conventions

Use an explicit hierarchy rather than relying on mesh origins alone.

Recommended pattern:

- one top-level root object for the whole asset
- static geometry grouped under stable non-moving parent nodes
- each moving part placed under its own named pivot object

Example:

```text
RadarTowerRoot
  Base
  DishPivot
    DishMesh
```

For a dual radar:

```text
DualRadarRoot
  Base
  UpperDishPivot
    UpperDishMesh
  LowerDishPivot
    LowerDishMesh
```

If a part rotates, the pivot object should be the thing named in behavior metadata, not the mesh unless the mesh origin is already correct and intentionally stable.

### Setting Pivots Correctly

For every moving part:

1. Put the 3D cursor at the intended center of motion.
2. Create an Empty at that location or move the object's origin there.
3. Parent the visible mesh under that Empty or pivot object.
4. Reset the child mesh transform so it sits correctly relative to the pivot.

For a radar dish, the pivot should sit exactly on the swivel axis.

For a door, the pivot should sit exactly on the hinge line if you are authoring procedural hinge rotation. If you are authoring a clip instead, keep the animated object hierarchy clean and consistent even though the clip will drive the motion.

### Naming

Use stable, exact names because the runtime will bind by string.

Good examples:

- `DishPivot`
- `UpperDishPivot`
- `LowerDishPivot`
- `MainDoor`
- `DoorOpenClose`

Avoid:

- names with Blender auto-numbering that may change across exports
- vague names like `Cube.001`
- renaming nodes after metadata has already been reviewed and approved

The rule should be:

- node names are part of the asset contract
- clip names are part of the asset contract

### Transforms

Before export:

- apply object scale
- apply object rotation where appropriate
- remove accidental offsets on root objects
- keep local transforms clean for pivot nodes

In practice:

- static meshes should usually have applied transforms
- pivot empties should have clean transforms and meaningful local axes
- child meshes can retain local offsets relative to the pivot if that offset is the intended geometry placement

If a radar dish rotates around the wrong axis in Blender, fix the asset there. Do not rely on runtime correction logic for a broken authoring setup.

### Authoring A Spinning Part

For a simple spinning radar:

1. Model the base as static geometry.
2. Create a `DishPivot` object at the swivel center.
3. Parent the dish mesh to `DishPivot`.
4. Confirm rotating `DishPivot` locally on the intended axis produces the correct motion.
5. Export without baking any actual spin animation if the asset will use a procedural `spin` behavior.

This keeps the runtime simple and lets the speed be configured in metadata instead of being baked into the GLB.

### Authoring A Door Or Other Complex Motion

If the motion is more than a simple endless spin, prefer authoring an animation clip.

For a door:

1. Keep the door in a clean object hierarchy.
2. Put the hinge pivot in the right place.
3. Animate the door opening and closing on the timeline.
4. Create a named Action for the motion, for example `DoorOpenClose`.
5. Make sure the exported glTF includes that action as an animation clip.

This is preferable when:

- timing matters
- multiple parts move together
- easing matters
- the motion is not just constant angular velocity

### Blender Checks Before Export

Before exporting, verify all of the following:

- the asset is centered correctly at the intended placement origin
- the base sits on the ground plane
- scales are correct in meters
- moving parts rotate around the correct pivots
- node names are final and stable
- action names are final and stable
- no stray helper objects are included unless intentionally exported
- materials and meshes are the ones you expect to ship

### glTF/GLB Export Guidance

Use Blender's glTF 2.0 exporter and export `.glb`.

Recommended defaults:

- format: `glTF Binary (.glb)`
- include only selected objects if you are exporting a single asset from a larger scene
- apply modifiers if needed for the shipped mesh
- include animations when the asset uses clip-based behaviors

Be consistent about export settings across assets so node names and hierarchy behavior stay predictable.

### Suggested Authoring Workflow

For decorative mechanical props:

1. Build the static mesh and moving subparts.
2. Create explicit pivot nodes.
3. Name every pivot intentionally.
4. Test local rotation in Blender.
5. Export as `.glb`.
6. In admin review, add `spin` behaviors that reference those pivot names.

For interactive props such as doors:

1. Build the hierarchy and hinge points.
2. Author the motion as a named Blender Action.
3. Export the clip in the `.glb`.
4. In admin review, add a `clip` behavior referencing that clip name.

### General Rules

- Place the asset root at the intended placement origin.
- Keep the origin on the ground plane at the center of the base footprint.
- Apply or freeze transforms before export.
- Use clean, stable node names.
- Keep moving parts under explicit pivot nodes.

### For Spinning Parts

For a radar tower:

- `Base` stays static
- `DishPivot` is an empty or transform node placed exactly at the swivel center
- `DishMesh` is parented under `DishPivot`

The runtime rotates `DishPivot`, not the dish mesh directly unless the mesh origin already matches the correct pivot.

### For Multiple Moving Parts

For a radar with two dishes rotating in opposite directions:

- `Base`
- `UpperDishPivot`
- `UpperDishMesh`
- `LowerDishPivot`
- `LowerDishMesh`

Each moving element gets its own pivot node and its own behavior entry.

### For Doors And Other Complex Motion

For a building door:

- author the motion as a glTF animation clip in the DCC tool
- export a named clip such as `DoorOpenClose`
- keep the animated node names stable, but bind the runtime to the clip name rather than rebuilding the motion procedurally

This is a better fit than procedural rotation for assets that have articulated, timed, or non-linear motion.

## Behavior Types

## `spin`

`spin` is the lightweight procedural behavior for decorative motion.

Good fits:

- radar dishes
- fans
- turbines
- rotating beacons
- simple mechanical props

Example:

```json
{
  "behaviors": [
    {
      "id": "dish",
      "kind": "spin",
      "nodeName": "DishPivot",
      "axis": "y",
      "degreesPerSecond": 45
    }
  ]
}
```

For two counter-rotating parts:

```json
{
  "behaviors": [
    {
      "id": "upper-dish",
      "kind": "spin",
      "nodeName": "UpperDishPivot",
      "axis": "y",
      "degreesPerSecond": 45
    },
    {
      "id": "lower-dish",
      "kind": "spin",
      "nodeName": "LowerDishPivot",
      "axis": "y",
      "degreesPerSecond": -45
    }
  ]
}
```

## `clip`

`clip` is for authored glTF animation playback through `AnimationMixer`.

Good fits:

- doors opening and closing
- gates
- elevators
- landing gear
- folding machinery
- any motion with timing, easing, or multiple coordinated parts

Example:

```json
{
  "behaviors": [
    {
      "id": "main-door",
      "kind": "clip",
      "clipName": "DoorOpenClose",
      "playback": "once",
      "speed": 1
    }
  ]
}
```

## Runtime Model

The current static-entity render path in [zarch-static-entities.tsx](/Users/alex/work/carrier/apps/client/src/screens/zarch/zarch-static-entities.tsx) already does most of what is needed:

- resolve visible static entities
- load the runtime GLB
- normalize it
- clone it per visible entity
- apply placement position, yaw, scale, and grounding

That means behavior support should be added as an extension of clone setup, not as a parallel rendering system.

### Clone Setup

When a clone is created:

- clone the normalized object as today
- inspect the asset version's `behaviors`
- for each `spin` behavior, resolve `nodeName` once on the clone
- for each `clip` behavior, resolve `clipName` once from the loaded GLTF animations
- store those bindings on the clone entry

### Per-Frame Update

Each frame:

- continue applying entity placement transforms to the clone root
- update `spin` behaviors by setting the bound node's local rotation from absolute elapsed time
- update `clip` behaviors through a per-clone `AnimationMixer`

For `spin`, prefer absolute-time angle calculation rather than incrementally adding to the current angle. That avoids drift and keeps motion deterministic.

### Missing Bindings

If a behavior references a missing node or clip:

- do not fail asset rendering
- leave the model visible
- skip only the missing behavior
- surface the problem through diagnostics or dev logging

## Instancing Rule

Any asset with one or more behaviors should bypass instancing.

The current instancing path in [zarch-static-entities.tsx](/Users/alex/work/carrier/apps/client/src/screens/zarch/zarch-static-entities.tsx) flattens the asset to a single mesh for `InstancedMesh` usage. That is incompatible with:

- per-subnode transforms
- per-clone `AnimationMixer` state
- per-clone clip playback control

So the rule should be:

- no behaviors: instancing may be used if the asset is otherwise eligible
- one or more behaviors: always render as non-instanced clones

## Admin Review And Preview

The behavior metadata belongs on `AssetVersion`, because the node names and clip names are specific to a particular GLB.

The asset review form in [assets.tsx](/Users/alex/work/carrier/apps/admin/src/pages/assets.tsx) should be extended so reviewers can:

- add, edit, and remove behaviors
- choose `spin` or `clip`
- enter node names or clip names
- configure speed, axis, playback mode, and similar fields

The admin asset preview should use the same behavior binding logic as gameplay so reviewers can verify:

- the named pivot is correct
- the direction is correct
- the speed feels right
- the clip name resolves
- the motion looks correct before approval

## Triggering And State

The asset-level behavior list should describe capability, not the current live state.

For decorative props, behavior can simply be always on.

For interactive assets such as doors, the runtime will eventually need a trigger or state model. A reasonable follow-up direction is:

```ts
type BehaviorTrigger =
  | { kind: 'auto' }
  | { kind: 'state'; state: 'open' | 'closed' | 'active' | 'inactive' };
```

That would let an asset declare:

```json
{
  "behaviors": [
    {
      "id": "main-door",
      "kind": "clip",
      "clipName": "DoorOpenClose",
      "playback": "once",
      "speed": 1,
      "trigger": { "kind": "state", "state": "open" }
    }
  ]
}
```

This should not be required for the first implementation of decorative spinning props, but the behavior model should leave room for it.

## Recommended Scope

### V1

Support:

- `behaviors` on `AssetVersion`
- `spin` behavior bound to named nodes
- admin review and preview support for `spin`
- client-side playback for `spin`
- automatic instancing bypass when behaviors are present

### V2

Add:

- `clip` behavior support
- `AnimationMixer` binding and playback
- admin preview support for clip playback
- optional trigger/state support for interactive assets like doors

## Design Principles

- Keep placement and behavior separate.
- Keep GLB structure authoritative for what can move.
- Keep behavior metadata asset-level, not baked into archetypes or placements.
- Use procedural behaviors for simple continuous motion.
- Use authored clips for complex motion.
- Treat behavior-enabled assets as non-instanced.
- Fail gracefully when node or clip bindings are missing.

## Practical Examples

### Simple Radar Tower

- GLB contains `Base`, `DishPivot`, `DishMesh`
- asset behavior config contains one `spin` behavior targeting `DishPivot`

### Dual Radar Tower

- GLB contains `Base`, `UpperDishPivot`, `LowerDishPivot`
- asset behavior config contains two `spin` behaviors with opposite `degreesPerSecond`

### Building With Door

- GLB contains a named animation clip `DoorOpenClose`
- asset behavior config contains one `clip` behavior targeting that clip
- later runtime state can choose when to play it
