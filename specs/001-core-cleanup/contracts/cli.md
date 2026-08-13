# CLI Contract

```text
worktree-cleanup [--dir <path>] [-y|--yes]
worktree-clean [--dir <path>] [-y|--yes]
```

- `--dir <path>`: inspect exactly one worktree root and disable smart defaults.
- `-y`, `--yes`: approve the displayed plan without prompting.
- `-h`, `--help`: display help.
- `--version`: display the package version.

Exit status:

- `0`: safe no-op, user refusal, or all confirmed removals succeeded.
- `1`: Git/filesystem/removal operational failure.
- `2`: invalid arguments or deletion requested from non-interactive input without
  `--yes`.
