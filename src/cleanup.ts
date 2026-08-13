import { Console, Effect, FileSystem, Option, Path } from "effect"
import { Prompt } from "effect/unstable/cli"

import type {
  Assessment,
  Candidate,
  CleanupResult,
  RegisteredWorktree,
  TargetRoot
} from "./domain.js"
import { parseWorktreePorcelain, skipReasonLabel } from "./domain.js"
import { DiscoveryError, InputError } from "./errors.js"
import { Git } from "./git.js"

const smartRoots = [
  { relative: "worktrees", source: "worktrees" },
  { relative: ".claude/worktrees", source: "claude" },
  { relative: ".codex/worktrees", source: "codex" }
] as const

const trim = (value: string): string => value.trim()

const pathKey = (pathService: Path.Path, value: string): string => {
  const normalized = pathService.normalize(value)
  return pathService.sep === "\\" ? normalized.toLowerCase() : normalized
}

const discoveryFailure = (path: string, message: string) => (cause: unknown) =>
  new DiscoveryError({ path, message, cause })

export const discoverRoots = Effect.fn("discoverRoots")(function* (
  cwd: string,
  explicitDirectory: Option.Option<string>
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  if (Option.isSome(explicitDirectory)) {
    const requested = path.resolve(cwd, explicitDirectory.value)
    const exists = yield* fs
      .exists(requested)
      .pipe(Effect.mapError(discoveryFailure(requested, "Could not inspect --dir")))
    if (!exists) {
      return yield* new InputError({
        message: `--dir does not exist: ${requested}`,
        exitCode: 2
      })
    }
    const info = yield* fs
      .stat(requested)
      .pipe(Effect.mapError(discoveryFailure(requested, "Could not inspect --dir")))
    if (info.type !== "Directory") {
      return yield* new InputError({
        message: `--dir is not a directory: ${requested}`,
        exitCode: 2
      })
    }
    const canonical = yield* fs
      .realPath(requested)
      .pipe(Effect.mapError(discoveryFailure(requested, "Could not resolve --dir")))
    return [{ path: canonical, source: "explicit" }] satisfies ReadonlyArray<TargetRoot>
  }

  const roots: Array<TargetRoot> = []
  for (const entry of smartRoots) {
    const requested = path.resolve(cwd, entry.relative)
    const exists = yield* fs
      .exists(requested)
      .pipe(Effect.mapError(discoveryFailure(requested, "Could not inspect smart default")))
    if (!exists) continue
    const info = yield* fs
      .stat(requested)
      .pipe(Effect.mapError(discoveryFailure(requested, "Could not inspect smart default")))
    if (info.type !== "Directory") continue
    const canonical = yield* fs
      .realPath(requested)
      .pipe(Effect.mapError(discoveryFailure(requested, "Could not resolve smart default")))
    roots.push({ path: canonical, source: entry.source })
  }

  return roots
})

export const enumerateCandidates = Effect.fn("enumerateCandidates")(function* (
  roots: ReadonlyArray<TargetRoot>
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const candidates: Array<Candidate> = []

  for (const root of roots) {
    const names = yield* fs
      .readDirectory(root.path)
      .pipe(Effect.mapError(discoveryFailure(root.path, "Could not list worktree root")))

    for (const name of names.toSorted()) {
      const requested = path.resolve(root.path, name)
      const info = yield* fs
        .stat(requested)
        .pipe(Effect.mapError(discoveryFailure(requested, "Could not inspect candidate")))
      if (info.type !== "Directory") continue

      const canonical = yield* fs
        .realPath(requested)
        .pipe(Effect.mapError(discoveryFailure(requested, "Could not resolve candidate")))
      const normalizedRequested = path.normalize(requested)

      if (canonical !== normalizedRequested) {
        candidates.push({
          path: normalizedRequested,
          root,
          structuralSkip: {
            reason: path.dirname(canonical) === root.path ? "symlink" : "outside-root",
            detail: `resolves to ${canonical}`
          }
        })
        continue
      }
      if (path.dirname(canonical) !== root.path) {
        candidates.push({
          path: canonical,
          root,
          structuralSkip: {
            reason: "outside-root",
            detail: `canonical parent is ${path.dirname(canonical)}`
          }
        })
        continue
      }
      candidates.push({ path: canonical, root })
    }
  }

  const unique = new Map<string, Candidate>()
  for (const candidate of candidates) unique.set(candidate.path, candidate)
  return [...unique.values()]
})

const findCurrentWorktree = Effect.fn("findCurrentWorktree")(function* (cwd: string) {
  const git = yield* Git
  const fs = yield* FileSystem.FileSystem
  const result = yield* git.run(cwd, ["rev-parse", "--show-toplevel"])
  if (result.exitCode !== 0) return undefined
  return yield* fs
    .realPath(trim(result.stdout))
    .pipe(Effect.orElseSucceed(() => trim(result.stdout)))
})

