# Plan: Client-Side Static Entity Placement in Edit Mode

## Summary

Extend the current client edit mode from terrain-only to a two-mode editor: `Terrain` and `Entities`.

Entity mode should stay lightweight and immediate. The client remains a fast in-world placement tool, not a second copy of the admin editor.

Chosen defaults:
- Scope: placement-first, with light post-place editing
- Persistence: immediate API save per action
- UI shape: compact HUD plus contextual drawer
- Catalog scope: all active archetypes

## Key Changes

### Editor model and state

- Replace the current terrain-only edit state with a top-level editor mode switch: `terrain | entities`.
- Add a dedicated client entity editor state alongside `ZarchTileEditState` with:
  - `enabled`
  - `tool: "place" | "select"`
  - `activeArchetypeId`
  - `selectedEntityId`
  - `hoveredEntityId`
  - `catalogOpen`
  - `catalogSearch`
  - `catalogCategory`
  - `placementPreview`
  - `pendingAction`
  - `error`
- Keep terrain draft state and entity editor state isolated so mode switches do not clear unsaved terrain edits or lose entity selection unexpectedly.

### Client API and data flow

- Expose a client-consumable archetype catalog for placement. Preferred options:
  - reuse `listArchetypes({ status: "active" })`, or
  - add a thin `listPlaceableArchetypes` route if the client should not consume the full admin-facing shape.
- Reuse existing immediate entity mutations:
  - `createStaticEntity`
  - `updateStaticEntity`
  - `deleteStaticEntity`
- After successful entity mutation, invalidate:
  - map chunk queries for the current map
  - map metadata query for the current map if revision changes are surfaced there
  - referenced archetypes for the current map
  - the active archetype catalog query
- Handle revision conflicts the same way terrain editing already does:
  - show a clear conflict message
  - reload chunk/map state
  - keep the user in entity mode so they can retry

### In-client UI

- Keep the existing top-left edit HUD as the main control surface.
- Add a top-level mode strip to the HUD:
  - `Terrain`
  - `Entities`
- When `Terrain` is active, preserve the current terrain tools and behavior.
- When `Entities` is active, swap the terrain controls for entity controls:
  - `Place`
  - `Select`
  - `Catalog`
  - `Rotate -`
  - `Rotate +`
  - `Delete`
- Only enable rotate/delete when an entity is selected.
- Add a narrow right-side drawer that opens only in entity mode. It contains:
  - search input
  - category tabs or compact filter chips
  - scrollable archetype list
  - active archetype summary at the top or bottom
- Archetype list rows/cards should show:
  - display name
  - category
  - footprint dimensions if available
  - “Used on map” marker when already referenced
- Drawer behavior:
  - opening the drawer does not pause the scene
  - selecting an archetype immediately makes it the active placement archetype
  - drawer can stay open for browsing or collapse for maximum viewport space

### Concrete UI flow

#### 1. Entering entity editing

- User clicks `Enter Edit`.
- User switches from `Terrain` to `Entities`.
- HUD defaults to `Place` if an archetype is already active, otherwise it opens the catalog drawer.

#### 2. Choosing an archetype

- User opens the catalog drawer from the HUD.
- User filters by search/category.
- User clicks an archetype row.
- HUD shows the selected archetype as a chip/button so the current placement target is always visible even when the drawer is closed.

#### 3. Placement preview

- Moving the pointer over the terrain shows a ghost preview at the hit point.
- Preview uses real terrain grounding logic, matching existing static-entity placement rules.
- Preview visuals:
  - loaded asset ghost if the model is already resident
  - otherwise a footprint box + facing arrow placeholder
- Preview colors:
  - neutral/green when placeable
  - amber/red when invalid because grounding failed or terrain data is unavailable
- HUD status line explains invalid placement in plain text.

#### 4. Placement action

- In `Place` mode, click terrain to place immediately.
- On success:
  - entity becomes selected
  - current archetype remains active for repeated placement
  - status line briefly confirms placement
- On failure:
  - keep current archetype and placement mode active
  - show inline error text in HUD

#### 5. Selection action

- In `Select` mode, clicking an entity selects it.
- Hovering an entity shows a lighter outline; selection shows a stronger outline and facing indicator.
- Clicking empty terrain clears selection.

#### 6. Light post-place editing

- v1 post-place editing is intentionally small:
  - rotate selected entity left/right in fixed yaw increments
  - delete selected entity
- No drag-to-move, scale edit, state edit, or archetype swap in v1.
- Selected entity summary in HUD should include:
  - label or ID
  - archetype name
  - yaw
  - validity indicator if grounding is invalid

### Scene interaction and controls

- Extend hit-testing beyond terrain tiles to support static-entity picking.
- In entity mode, pointer priority becomes:
  1. entity hit for selection
  2. terrain hit for placement preview
- Preserve the current rule that edit mode suppresses normal navigation/ship interactions.
- Keep interaction pointer-first and simple:
  - no transform gizmo
  - no world-space drag handles
  - no admin-style inspector sidebar
- Keyboard shortcuts in entity mode:
  - `Esc`: clear selection or close drawer
  - `R`: rotate selected entity clockwise
  - `Shift+R`: rotate selected entity counter-clockwise
  - `Delete` / `Backspace`: delete selected entity
  - `/`: focus archetype search if the drawer is open

## Public Interfaces / Contracts

- New or newly client-consumed archetype listing for placement:
  - either `listArchetypes(status=active)`
  - or `listPlaceableArchetypes`
- No new static-entity schema is required for this placement-first pass.
- No runtime chunk payload changes are required if entity CRUD continues to invalidate chunk queries and the renderer keeps reading refreshed chunk data.

## Test Plan

- Unit tests for entity editor reducer/state transitions:
  - mode switching
  - tool switching
  - archetype selection
  - selection clearing
  - pending/error states
- Scene interaction tests:
  - entity hit-testing beats terrain placement when clicking an entity
  - placement preview appears only in entity `Place` mode
  - clicking empty terrain clears selection in `Select` mode
- Mutation/invalidation tests:
  - successful create invalidates chunk and archetype queries
  - successful rotate and delete invalidate/render correctly
  - revision conflict shows recoverable error state
- UI tests:
  - HUD mode switch swaps terrain controls for entity controls
  - drawer search/filter changes visible archetypes
  - rotate/delete buttons enable only when an entity is selected
- Manual scenarios:
  - place multiple entities quickly with the same archetype
  - place an archetype not yet referenced by the map
  - rotate then delete a selected entity
  - switch between terrain and entity modes without losing terrain draft edits
  - close and reopen the drawer while keeping the active archetype

## Assumptions

- Client edit mode is desktop keyboard/mouse first; controller-first editing is out of scope.
- Archetypes are already curated enough in admin that exposing all active archetypes in the client is acceptable.
- v1 goal is direct map prop placement inside the live client, not parity with the admin editor.
- Terrain edits continue to use Save/Cancel drafts; entity edits remain immediate to avoid mixing two bulk-commit systems in the same first pass.
