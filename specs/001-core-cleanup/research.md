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
that a candidate commit is included in the base ref. `git worktree remove`
without force performs Git's own final safety check.

## Default roots

Claude Code uses `.claude/worktrees`; general tooling often uses `worktrees`.
Codex worktree layout is not a public stable contract, so `.codex/worktrees` is
supported as a pragmatic default without treating its presence as proof that a
child is safe.

## Packaging

npm package names and scopes are lowercase. The manifest therefore uses
`@thanaen/worktree-cleanup`, while documentation may preserve the display name
Thanaen. Both executable keys point to the same built entry point.