const detectBaseRef = Effect.fn("detectBaseRef")(function* (
  repositoryPath: string,
  mainWorktree: RegisteredWorktree
) {
  const git = yield* Git
  const originHead = yield* git.run(repositoryPath, [
    "symbolic-ref",
    "--quiet",
    "refs/remotes/origin/HEAD"
  ])
  if (originHead.exitCode === 0 && trim(originHead.stdout).length > 0)
    return trim(originHead.stdout)

  for (const ref of ["refs/heads/main", "refs/heads/master"]) {
    const exists = yield* git.run(repositoryPath, ["show-ref", "--verify", "--quiet", ref])
    if (exists.exitCode === 0) return ref
  }

  if (mainWorktree.branch !== undefined) {
    const exists = yield* git.run(repositoryPath, [
      "show-ref",
      "--verify",
      "--quiet",
      mainWorktree.branch
    ])
    if (exists.exitCode === 0) return mainWorktree.branch
  }
  return undefined
})

const skipped = (
  candidate: Candidate,
  reason: Assessment["reason"],
  detail?: string,
  context?: {
    readonly repositoryPath?: string
    readonly worktree?: RegisteredWorktree
    readonly baseRef?: string
  }
): Assessment => ({
  candidate,
  status: "skipped",
  ...(reason === undefined ? {} : { reason }),
  ...(detail === undefined ? {} : { detail }),
  ...(context?.repositoryPath === undefined ? {} : { repositoryPath: context.repositoryPath }),
  ...(context?.worktree === undefined ? {} : { worktree: context.worktree }),
  ...(context?.baseRef === undefined ? {} : { baseRef: context.baseRef })
})

export const assessCandidate = Effect.fn("assessCandidate")(function* (
  candidate: Candidate,
  currentWorktree: string | undefined
) {
  const git = yield* Git
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  if (candidate.structuralSkip !== undefined) {
    return skipped(candidate, candidate.structuralSkip.reason, candidate.structuralSkip.detail)
  }

  const repository = yield* git.run(candidate.path, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir"
  ])
  if (repository.exitCode !== 0) {
    return skipped(candidate, "not-registered", trim(repository.stderr))
  }

  const listResult = yield* git.run(candidate.path, ["worktree", "list", "--porcelain", "-z"])
  if (listResult.exitCode !== 0) {
    return skipped(candidate, "git-error", trim(listResult.stderr))
  }
  const worktrees = parseWorktreePorcelain(listResult.stdout)
  const mainWorktree = worktrees[0]
  if (mainWorktree === undefined) {
    return skipped(candidate, "git-error", "Git returned an empty worktree list")
  }

  const topLevel = yield* git.run(candidate.path, [
    "rev-parse",
    "--path-format=absolute",
    "--show-toplevel"
  ])
  if (topLevel.exitCode !== 0) {
    return skipped(candidate, "git-error", trim(topLevel.stderr))
  }

  // Git for Windows can spell the same path using either its long form or an
  // 8.3 component (for example `runneradmin` versus `RUNNER~1`). Match the
  // path reported by Git from inside the candidate against Git's own list.
  const gitCandidatePath = pathKey(path, trim(topLevel.stdout))
  const registered = worktrees.find((entry) => pathKey(path, entry.path) === gitCandidatePath)
  if (registered === undefined) {
    return skipped(candidate, "not-registered")
  }
  const worktree = { ...registered, path: candidate.path }
  const canonicalMain = {
    ...mainWorktree,
    path: yield* fs
      .realPath(mainWorktree.path)
      .pipe(Effect.orElseSucceed(() => path.normalize(mainWorktree.path)))
  }
  const repositoryPath = canonicalMain.path
  const context = { repositoryPath, worktree }

  if (worktree.isMain) return skipped(candidate, "main-worktree", undefined, context)
  if (currentWorktree === candidate.path) {
    return skipped(candidate, "current-worktree", undefined, context)
  }
  if (worktree.lockedReason !== undefined) {
    return skipped(candidate, "locked", worktree.lockedReason, context)
  }
  if (worktree.head === undefined) {
    return skipped(candidate, "git-error", "Git did not report a HEAD", context)
  }

  const status = yield* git.run(candidate.path, ["status", "--porcelain", "--untracked-files=all"])
  if (status.exitCode !== 0) return skipped(candidate, "git-error", trim(status.stderr), context)
  if (status.stdout.length > 0) return skipped(candidate, "dirty", undefined, context)

  const baseRef = yield* detectBaseRef(repositoryPath, canonicalMain)
  if (baseRef === undefined) return skipped(candidate, "base-ref-unknown", undefined, context)

  const merged = yield* git.run(repositoryPath, [
    "merge-base",
    "--is-ancestor",
    worktree.head,
    baseRef
  ])
  if (merged.exitCode === 1) {
    return skipped(candidate, "not-merged", `base: ${baseRef}`, { ...context, baseRef })
  }
  if (merged.exitCode !== 0) {
    return skipped(candidate, "git-error", trim(merged.stderr), { ...context, baseRef })
  }

  return {
    candidate,
    repositoryPath,
    worktree,
    baseRef,
    status: "removable" as const
  }
})

