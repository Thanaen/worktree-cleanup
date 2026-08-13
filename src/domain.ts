export const skipReasons = [
  "not-registered",
  "symlink",
  "main-worktree",
  "current-worktree",
  "locked",
  "dirty",
  "base-ref-unknown",
  "not-merged",
  "git-error",
  "outside-root"
] as const

export type SkipReason = (typeof skipReasons)[number]

export interface TargetRoot {
  readonly path: string
  readonly source: "explicit" | "worktrees" | "claude" | "codex"
}

export interface RegisteredWorktree {
  readonly path: string
  readonly head?: string
  readonly branch?: string
  readonly detached: boolean
  readonly lockedReason?: string
  readonly prunableReason?: string
  readonly isMain: boolean
}

export interface Candidate {
  readonly path: string
  readonly root: TargetRoot
  readonly structuralSkip?: {
    readonly reason: "symlink" | "outside-root"
    readonly detail: string
  }
}

export interface Assessment {
  readonly candidate: Candidate
  readonly repositoryPath?: string
  readonly worktree?: RegisteredWorktree
  readonly baseRef?: string
  readonly status: "removable" | "skipped"
  readonly reason?: SkipReason
  readonly detail?: string
}

export interface CleanupResult {
  readonly removed: ReadonlyArray<string>
  readonly revalidationSkipped: ReadonlyArray<Assessment>
  readonly failures: ReadonlyArray<{
    readonly path: string
    readonly message: string
  }>
}

interface MutableWorktree {
  path?: string
  head?: string
  branch?: string
  detached: boolean
  lockedReason?: string
  prunableReason?: string
}

const finishRecord = (
  records: Array<Omit<RegisteredWorktree, "isMain">>,
  current: MutableWorktree
): void => {
  if (current.path === undefined) return
  records.push({
    path: current.path,
    ...(current.head === undefined ? {} : { head: current.head }),
    ...(current.branch === undefined ? {} : { branch: current.branch }),
    detached: current.detached,
    ...(current.lockedReason === undefined ? {} : { lockedReason: current.lockedReason }),
    ...(current.prunableReason === undefined ? {} : { prunableReason: current.prunableReason })
  })
}

/** Parse `git worktree list --porcelain -z` without interpreting path bytes as shell text. */
export const parseWorktreePorcelain = (input: string): ReadonlyArray<RegisteredWorktree> => {
  const records: Array<Omit<RegisteredWorktree, "isMain">> = []
  let current: MutableWorktree = { detached: false }

  for (const field of input.split("\0")) {
    if (field.length === 0) {
      finishRecord(records, current)
      current = { detached: false }
      continue
    }

    const separator = field.indexOf(" ")
    const key = separator === -1 ? field : field.slice(0, separator)
    const value = separator === -1 ? "" : field.slice(separator + 1)

    if (key === "worktree") {
      if (current.path !== undefined) {
        finishRecord(records, current)
        current = { detached: false }
      }
      current.path = value
    } else if (key === "HEAD") {
      current.head = value
    } else if (key === "branch") {
      current.branch = value
    } else if (key === "detached") {
      current.detached = true
    } else if (key === "locked") {
      current.lockedReason = value.length === 0 ? "locked" : value
    } else if (key === "prunable") {
      current.prunableReason = value.length === 0 ? "prunable" : value
    }
  }

  finishRecord(records, current)
  return records.map((record, index) => ({ ...record, isMain: index === 0 }))
}

export const skipReasonLabel: Readonly<Record<SkipReason, string>> = {
  "not-registered": "not a registered Git worktree",
  symlink: "symlinked directories are never removed",
  "main-worktree": "repository main worktree",
  "current-worktree": "worktree running this command",
  locked: "worktree is locked",
  dirty: "worktree has tracked or untracked changes",
  "base-ref-unknown": "could not determine a trusted base branch",
  "not-merged": "HEAD is not integrated into the base branch",
  "git-error": "Git state could not be proven",
  "outside-root": "canonical path is outside the selected root"
}
