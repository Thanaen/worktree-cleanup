import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, FileSystem, Layer, Option, Path } from "effect"

import { runCleanup } from "../../src/cleanup.js"
import { Git } from "../../src/git.js"

const TestLayer = Git.layer.pipe(Layer.provideMerge(NodeServices.layer))

const runGit = Effect.fn("test.runGit")(function* (cwd: string, args: ReadonlyArray<string>) {
  const git = yield* Git
  const result = yield* git.run(cwd, args)
  assert.strictEqual(
    result.exitCode,
    0,
    `git ${args.join(" ")} failed (${result.exitCode}): ${result.stderr}`
  )
  return result.stdout.trim()
})

const makeRepository = Effect.fn("test.makeRepository")(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const parent = yield* fs.makeTempDirectory({ prefix: "worktree-cleanup-test-" })
  const repository = path.join(parent, "repository")
  yield* fs.makeDirectory(repository)
  yield* runGit(repository, ["init", "-b", "main"])
  yield* runGit(repository, ["config", "user.name", "Worktree Cleanup Test"])
  yield* runGit(repository, ["config", "user.email", "test@example.invalid"])
  yield* fs.writeFileString(path.join(repository, "README.md"), "initial\n")
  yield* runGit(repository, ["add", "README.md"])
  yield* runGit(repository, ["commit", "-m", "initial"])
  return { parent, repository }
})

describe("runCleanup with real Git worktrees", () => {
  it.effect("removes only merged, clean, unlocked worktrees", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { parent, repository } = yield* makeRepository()

      try {
        const root = path.join(repository, "worktrees")
        yield* fs.makeDirectory(root)

        const merged = path.join(root, "merged worktree")
        const unmerged = path.join(root, "unmerged")
        const dirty = path.join(root, "dirty")
        const locked = path.join(root, "locked")

        yield* runGit(repository, ["worktree", "add", "-b", "merged", merged, "main"])
        yield* runGit(repository, ["worktree", "add", "-b", "feature", unmerged, "main"])
        yield* fs.writeFileString(path.join(unmerged, "feature.txt"), "feature\n")
        yield* runGit(unmerged, ["add", "feature.txt"])
        yield* runGit(unmerged, ["commit", "-m", "unmerged feature"])

        yield* runGit(repository, ["worktree", "add", "-b", "dirty", dirty, "main"])
        yield* fs.writeFileString(path.join(dirty, "untracked.txt"), "do not delete\n")

        yield* runGit(repository, ["worktree", "add", "-b", "locked", locked, "main"])
        yield* runGit(repository, ["worktree", "lock", "--reason", "active agent", locked])

        const result = yield* runCleanup({
          cwd: repository,
          directory: Option.none(),
          yes: true,
          interactive: false
        })

        assert.deepStrictEqual(result.removed, [merged])
        assert.isFalse(yield* fs.exists(merged))
        assert.isTrue(yield* fs.exists(unmerged))
        assert.isTrue(yield* fs.exists(dirty))
        assert.isTrue(yield* fs.exists(locked))
        assert.isTrue(yield* fs.exists(path.join(dirty, "untracked.txt")))
      } finally {
        yield* fs.remove(parent, { recursive: true, force: true })
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("an explicit directory ignores smart-default roots", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { parent, repository } = yield* makeRepository()

      try {
        const defaultRoot = path.join(repository, "worktrees")
        const explicitRoot = path.join(parent, "explicit worktrees")
        yield* fs.makeDirectory(defaultRoot)
        yield* fs.makeDirectory(explicitRoot)

        const defaultWorktree = path.join(defaultRoot, "default")
        const explicitWorktree = path.join(explicitRoot, "explicit")
        yield* runGit(repository, [
          "worktree",
          "add",
          "-b",
          "default-candidate",
          defaultWorktree,
          "main"
        ])
        yield* runGit(repository, [
          "worktree",
          "add",
          "-b",
          "explicit-candidate",
          explicitWorktree,
          "main"
        ])

        const result = yield* runCleanup({
          cwd: repository,
          directory: Option.some(explicitRoot),
          yes: true,
          interactive: false
        })

        assert.deepStrictEqual(result.removed, [explicitWorktree])
        assert.isTrue(yield* fs.exists(defaultWorktree))
        assert.isFalse(yield* fs.exists(explicitWorktree))
      } finally {
        yield* fs.remove(parent, { recursive: true, force: true })
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("refuses non-interactive deletion without --yes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { parent, repository } = yield* makeRepository()

      try {
        const root = path.join(repository, "worktrees")
        yield* fs.makeDirectory(root)
        const candidate = path.join(root, "needs confirmation")
        yield* runGit(repository, [
          "worktree",
          "add",
          "-b",
          "needs-confirmation",
          candidate,
          "main"
        ])

        const exit = yield* Effect.exit(
          runCleanup({
            cwd: repository,
            directory: Option.none(),
            yes: false,
            interactive: false
          })
        )

        assert.isTrue(Exit.isFailure(exit))
        assert.isTrue(yield* fs.exists(candidate))
      } finally {
        yield* fs.remove(parent, { recursive: true, force: true })
      }
    }).pipe(Effect.provide(TestLayer))
  )
})
