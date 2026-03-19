# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
