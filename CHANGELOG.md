# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Static entity Phase 1 foundations: shared `AssetVersion`, `Archetype`, and `StaticEntity` contracts plus supporting enums in `carrier-contracts`
- SQLite persistence for static entity catalog data via new `asset_versions`, `archetypes`, and `map_static_entities` tables in the API repository
- Repository-level static entity mutation helpers with shared map revision participation
- Static entity Phase 2 asset pipeline in the API: asset upload endpoints, original/runtime asset storage, async GLB processing, asset status reads, and runtime artifact fetches

### Changed

- Map chunk contracts now include placement-only `staticEntities` metadata on both JSON and binary chunk responses
- Binary chunk decoding now restores static entity metadata alongside height/material payloads
- Asset version repository support now includes direct reads and status/metadata updates for upload, processing, review, and failure transitions

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
