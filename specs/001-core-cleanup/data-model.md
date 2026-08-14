# Data Model

## TargetRoot

- `path`: canonical absolute path
- `source`: `explicit | worktrees | claude | codex`

## RegisteredWorktree

- `path`: canonical absolute path
- `head`: full commit OID
- `branch`: optional full ref
- `detached`: boolean
- `lockedReason`: optional string
- `prunableReason`: optional string
- `isMain`: boolean derived from the first porcelain record

## SkipReason

Stable variants: `not-registered`, `symlink`, `main-worktree`, `current-worktree`,
`locked`, `dirty`, `base-ref-unknown`, `not-merged`, `git-error`, `outside-root`.

## Assessment

- `candidatePath`
- `repositoryPath`
- `worktree`: optional `RegisteredWorktree`
- `integrationEvidence`: optional `ancestor | content-equivalent`
- `status`: `removable | skipped`
- `reason`: optional `SkipReason`
- `detail`: optional human-readable context

## CleanupResult

- `removed`: paths successfully removed
- `skipped`: paths invalidated during revalidation
- `failures`: paths plus typed operational errors
