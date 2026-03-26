# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Client Zarch ship mode: the app now starts in free landscape navigation, exposes an `Enter Ship` / `Exit Ship` HUD toggle, renders the original Zarch player ship model, and supports local single-player ship flight with gravity, thrust, terrain/water collision, crash particles, and respawn
- Client Zarch ship combat: ship mode now supports local bullet firing from the nose with inherited ship velocity, terrain/water impact detection, bullet visuals, and matching land/splash particle effects

### Changed

- Client Zarch runtime now separates navigation-camera state from player-ship state and adds continuous world-position terrain sampling for gameplay queries
- Ship mode camera now follows ship position without inheriting ship rotation

### Fixed

- Zarch ship control tuning: forward/back input now drives pitch on the correct axis and in the correct direction, and thrust now applies along the ship's upward axis rather than the nose direction
- Zarch ship spawn and rendering: respawn no longer immediately crash-loops after activation, and the ship model now renders correctly from below with corrected orientation and underside shading

## [0.5.0] - 2026-03-25

### Added

- Static entity Phase 1 foundations: shared `AssetVersion`, `Archetype`, and `StaticEntity` contracts plus supporting enums in `carrier-contracts`
- SQLite persistence for static entity catalog data via new `asset_versions`, `archetypes`, and `map_static_entities` tables in the API repository
- Repository-level static entity mutation helpers with shared map revision participation
- Static entity Phase 2 asset pipeline in the API: asset upload endpoints, original/runtime asset storage, async GLB processing, asset status reads, and runtime artifact fetches
- Static entity Phase 3 review workflow in the API and contracts: asset review/update routes, approval to `ready`, archetype creation routes, and ready-asset immutability enforcement
- Admin static-entities asset workspace at `/assets`, including upload, review, approval, and archetype-promotion flows
- Static entity Phase 4 archetype catalog support: global archetype list/get/update routes, map-scoped referenced-subset reads, and immutable asset-version binding enforcement
- Static entity Phase 5 API/read-model support: map-scoped static entity create/list/update/delete routes, map-wide resolved entity listing, archetype-based ID generation, and overlap-aware chunk inclusion using asset footprint geometry
- Admin archetype catalog workspace at `/archetypes`, including global catalog browsing, lifecycle/status filtering, and metadata editing
- Admin 3D asset preview with runtime GLB inspection, synthetic terrain preview, real-map chunk terrain preview, footprint overlays, and grounding diagnostics
- Shared `carrier-preview` workspace package for preview model normalization, terrain mesh generation, and grounding math
- Low-poly GLB test fixtures for tank, truck, and building assets under `test-assets/`
- Static entity Phase 6 admin editor workflow: place-entity mode, archetype catalog picker, entity outliner, single-entity inspector, bulk state/scale apply, duplication, delete confirmation, and canvas footprint/facing/rotate overlays
- Static entity editor helper coverage for overlay math, snapping, duplicate label generation, catalog/outliner filtering, grounding diagnostics, and editor snapshot entity state
- Static entity Phase 7 gameplay rendering in the client: referenced-archetype resolution, asset-version metadata reads, lazy runtime GLB loading, grounded placement rendering, and instancing-ready asset caching
- Static entity Phase 8 export snapshot support: exported map slices now snapshot intersecting static entities, persist deterministic referenced-archetype manifests with SHA-256 compatibility hashes, and expose export summary/detail metadata for future import validation
- Static entity Phase 9 Go engine integration in `apps/game`: exported-slice world loading from the API, manifest-backed static obstacle resolution, grounding/collision geometry parity, and spatial obstacle query support

### Changed

- Map chunk contracts now include placement-only `staticEntities` metadata on both JSON and binary chunk responses
- Binary chunk decoding now restores static entity metadata alongside height/material payloads
- Asset version repository support now includes direct reads and status/metadata updates for upload, processing, review, and failure transitions
- Static entity Phase 3 is now complete in the implementation plan, with admin review tooling and archetype-promotion support landed in the repo
- Static entity Phase 4 is now complete in the implementation plan, with archetype catalog reads/updates and referenced-subset resolution landed in the repo
- Static entity Phase 5 is now complete in the implementation plan, with public CRUD/list routes, active-archetype placement enforcement, overlap-aware chunk reads, and revision-bearing mutation responses landed in the repo
- Static entity Phase 7 is now complete in the implementation plan, with gameplay-side archetype resolution, per-asset runtime caching, active-only placement rendering, and optional instancing support landed in the repo
- Admin map editor data loading now hydrates map static-entity placements, referenced archetypes, active placeable archetypes, and asset-version metadata for entity overlays and diagnostics
- Admin map editor interaction state now tracks entity selection and draft edits alongside polygon/control-point workflows while keeping terrain and entity selections mutually exclusive
- Exported map metadata now returns static-entity manifest summaries in list responses and full manifest detail on export/detail reads, and the admin map detail page surfaces the snapshot counts and manifest hash
- Game server startup now loads a required exported map slice via `api-base-url` and `export-map-id` before serving websocket traffic

## [0.4.0] - 2026-03-22

### Added

- Playwright E2E for the admin app (`bun run test:e2e`), including smoke coverage and map editor polygon drag flows; Playwright starts API + admin with an in-memory API database for isolated runs

### Changed

- Admin map editor `select` mode now supports direct polygon selection, marquee multi-selection, immediate vertex editing, and drag-moving selected polygons
- Admin map editor polygon dragging now moves control points contained within the polygon at drag start and persists those updates through undo/redo
- Admin map editor `pan` mode is now view-only and no longer allows selecting authored polygons while panning
- Admin map editor UI refreshed (toolbar, sidebar, canvas, and shared UI primitives)

### Fixed

- Admin OpenAPI client now resolves `PUBLIC_API_URL` in dev and Playwright by reading `process.env` directly so Bun's `PUBLIC_*` inlining applies (prevents silent fallback to the default API port)

## [0.3.0] - 2026-03-19

### Added

- Undo/redo support in the admin map editor (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z) with toolbar buttons
- Jotai-based editor snapshot state management with history tracking
- History entries for polygon CRUD, control point CRUD, boolean operations, vertex edits, and drag interactions
- Server-side replay for undo/redo of remote mutations (create, update, delete, boolean)

### Changed

- Editor UI state (tool, selections, drafts) moved from `useState` to Jotai atoms via `EditorSnapshot`
- Setter signatures in canvas/sidebar components updated to support optional history recording
- History capped at 50 entries to bound memory usage
