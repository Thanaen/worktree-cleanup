# Contributing

1. Open an issue for behavior changes, especially changes to deletion criteria.
2. Update the relevant Spec Kit artifact under `specs/`.
3. Add unit and real-Git integration coverage.
4. Run `pnpm check` before opening a pull request.

Never weaken a fail-closed safety check solely for convenience. New deletion
behavior must remain previewed, confirmed, and revalidated.
