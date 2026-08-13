# Quickstart

```bash
pnpm install
pnpm check
pnpm build
node dist/main.mjs --help
```

Manual smoke test from a Git repository:

```bash
worktree-cleanup
worktree-cleanup --dir .agents/worktrees
worktree-cleanup --yes
```

The command never deletes a branch. Inspect output before confirming and omit
`--yes` for normal interactive use.
