# Implementation Plan: Safe Worktree Cleanup

**Branch**: `001-core-cleanup` | **Date**: 2026-08-13 | **Spec**: `spec.md`

## Summary

Build a small Node.js CLI with Effect v4 RC. Use Effect's unstable CLI, process,
filesystem, path, and terminal capabilities; parse Git's porcelain formats;
derive a conservative cleanup plan; confirm once; and revalidate before each
`git worktree remove`. Publish both binary names from one ESM package.

## Technical Context

- **Language/Version**: TypeScript 7, strict ESM, Node.js >=22
- **Primary Dependencies**: `effect@4.0.0-rc.108`, `@effect/platform-node`
- **CLI/LSP**: `effect/unstable/cli`, `@effect/tsgo`
- **Testing**: Vitest 4 and `@effect/vitest`, temporary real Git repositories
- **Build**: `tsdown`, declarations and source maps
- **Package Manager**: pnpm 10
- **Target Platforms**: Linux, macOS, Windows

## Constitution Check

- Safety is fail-closed and revalidated: PASS.
- Effect-native services and typed errors: PASS.
- Spec precedes code: PASS.
- Real Git integration coverage: REQUIRED before completion.
- Two stable binary names and no network runtime dependency: PASS.

## Project Structure

```text
src/
  cli.ts
  domain.ts
  errors.ts
  git.ts
  cleanup.ts
  main.ts
tests/
  domain.test.ts
  integration/cleanup.test.ts
specs/001-core-cleanup/
repos/                 # Effect Git subtree, read-only reference
```

## Design

1. The CLI resolves the invocation directory and options into target roots.
2. The filesystem service enumerates immediate, non-symlink child directories.
3. The Git service groups candidates by common repository and parses
   `git worktree list --porcelain -z` into registered worktrees.
4. The assessor checks identity, lock, cleanliness, base ref, and ancestry.
5. The renderer prints the complete plan. The prompt is default-negative.
6. Confirmed candidates are reassessed and removed through their repository.
7. The command reports a summary and fails if an operational removal failed.

Git commands are executed as argv arrays with an explicit `cwd`; no shell is
involved. Domain assessment stays pure where possible. Platform services are
provided only at the application entry point.

## Release and CI

- PR/default-branch CI runs on Ubuntu, macOS, and Windows with Node 22 and 24.
- A release workflow publishes on GitHub release using npm provenance.
- Dependabot maintains npm and Actions dependencies.
- Publishing remains disabled until npm ownership/trusted publishing is set up.
