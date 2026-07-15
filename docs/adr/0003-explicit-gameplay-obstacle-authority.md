# ADR 0003: Explicit Gameplay-Obstacle Authority

## Status

Accepted.

## Context

Collision class names described assets but did not provide an explicit policy
for whether a placement blocks gameplay. Inferring solidity from names would
couple simulation behavior to catalog wording and make old exports unstable.

## Decision

Asset versions carry immutable Obstacle Mode `solid` or `none`. A placement is
an Authored Obstacle only when it is active, its shared grounding result is
valid, and its asset version is `solid`. New and backfilled database records
default to `solid`.

Export manifests persist Obstacle Mode. A legacy immutable export that omits it
resolves to `solid` at read time; it is not rewritten and its stored hash is not
changed. Collision Class remains descriptive metadata and is not authority.

## Consequences

Admin review, TypeScript contracts, export normalization, browser collision,
and Go world indexing share one explicit rule. Decorative authored assets can be
made non-blocking without encoding policy in their names.
