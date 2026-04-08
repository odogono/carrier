# Lua Scripting Expansion Plan

## Objective

Build on the first Lua stage in `apps/game` and turn it into a durable gameplay system rather than a narrow trigger demo.

Success means:

- scripts remain sandboxed and operationally safe
- gameplay code can add new scripted features without widening the trusted surface ad hoc
- authored maps can eventually reference scripted behavior through normal API/export flows
- clients can observe the results of scripted gameplay through explicit replicated state, not hidden server-only side effects

## Current Baseline

The current stage is intentionally small and useful:

- the game server boots a restricted `gopher-lua` runtime at startup
- trigger definitions are loaded from a repo-owned JSON file keyed by exported map id
- each trigger has a box volume and a Lua module returning callback functions
- supported callbacks are `on_init`, `on_enter`, `on_leave`, and `on_timer`
- scripts can read params, store small persisted key/value state, schedule timers, log, read time, and request host RNG
- scripts are reloaded in dev mode when watched files change
- a failing trigger is disabled without taking down the whole runtime

This is enough for proximity triggers and simple stateful logic, but it is not yet a general gameplay scripting layer.

## Current Constraints

The current implementation also makes the expansion boundaries clear:

- scripts only observe player camera position updates through `handler.PlayerInputObserver`
- scripts cannot query terrain, static entities, map metadata, or other players
- scripts cannot issue gameplay actions back into the world or network protocol
- triggers are repo-owned files, not authored content managed through API/admin/export flows
- persisted state supports only scalar JSON-compatible values
- there is no notion of script API versioning, script validation, or preflight compilation at content-publish time

These constraints are good for stage one. Future work should preserve that safety posture while widening capability in deliberate layers.

## Commands

- Build game server: `just --justfile apps/game/Justfile build`
- Test game server: `just --justfile apps/game/Justfile test`
- Run game server locally: `just --justfile apps/game/Justfile run --export-map-id <id>`

## Boundaries

- Always: keep Lua sandboxed, keep script effects deterministic where practical, and add tests for every new host API
- Ask first: adding unrestricted file/network/process access to Lua, or making scripts authoritative for security-sensitive state
- Never: allow scripts to call arbitrary Go functions or bypass the replication protocol with hidden side effects

## Expansion Principles

1. Prefer host-owned APIs over exposing engine internals directly to Lua.
2. Separate read access from write access. Query surfaces can grow earlier and faster than mutation surfaces.
3. Make script-produced gameplay effects explicit as commands/events so they can be tested, logged, and replicated.
4. Keep authored content and repo-owned developer scripts on the same runtime model, but not the same trust model.
5. Do not couple script rollout to client behavior until the server has a stable replicated state contract.

## Phased Plan

### Phase 1: Harden The Scripting Platform

Goal: make the current runtime safe to extend.

Additions:

- define a versioned host API surface, for example `ctx.api_version()`
- add config validation and startup preflight that compiles every configured script before the server begins accepting clients
- improve error reporting so logs include script file, trigger id, callback name, and map id consistently
- add limits around timer counts, persisted-state size, and reload churn in dev mode
- formalize the allowed persisted-state types and reject oversized or deeply nested values explicitly
- document the scripting contract with a small set of canonical examples

Why first:

- every later phase depends on this layer for operability
- without hardening, each new capability increases debugging cost faster than gameplay value

Verification:

- runtime tests for preflight failures, limit enforcement, and callback-specific errors
- server startup tests proving bad script/config input fails fast

### Phase 2: Expand Read-Only Gameplay Context

Goal: let scripts inspect the world before they can mutate it.

Additions:

- expose actor metadata beyond `{ id, x, z }`, starting with yaw and velocity when available
- add read-only map queries such as map id, exported bounds, and finite/wrap metadata
- expose terrain queries needed by gameplay, such as sampled height and water/cliff classification
- expose static obstacle and authored-entity lookup using the existing world indexes
- add occupancy/query helpers for trigger volumes so scripts do not need to reconstruct overlap state manually
- broaden lifecycle events to include player join/leave and possibly server/map startup hooks

Suggested API shape:

- `ctx:get_actor(id)`
- `ctx:query_players_in_radius(x, z, radius)`
- `ctx:sample_height(x, z)`
- `ctx:is_water(x, z)`
- `ctx:query_static_entities_in_radius(x, z, radius)`

Why this phase comes before mutations:

- it enables richer trigger logic while keeping failure blast radius low
- it clarifies what data the gameplay engine can already answer efficiently

Verification:

- deterministic unit tests around world-query wrappers
- parity tests for shared gameplay rules already planned elsewhere, especially terrain and obstacle semantics

### Phase 3: Introduce A Script Action Queue

Goal: allow Lua to affect gameplay without granting direct engine mutation.

Additions:

- define a host-owned action model emitted by scripts, for example:
  - set trigger-local flags
  - send HUD/system messages
  - award score or mission progress
  - toggle an interactive entity state
  - spawn non-authoritative effects or markers
