import { NodeServices } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Effect, Exit, FileSystem, Layer, Option, Path } from "effect"

import { assessCandidate, runCleanup } from "../../src/cleanup.js"
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
        const canonicalMerged = yield* fs.realPath(merged)

        const result = yield* runCleanup({
          cwd: repository,
          directory: Option.none(),
          yes: true,
          interactive: false
        })

        assert.deepStrictEqual(result.removed, [canonicalMerged])
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
        const canonicalExplicitWorktree = yield* fs.realPath(explicitWorktree)

        const result = yield* runCleanup({
          cwd: repository,
          directory: Option.some(explicitRoot),
          yes: true,
          interactive: false
        })

        assert.deepStrictEqual(result.removed, [canonicalExplicitWorktree])
        assert.isTrue(yield* fs.exists(defaultWorktree))
        assert.isFalse(yield* fs.exists(explicitWorktree))
      } finally {
        yield* fs.remove(parent, { recursive: true, force: true })
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("removes squash-merged and rebased attached branches", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { parent, repository } = yield* makeRepository()

      try {
        const root = path.join(repository, "worktrees")
        yield* fs.makeDirectory(root)

        const squashed = path.join(root, "squashed")
        yield* runGit(repository, ["worktree", "add", "-b", "squashed", squashed, "main"])
        yield* fs.writeFileString(path.join(squashed, "squashed-a.txt"), "A\n")
        yield* runGit(squashed, ["add", "squashed-a.txt"])
        yield* runGit(squashed, ["commit", "-m", "squashed A"])
        yield* fs.writeFileString(path.join(squashed, "squashed-b.txt"), "B\n")
        yield* runGit(squashed, ["add", "squashed-b.txt"])
        yield* runGit(squashed, ["commit", "-m", "squashed B"])
        yield* runGit(repository, ["merge", "--squash", "squashed"])
        yield* runGit(repository, ["commit", "-m", "integrate squashed branch"])

        const rebasePoint = yield* runGit(repository, ["rev-parse", "main"])
        const rebased = path.join(root, "rebased")
        yield* runGit(repository, ["worktree", "add", "-b", "rebase-original", rebased, "main"])
        yield* fs.writeFileString(path.join(rebased, "rebased-a.txt"), "A\n")
        yield* runGit(rebased, ["add", "rebased-a.txt"])
        yield* runGit(rebased, ["commit", "-m", "rebased A"])
        yield* fs.writeFileString(path.join(rebased, "rebased-b.txt"), "B\n")
        yield* runGit(rebased, ["add", "rebased-b.txt"])
        yield* runGit(rebased, ["commit", "-m", "rebased B"])

        yield* fs.writeFileString(path.join(repository, "base-progress.txt"), "base progress\n")
        yield* runGit(repository, ["add", "base-progress.txt"])
        yield* runGit(repository, ["commit", "-m", "advance base"])
        yield* runGit(repository, ["branch", "rebase-integrated", "rebase-original"])
        yield* runGit(repository, ["rebase", "--onto", "main", rebasePoint, "rebase-integrated"])
        yield* runGit(repository, ["checkout", "main"])
        yield* runGit(repository, ["merge", "--ff-only", "rebase-integrated"])

        const canonicalSquashed = yield* fs.realPath(squashed)
        const canonicalRebased = yield* fs.realPath(rebased)
        const targetRoot = { path: root, source: "worktrees" as const }
        const squashedAssessment = yield* assessCandidate(
          { path: canonicalSquashed, root: targetRoot },
          undefined
        )
        const rebasedAssessment = yield* assessCandidate(
          { path: canonicalRebased, root: targetRoot },
          undefined
        )

        assert.strictEqual(squashedAssessment.status, "removable")
        assert.strictEqual(squashedAssessment.integrationEvidence, "content-equivalent")
        assert.strictEqual(rebasedAssessment.status, "removable")
        assert.strictEqual(rebasedAssessment.integrationEvidence, "content-equivalent")

        const result = yield* runCleanup({
          cwd: repository,
          directory: Option.none(),
          yes: true,
          interactive: false
        })

        assert.deepStrictEqual(result.removed.toSorted(), [canonicalRebased, canonicalSquashed])
        assert.isFalse(yield* fs.exists(squashed))
        assert.isFalse(yield* fs.exists(rebased))
        assert.match(
          yield* runGit(repository, ["show-ref", "--verify", "refs/heads/squashed"]),
          / refs\/heads\/squashed$/
        )
        assert.match(
          yield* runGit(repository, ["show-ref", "--verify", "refs/heads/rebase-original"]),
          / refs\/heads\/rebase-original$/
        )
      } finally {
        yield* fs.remove(parent, { recursive: true, force: true })
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("keeps partial, modified, reverted, conflicting, and detached integrations", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { parent, repository } = yield* makeRepository()

      try {
        const root = path.join(repository, "worktrees")
        yield* fs.makeDirectory(root)

        const partial = path.join(root, "partial")
        yield* runGit(repository, ["worktree", "add", "-b", "partial", partial, "main"])
        yield* fs.writeFileString(path.join(partial, "partial-a.txt"), "A\n")
        yield* runGit(partial, ["add", "partial-a.txt"])
        yield* runGit(partial, ["commit", "-m", "partial A"])
        const partialA = yield* runGit(partial, ["rev-parse", "HEAD"])
        yield* fs.writeFileString(path.join(partial, "partial-b.txt"), "B\n")
        yield* runGit(partial, ["add", "partial-b.txt"])
        yield* runGit(partial, ["commit", "-m", "partial B"])
        yield* runGit(repository, ["cherry-pick", partialA])

        const modified = path.join(root, "modified")
        yield* runGit(repository, ["worktree", "add", "-b", "modified", modified, "main"])
        yield* fs.writeFileString(path.join(modified, "modified.txt"), "feature version\n")
        yield* runGit(modified, ["add", "modified.txt"])
        yield* runGit(modified, ["commit", "-m", "original feature content"])
        yield* fs.writeFileString(path.join(repository, "modified.txt"), "modified version\n")
        yield* runGit(repository, ["add", "modified.txt"])
        yield* runGit(repository, ["commit", "-m", "integrate modified content"])

        const reverted = path.join(root, "reverted")
        yield* runGit(repository, ["worktree", "add", "-b", "reverted", reverted, "main"])
        yield* fs.writeFileString(path.join(reverted, "reverted.txt"), "reverted\n")
        yield* runGit(reverted, ["add", "reverted.txt"])
        yield* runGit(reverted, ["commit", "-m", "eventually reverted"])
        yield* runGit(repository, ["merge", "--squash", "reverted"])
        yield* runGit(repository, ["commit", "-m", "temporarily integrate reverted branch"])
        yield* runGit(repository, ["revert", "--no-edit", "HEAD"])

        yield* fs.writeFileString(path.join(repository, "conflict.txt"), "original\n")
        yield* runGit(repository, ["add", "conflict.txt"])
        yield* runGit(repository, ["commit", "-m", "add conflict fixture"])
        const conflicting = path.join(root, "conflicting")
        yield* runGit(repository, ["worktree", "add", "-b", "conflicting", conflicting, "main"])
        yield* fs.writeFileString(path.join(conflicting, "conflict.txt"), "feature\n")
        yield* runGit(conflicting, ["add", "conflict.txt"])
        yield* runGit(conflicting, ["commit", "-m", "feature conflict"])
        yield* fs.writeFileString(path.join(repository, "conflict.txt"), "base\n")
        yield* runGit(repository, ["add", "conflict.txt"])
        yield* runGit(repository, ["commit", "-m", "base conflict"])

        const detached = path.join(root, "detached")
        yield* runGit(repository, ["worktree", "add", "-b", "detached-original", detached, "main"])
        yield* fs.writeFileString(path.join(detached, "detached.txt"), "detached\n")
        yield* runGit(detached, ["add", "detached.txt"])
        yield* runGit(detached, ["commit", "-m", "detached content"])
        yield* runGit(repository, ["merge", "--squash", "detached-original"])
        yield* runGit(repository, ["commit", "-m", "integrate detached content"])
        yield* runGit(detached, ["checkout", "--detach"])

        const result = yield* runCleanup({
          cwd: repository,
          directory: Option.none(),
          yes: true,
          interactive: false
        })

        assert.deepStrictEqual(result.removed, [])
        assert.isTrue(yield* fs.exists(partial))
        assert.isTrue(yield* fs.exists(modified))
        assert.isTrue(yield* fs.exists(reverted))
        assert.isTrue(yield* fs.exists(conflicting))
        assert.isTrue(yield* fs.exists(detached))
      } finally {
        yield* fs.remove(parent, { recursive: true, force: true })
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("does not run content-equivalence proof with custom merge drivers", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const { parent, repository } = yield* makeRepository()

      try {
        const root = path.join(repository, "worktrees")
        yield* fs.makeDirectory(root)
        const candidate = path.join(root, "custom-driver")
        yield* runGit(repository, ["worktree", "add", "-b", "custom-driver", candidate, "main"])
        yield* fs.writeFileString(path.join(candidate, "custom-driver.txt"), "content\n")
        yield* runGit(candidate, ["add", "custom-driver.txt"])
        yield* runGit(candidate, ["commit", "-m", "custom driver content"])
        yield* runGit(repository, ["merge", "--squash", "custom-driver"])
        yield* runGit(repository, ["commit", "-m", "integrate custom driver content"])
        yield* runGit(repository, ["config", "merge.test.driver", "false"])

        const canonicalCandidate = yield* fs.realPath(candidate)
        const assessment = yield* assessCandidate(
          {
            path: canonicalCandidate,
            root: { path: root, source: "worktrees" }
          },
          undefined
        )

        assert.strictEqual(assessment.status, "skipped")
        assert.strictEqual(assessment.reason, "not-merged")
        assert.include(assessment.detail ?? "", "custom merge drivers")

        const result = yield* runCleanup({
          cwd: repository,
          directory: Option.none(),
          yes: true,
          interactive: false
        })
        assert.deepStrictEqual(result.removed, [])
        assert.isTrue(yield* fs.exists(candidate))
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
