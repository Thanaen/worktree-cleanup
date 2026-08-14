# Research

## Effect v4

Use Effect v4 RC from npm and `effect/unstable/cli`. The official v4 source is
vendored as a squashed Git subtree under `repos/`. `repos/LLMS.md` is the coding
source of truth. `@effect/tsgo` provides the sole TypeScript language server and
Effect-aware diagnostics.

## Git safety model

`git worktree list --porcelain -z` is authoritative for registration, HEAD,
branch, detached state, lock state, and prunable metadata. `git status --porcelain
--untracked-files=all` proves cleanliness. `git merge-base --is-ancestor` proves
that a candidate commit is included in the base ref. When ancestry differs after
a rebase or squash merge, `git merge-tree --write-tree` can simulate merging the
candidate into the base without touching either worktree. A clean result whose
tree is identical to the base tree proves that the candidate branch contributes
no remaining content. This fallback is limited to attached branches whose ref
still points at the assessed HEAD, so removing the worktree does not make the
original commits unreachable. It is disabled when custom merge drivers are
configured and fails closed on Git versions older than 2.38, which do not
provide the required `merge-tree` mode. `git cherry` was rejected because
patch-id matching recognizes rebased commits but not a multi-commit squash.
`git worktree remove` without force performs Git's own final safety check.

## Default roots

Claude Code uses `.claude/worktrees`; general tooling often uses `worktrees`.
Codex worktree layout is not a public stable contract, so `.codex/worktrees` is
supported as a pragmatic default without treating its presence as proof that a
child is safe.

## Packaging

npm package names and scopes are lowercase. The manifest therefore uses
`@thanaen/worktree-cleanup`, while documentation may preserve the display name
Thanaen. Both executable keys point to the same built entry point.
