# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Static entity Phase 1 foundations: shared `AssetVersion`, `Archetype`, and `StaticEntity` contracts plus supporting enums in `carrier-contracts`
- SQLite persistence for static entity catalog data via new `asset_versions`, `archetypes`, and `map_static_entities` tables in the API repository
- Repository-level static entity mutation helpers with shared map revision participation
- Static entity Phase 2 asset pipeline in the API: asset upload endpoints, original/runtime asset storage, async GLB processing, asset status reads, and runtime artifact fetches
- Static entity Phase 3 review workflow in the API and contracts: asset review/update routes, approval to `ready`, archetype creation routes, and ready-asset immutability enforcement
- Admin static-entities asset workspace at `/assets`, including upload, review, approval, and archetype-promotion flows
- Static entity Phase 4 archetype catalog support: global archetype list/get/update routes, map-scoped referenced-subset reads, and immutable asset-version binding enforcement
- Admin archetype catalog workspace at `/archetypes`, including global catalog browsing, lifecycle/status filtering, and metadata editing
- Admin 3D asset preview with runtime GLB inspection, synthetic terrain preview, real-map chunk terrain preview, footprint overlays, and grounding diagnostics
- Shared `carrier-preview` workspace package for preview model normalization, terrain mesh generation, and grounding math
- Low-poly GLB test fixtures for tank, truck, and building assets under `test-assets/`

### Changed

- Map chunk contracts now include placement-only `staticEntities` metadata on both JSON and binary chunk responses
- Binary chunk decoding now restores static entity metadata alongside height/material payloads
- Asset version repository support now includes direct reads and status/metadata updates for upload, processing, review, and failure transitions
- Static entity Phase 3 is now complete in the implementation plan, with admin review tooling and archetype-promotion support landed in the repo
- Static entity Phase 4 is now complete in the implementation plan, with archetype catalog reads/updates and referenced-subset resolution landed in the repo

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
