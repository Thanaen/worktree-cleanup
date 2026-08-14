# worktree-cleanup

Clean up stale Git worktrees left behind by coding agents and other tooling,
without putting uncommitted work at risk.

`worktree-cleanup` first shows exactly what it found and why each directory is
removable or skipped. Nothing is deleted until you confirm the plan.

## Install

Requires Git and Node.js 22 or newer.

```bash
npm install --global @thanaen/worktree-cleanup
```

Also available with pnpm or Bun:

```bash
pnpm add --global @thanaen/worktree-cleanup
bun add --global @thanaen/worktree-cleanup
```

## Quick start

Run the command from your project directory:

```bash
worktree-cleanup
```

The shorter `worktree-clean` command does the same thing.

By default, the CLI looks for these directories in the current directory:

- `worktrees`
- `.claude/worktrees`
- `.codex/worktrees`

Only immediate child directories are inspected. If you keep worktrees
somewhere else, select that directory explicitly:

```bash
worktree-cleanup --dir ../agent-worktrees
```

Using `--dir` disables the smart defaults. To approve the displayed plan
without an interactive prompt, pass `-y` or `--yes`:

```bash
worktree-cleanup --dir ../agent-worktrees --yes
```

In a non-interactive environment, `--yes` is required.

## What is safe to remove?

A worktree is offered for removal only when every check passes:

- Git recognizes it as a registered worktree.
- It is neither the repository's main worktree nor the worktree running the
  command.
- It is unlocked.
- It has no tracked changes or untracked files.
- Its `HEAD` is already an ancestor of the detected base branch, or its
  attached branch can be merged without changing the base branch's content.

The base branch is detected from `origin/HEAD`, then local `main`, local
`master`, and finally the main worktree's current branch. If the CLI cannot
prove that a directory is safe, it skips it and explains why.

Candidates are checked again immediately before removal. The CLI uses
`git worktree remove` without `--force` and never deletes branches.

The content-equivalence check recognizes branches integrated through rebase or
squash merge. It uses `git merge-tree`, does not modify either worktree, and is
only available with Git 2.38 or newer. Detached worktrees and repositories with
custom merge drivers keep the stricter ancestry-only rule. Older Git versions
remain supported but also keep that conservative behavior.

### A note about remote branches

The CLI does not contact GitHub, and a deleted remote branch alone does not
prove that its work was merged. Run `git fetch --prune` first if you want the
decision to use the latest remote refs. Squash-merged or rebased branches may
still be skipped when Git cannot prove that merging them would leave the base
unchanged. This conservative behavior avoids discarding work based on a guess.

If a repository has been moved, Git may still hold worktree paths from its old
location. In that case, repair the metadata with `git worktree repair` before
running the cleanup again.

## Development

The project is built with Effect v4 and follows the GitHub Spec Kit workflow.
The feature contract lives in `specs/001-core-cleanup/`. Effect's official
source is vendored under `repos/` as a read-only reference using a Git subtree.

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
