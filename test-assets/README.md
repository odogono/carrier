# Test Assets

Small GLB fixtures for the static-entities asset upload and review workflow.

## Files

### `low-poly-tank.glb`

- Intended category: `industrial`
- Suggested archetype ID: `low-poly-tank`
- Suggested footprint: about `5m x 7m`
- Notes: tracked vehicle shape with turret and barrel; useful for checking grounding and yaw preview

### `low-poly-truck.glb`

- Intended category: `industrial`
- Suggested archetype ID: `low-poly-truck`
- Suggested footprint: about `4.5m x 8.5m`
- Notes: boxy cargo-truck silhouette; useful for longer rectangular footprint validation

### `low-poly-building.glb`

- Intended category: `building`
- Suggested archetype ID: `low-poly-building`
- Suggested footprint: about `9m x 7m`
- Notes: simple multi-storey concrete building; useful for larger static props and collision preview

## Usage

Upload these through the admin assets page at `/assets`.

The current API pipeline will:

1. store the uploaded source GLB
2. generate a normalized runtime artifact
3. derive candidate footprint/collision metadata
4. place the asset into `review`

These fixtures are intentionally small and low-detail so preview/debug iterations stay fast.
