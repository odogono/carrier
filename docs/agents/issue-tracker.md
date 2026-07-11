# Issue tracker: GitHub

Issues and PRDs for this repository live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
- **Read an issue**: `gh issue view <number> --comments`.
- **List issues**: `gh issue list --state open` with appropriate labels.
- **Comment on an issue**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

Git infers the repository from the `origin` remote when commands run in this clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

- **Map**: create one issue labelled `wayfinder:map`; it holds the destination, notes, decisions, fog, and scope boundaries.
- **Child ticket**: create an issue labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`, then attach it using GitHub's sub-issues endpoint.
- **Blocking**: use native issue dependencies. Add a `blocked by` relationship with `gh api --method POST repos/odogono/carrier/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-database-id>`.
- **Frontier**: open, unassigned child issues with no open native blockers; take the first map-order ticket.
- **Claim**: assign the ticket to the driving developer before investigation.
- **Resolve**: comment the resolution, close the ticket, then link it once from the map's Decisions so far section.