- queue those actions during callback execution and apply them after the callback returns
- validate every action against world state before commit
- log and meter action production for debugging

Key design decision:

- scripts should request actions, not mutate engine structs directly
- this preserves a clean audit boundary and creates the future replication seam

Verification:

- tests proving invalid actions are rejected without crashing or corrupting state
- tests proving action ordering is stable across timers and overlapping triggers

### Phase 4: Move From Repo-Owned Triggers To Authored Content

Goal: make scripting part of the map/content pipeline instead of a local developer-only feature.

Additions:

- define contracts for scripted trigger records in `packages/contracts`
- add API persistence for trigger volumes, params, enabled state, and referenced script asset/version
- include scripted trigger manifests in exported map data
- load trigger definitions from exported content in the game server instead of local JSON files
- keep repo-owned scripts as a dev/test path, but make production maps consume exported artifacts

Likely content model:

- `script asset/version` for Lua source plus validation status
- `map scripted trigger` for placement/params/bindings
- optional `runtime entity` linkage for scripts that target stable world objects

Why this matters:

- without authored content integration, every meaningful use of Lua becomes a server deploy task instead of a map/content task

Verification:

- contract tests in TypeScript for validation/serialization
- API repository tests for CRUD and export inclusion
- game loader tests for exported scripted trigger manifests

### Phase 5: Connect Scripts To Interactive World State

Goal: support real gameplay interactions such as doors, objectives, alarms, and moving props.

Additions:

- add stable runtime ids for interactive entities that scripts can address safely
- expose entity state reads and constrained state writes through the action queue
- align with the existing asset behavior direction so scripts can activate behavior states instead of inventing bespoke animation hooks
- add mission-style primitives such as objective state, counters, and named world flags

This phase should align with [asset-behaviors-plan.md](/Users/alex/work/carrier/docs/asset-behaviors-plan.md):

- asset versions describe capability
- runtime state decides whether a behavior is active
- scripts should change state, not manipulate render nodes

Verification:

- tests proving entity state changes survive reload/restart where intended
- integration tests for interactive props driven by trigger entry, timers, and state transitions

### Phase 6: Replicate Script Outcomes To Clients

Goal: make server-side scripted gameplay visible and authoritative to clients.

Additions:

- extend the protocol with explicit replicated state/events for script-driven outcomes
- decide which state belongs in snapshots versus transient events
- ensure reconnecting clients can reconstruct the current scripted world state
- keep client runtime passive at first: observe server state rather than re-running authoritative Lua locally

Likely protocol additions:

- replicated interactive entity state
- mission/objective state
- transient announcements or effects

Why this is later:

- replication should follow a stable server-side action/state model, not precede it

Verification:

- protocol tests for encoding/decoding
- reconnect tests proving persistent scripted state is rehydrated correctly
- end-to-end tests for script-triggered world changes becoming visible to clients

### Phase 7: Authoring, Tooling, And Ops

Goal: make the system usable by humans other than the person editing Go files.

Additions:

- admin UI for viewing scripted triggers, params, bounds, and validation errors
- lint/test tooling for Lua scripts, including a host-side test harness for callback execution
- map-preview or simulation tooling that can exercise scripted triggers without running a full multiplayer session
- runtime metrics for trigger executions, disabled triggers, timer counts, and action rejection counts

Verification:

- admin tests for trigger CRUD and validation display
- smoke tests for scripted-content export/import flows

## Recommended Delivery Order

1. Phase 1 and the read-only subset of Phase 2.
2. Phase 3 before any serious gameplay mutations.
3. Phase 4 once at least one meaningful scripted mechanic exists and the data model is clear.
4. Phase 5 for interactive assets and mission logic.
5. Phase 6 only after the server-side action/state model is stable.
6. Phase 7 continuously, but especially before content authors depend on the system.

## Immediate Next Slice

If the goal is to keep momentum from the current first stage, the next concrete slice should be:

1. Harden startup validation and diagnostics.
2. Add read-only terrain and static-entity query APIs to Lua.
3. Define a minimal script action queue with one or two safe actions, such as posting a server event or toggling a named world flag.
4. Write one exemplar gameplay feature using those APIs, such as a trigger that opens a door or marks an objective when the player enters an area.

That slice proves the architecture before the team commits to authored-content persistence and protocol replication.

## Risks

- If scripts get direct write access too early, debugging and replication will become unmanageable.
- If authored-content integration lands before the runtime contract is stable, the schema will churn.
- If client-visible behavior ships before server-side action/state boundaries are explicit, later networking work will require redoing the model.
- If interactive asset state is modeled separately from the existing asset behavior plan, the codebase will fork into incompatible systems.

## Open Questions

- Should Lua remain server-only for authority forever, or is there a later non-authoritative client-side scripting role?
- Will script assets be stored as raw Lua source, compiled bytecode, or source plus build metadata?
- Which gameplay state must survive restart, and which should remain ephemeral?
- Does map export need script source embedded, referenced by hash, or bundled as separate artifacts?
- Should script actions be transactional per callback, or best-effort per emitted command?
