# Feature Specification: Safe Worktree Cleanup

**Feature Branch**: `001-core-cleanup`
**Created**: 2026-08-13
**Status**: Implementing
**Input**: Safely discover and clean stale Git worktrees with smart defaults,
an explicit directory, confirmation, and a non-interactive override.

## User Scenarios & Testing

### User Story 1 - Clean stale agent worktrees (Priority: P1)

As a developer at a repository root, I run `worktree-cleanup`. The command finds
existing `worktrees`, `.claude/worktrees`, and `.codex/worktrees` directories,
shows only worktrees that are safe to remove, asks for confirmation once, and
removes the confirmed worktrees through Git.

**Independent Test**: Create a repository with one merged clean worktree and one
unmerged worktree below a default root. Confirm cleanup. Only the merged clean
worktree is removed.

**Acceptance Scenarios**:

1. **Given** a clean registered worktree whose HEAD is an ancestor of the base
   branch, or whose attached branch would make no content change when merged
   into the base branch, **When** cleanup is confirmed, **Then** Git removes its
   directory and registration but keeps its branch.
2. **Given** dirty, locked, unmerged, current, or unregistered directories,
   **When** cleanup runs, **Then** they are not offered for deletion.
3. **Given** at least one candidate and no `--yes`, **When** the user refuses,
   **Then** no directory is removed and the command exits successfully.

---

### User Story 2 - Target a specific worktree root (Priority: P1)

As a developer, I pass `--dir <path>` to inspect a particular worktree root,
including a relative path or a path containing spaces.

**Independent Test**: Put removable worktrees in a default root and an explicit
root. Run with `--dir`. Only the explicit root is inspected.

**Acceptance Scenarios**:

1. **Given** `--dir custom`, **When** default roots also exist, **Then** default
   discovery is completely disabled.
2. **Given** a missing or non-directory `--dir`, **When** the command runs,
   **Then** it prints an actionable error, removes nothing, and exits non-zero.

---

### User Story 3 - Run safely in automation (Priority: P2)

As a developer or CI job, I pass `-y` or `--yes` to accept the displayed plan
without an interactive prompt.

**Independent Test**: Run against a removable worktree with stdin detached and
`--yes`; removal succeeds. Repeat without `--yes`; nothing is removed.

**Acceptance Scenarios**:

1. **Given** `--yes`, **When** candidates exist, **Then** the command removes
   them without reading stdin.
2. **Given** non-interactive stdin without `--yes`, **When** candidates exist,
   **Then** the command refuses deletion with a non-zero exit.
3. **Given** no candidates, **When** any invocation runs, **Then** it does not
   prompt and exits successfully.

### Edge Cases

- Multiple smart-default roots may exist; all are inspected and results are
  de-duplicated by canonical worktree path.
- Worktree paths may contain spaces and non-ASCII characters; no shell command
  interpolation is used.
- Symlinks, nested descendants, bare repositories, malformed `.git` pointers,
  and paths whose Git state cannot be proven are skipped.
- A detached worktree is removable only when its HEAD is reachable from the
  detected base ref.
- A clean merge whose result has the same tree as the base proves that an
  attached branch's content is already integrated after a squash merge or
  rebase. This fallback MUST fail closed when Git cannot perform the merge,
  when a custom merge driver is configured, or when the branch no longer
  points at the assessed HEAD.
- The main worktree and the worktree executing the command are never removed.
- A candidate that becomes dirty or unmerged between preview and deletion is
  revalidated and skipped.
- Partial removal failures are reported per path and make the command fail after
  processing remaining independently safe candidates.

## Requirements

### Functional Requirements

- **FR-001**: The package MUST expose equivalent `worktree-cleanup` and
  `worktree-clean` binaries.
- **FR-002**: Without `--dir`, the command MUST inspect each existing directory
  from `worktrees`, `.claude/worktrees`, and `.codex/worktrees` relative to the
  invocation directory.
- **FR-003**: `--dir <path>` MUST select exactly that root and ignore all smart
  defaults.
- **FR-004**: Only immediate child directories of selected roots MAY be treated
  as worktree candidates.
- **FR-005**: A removable worktree MUST be registered by Git, present, not a
  symlink, not locked, not the repository's main worktree, not the invocation
  worktree, and clean according to `git status --porcelain --untracked-files=all`.
- **FR-006**: The candidate HEAD MUST either be an ancestor of a trusted base
  ref, or belong to an attached branch whose simulated merge into the base is
  clean and produces exactly the base tree. The content-equivalence fallback
  MUST NOT run for detached worktrees, custom merge-driver configuration, a
  branch ref that differs from the assessed HEAD, or a Git version without the
  required merge-tree capability.
- **FR-007**: Base-ref detection MUST prefer `refs/remotes/origin/HEAD`, then
  local `main`, then local `master`, then the main worktree's current branch.
  If none can be proven, the worktree MUST be skipped.
- **FR-008**: The command MUST display selected roots, removable worktrees, and
  the reason for every skipped worktree before confirmation.
- **FR-009**: The command MUST request a single default-negative confirmation
  before any deletion unless `-y` or `--yes` is present.
- **FR-010**: Removal MUST use `git worktree remove -- <path>` without `--force`
  and MUST NOT delete branches.
- **FR-011**: Each candidate MUST be revalidated immediately before removal.
- **FR-012**: No candidates and no default roots MUST both be safe successful
  no-op outcomes with clear output.
- **FR-013**: Invalid input, unsafe non-interactive use, Git discovery failure,
  and removal failure MUST produce non-zero exit status and actionable output.
- **FR-014**: The implementation MUST not require network access at runtime.

### Key Entities

- **TargetRoot**: A canonical directory selected explicitly or by smart defaults.
- **RegisteredWorktree**: Git's authoritative path, HEAD, branch/detached state,
  lock state, and main-worktree identity.
- **Assessment**: A candidate plus either `removable` or a stable skip reason.
- **CleanupPlan**: De-duplicated roots and assessments shown to the user.
- **CleanupResult**: Removed paths, skipped-on-revalidation paths, and failures.

## Success Criteria

- **SC-001**: Integration tests prove that no dirty, locked, unmerged, current,
  main, or unregistered directory is removed.
- **SC-002**: All documented invocation forms work on Linux, macOS, and Windows
  runners supported by the project.
- **SC-003**: A repository containing 100 registered worktrees is assessed in
  under five seconds on a local filesystem, excluding user confirmation time.
- **SC-004**: `pnpm check` validates formatting, Effect-aware diagnostics,
  TypeScript, tests, and build from a clean checkout.
- **SC-005**: Integration tests prove that fully squash-merged and rebased
  attached branches are removable, while partially integrated, modified,
  reverted, conflicting, detached, and custom-driver cases remain skipped.

## Assumptions

- "Stale" means safely integrated and no longer carrying local filesystem work;
  age alone never makes a worktree removable.
- Worktree roots contain one directory per worktree as immediate children.
- The npm registry canonicalizes package scopes to lowercase, so the publishable
  package name is `@thanaen/worktree-cleanup`.