const renderPlan = Effect.fn("renderPlan")(function* (
  roots: ReadonlyArray<TargetRoot>,
  assessments: ReadonlyArray<Assessment>
) {
  yield* Console.log("Worktree cleanup plan")
  yield* Console.log("Roots:")
  for (const root of roots) yield* Console.log(`  - ${root.path} (${root.source})`)

  const removable = assessments.filter((assessment) => assessment.status === "removable")
  const skippedItems = assessments.filter((assessment) => assessment.status === "skipped")

  yield* Console.log(`Removable (${removable.length}):`)
  if (removable.length === 0) yield* Console.log("  - none")
  for (const assessment of removable) {
    yield* Console.log(`  REMOVE ${assessment.candidate.path} [${assessment.baseRef}]`)
  }

  yield* Console.log(`Skipped (${skippedItems.length}):`)
  if (skippedItems.length === 0) yield* Console.log("  - none")
  for (const assessment of skippedItems) {
    const reason = assessment.reason === undefined ? "unknown" : skipReasonLabel[assessment.reason]
    const detail =
      assessment.detail === undefined || assessment.detail.length === 0
        ? ""
        : `: ${assessment.detail}`
    yield* Console.log(`  skip ${assessment.candidate.path} — ${reason}${detail}`)
  }
})

export interface CleanupOptions {
  readonly cwd: string
  readonly directory: Option.Option<string>
  readonly yes: boolean
  readonly interactive: boolean
}

export const runCleanup = Effect.fn("runCleanup")(function* (options: CleanupOptions) {
  const git = yield* Git
  const roots = yield* discoverRoots(options.cwd, options.directory)
  if (roots.length === 0) {
    yield* Console.log(
      "No worktree roots found (checked worktrees, .claude/worktrees, .codex/worktrees)."
    )
    return {
      removed: [],
      revalidationSkipped: [],
      failures: []
    } satisfies CleanupResult
  }

  const candidates = yield* enumerateCandidates(roots)
  const currentWorktree = yield* findCurrentWorktree(options.cwd)
  const assessments = yield* Effect.forEach(
    candidates,
    (candidate) => assessCandidate(candidate, currentWorktree),
    { concurrency: 4 }
  )
  yield* renderPlan(roots, assessments)

  const removable = assessments.filter(
    (
      assessment
    ): assessment is Assessment & {
      readonly repositoryPath: string
      readonly status: "removable"
    } => assessment.status === "removable" && assessment.repositoryPath !== undefined
  )
  if (removable.length === 0) {
    yield* Console.log("Nothing to remove.")
    return {
      removed: [],
      revalidationSkipped: [],
      failures: []
    } satisfies CleanupResult
  }

  if (!options.yes && !options.interactive) {
    return yield* new InputError({
      message: "Refusing to delete without an interactive terminal. Pass --yes to approve.",
      exitCode: 2
    })
  }

  const confirmed = options.yes
    ? true
    : yield* Prompt.run(
        Prompt.confirm({
          message: `Remove ${removable.length} stale worktree${removable.length === 1 ? "" : "s"}?`,
          initial: false
        })
      ).pipe(Effect.orElseSucceed(() => false))

  if (!confirmed) {
    yield* Console.log("Cleanup cancelled; nothing was removed.")
    return {
      removed: [],
      revalidationSkipped: [],
      failures: []
    } satisfies CleanupResult
  }

  const removed: Array<string> = []
  const revalidationSkipped: Array<Assessment> = []
  const failures: Array<{ path: string; message: string }> = []

  for (const planned of removable) {
    const revalidated = yield* assessCandidate(planned.candidate, currentWorktree)
    if (revalidated.status !== "removable" || revalidated.repositoryPath === undefined) {
      revalidationSkipped.push(revalidated)
      continue
    }

    const removal = yield* git.run(revalidated.repositoryPath, [
      "worktree",
      "remove",
      "--",
      revalidated.candidate.path
    ])
    if (removal.exitCode === 0) {
      removed.push(revalidated.candidate.path)
    } else {
      failures.push({
        path: revalidated.candidate.path,
        message: trim(removal.stderr) || `git exited with ${removal.exitCode}`
      })
    }
  }

  yield* Console.log(
    `Cleanup complete: ${removed.length} removed, ${revalidationSkipped.length} skipped after revalidation, ${failures.length} failed.`
  )
  for (const failure of failures) yield* Console.error(`Failed ${failure.path}: ${failure.message}`)

  if (failures.length > 0) {
    process.exitCode = 1
  }
  return { removed, revalidationSkipped, failures } satisfies CleanupResult
})
