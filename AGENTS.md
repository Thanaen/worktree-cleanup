# Agent guidance

This project follows the Spec Kit workflow. Product decisions live in `specs/`
and project principles live in `.specify/memory/constitution.md`.

## Vendored repositories

External repositories are vendored under `repos/` as Git subtrees.

- Treat vendored repositories as read-only reference material.
- Prefer examples and patterns from vendored source over generated guesses.
- Do not edit or import from `repos/`; application code imports package dependencies.
- Before writing Effect code, read `repos/LLMS.md` and inspect relevant
  implementation, tests, and examples under `repos/`.

## Engineering rules

- Preserve the safe-by-default cleanup contract in the feature specification.
- Model expected failures as typed Effect errors.
- Keep Git and filesystem access behind injectable services.
- Add or update tests with every behavior change.
- Run `pnpm check` before committing.
