# Worktree Cleanup Constitution

## Core Principles

### I. Safety Before Convenience

Deletion MUST be conservative, previewed, and confirmed. A path is removable only
when Git proves that it is a registered worktree, it is clean, and its commit is
integrated into the selected base branch. Uncertain state MUST result in a skip,
never a forced deletion. Non-interactive deletion requires an explicit `-y` or
`--yes` flag.

### II. Effect-Native Architecture

Application behavior MUST be expressed with Effect v4. Expected failures MUST be
typed errors; Git, filesystem, terminal, and process concerns MUST be injectable
services or platform capabilities. Code MUST follow `repos/effect/LLMS.md`, the
vendored Effect source, and diagnostics from `@effect/tsgo`.

### III. Specification Is the Contract

User-visible behavior MUST be specified under `specs/` before implementation.
Changes to discovery, stale classification, confirmation, or deletion semantics
MUST update the specification and acceptance scenarios in the same change.

### IV. Real Git Integration Tests

Core decisions MUST have unit tests. Cleanup flows MUST also be exercised against
temporary real Git repositories and worktrees. Tests MUST cover dirty worktrees,
unmerged branches, default directory discovery, explicit directories, refusal,
confirmation bypass, and paths containing spaces.

### V. Small, Predictable CLI

The CLI MUST have stable exit codes, actionable human-readable output, and no
hidden network dependency. `worktree-cleanup` and `worktree-clean` MUST execute
the same program. New options require a demonstrated user need and documentation.

## Technical Constraints

- Runtime: supported Node.js LTS versions.
- Language: strict TypeScript using Effect v4 RC until v4 stable is released.
- Package manager: pnpm with a committed lockfile.
- LSP and lint diagnostics: `@effect/tsgo`, used instead of a parallel `tsgo`.
- Distribution: public npm package `@thanaen/worktree-cleanup` with both binary names.
- License: MIT.

## Quality Gates

Every change MUST pass formatting, Effect-aware diagnostics, TypeScript checking,
unit tests, integration tests, and a production build. CI MUST run on pull requests
and the default branch. Release automation MUST use npm trusted publishing or a
short-lived token and MUST NOT commit credentials.

## Governance

This constitution overrides conflicting implementation convenience. Amendments
require an explicit rationale, corresponding spec updates, and a version bump.
Code review MUST verify the deletion-safety invariants and quality gates.

**Version**: 1.0.0 | **Ratified**: 2026-08-13 | **Last Amended**: 2026-08-13
