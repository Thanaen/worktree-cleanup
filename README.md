# worktree-cleanup

Safely remove stale Git worktrees created by coding agents and other tooling.
The command is conservative: a worktree must be registered, clean, unlocked,
and already merged into a trusted base branch before it can be offered for
deletion.

> The npm package will be published as `@thanaen/worktree-cleanup`. npm package
> scopes are lowercase even though the GitHub account is displayed as Thanaen.

## Install

```bash
pnpm add -g @thanaen/worktree-cleanup
```

## Usage

```bash
# Inspect smart defaults below the current directory
worktree-cleanup

# Equivalent shorter executable
worktree-clean

# Inspect exactly one root and ignore smart defaults
worktree-cleanup --dir ../agent-worktrees

# Approve the displayed plan without prompting
worktree-cleanup --yes
```

Smart defaults are `worktrees`, `.claude/worktrees`, and `.codex/worktrees`.
Only their immediate child directories are inspected.

The command never force-removes a worktree and never deletes its branch. It
asks once before deletion unless `-y` or `--yes` is passed. If stdin is not an
interactive terminal, `--yes` is required.

## What counts as stale?

A worktree is removable only when all of these are true:

- Git lists it as a registered worktree.
- It is not the main or currently executing worktree.
- It is unlocked and clean, including untracked files.
- Its HEAD is an ancestor of the detected base ref.

Base detection prefers `origin/HEAD`, then local `main`, local `master`, and
finally the main worktree's current branch. Uncertain state is always skipped.
Every candidate is revalidated immediately before removal.

## Development

This repository follows GitHub Spec Kit. The feature contract is in
`specs/001-core-cleanup/`. Effect's official source is vendored under `repos/`
as a Git subtree and used as read-only reference material.

```bash
pnpm install
pnpm check
```

To update the Effect reference subtree:

```bash
git subtree pull --prefix=repos https://github.com/Effect-TS/effect.git main --squash
```

## License

MIT
