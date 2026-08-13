import { Console, Effect } from "effect"
import { Command, Flag } from "effect/unstable/cli"

import { runCleanup } from "./cleanup.js"

const directory = Flag.string("dir").pipe(
  Flag.withDescription("Inspect exactly this worktree root and ignore smart defaults"),
  Flag.optional
)

const yes = Flag.boolean("yes").pipe(
  Flag.withAlias("y"),
  Flag.withDescription("Approve the displayed cleanup plan without prompting")
)

const handleError = (error: unknown) => {
  const candidate = error as { readonly message?: unknown; readonly exitCode?: unknown }
  const message = typeof candidate.message === "string" ? candidate.message : String(error)
  const exitCode = typeof candidate.exitCode === "number" ? candidate.exitCode : 1
  return Console.error(`Error: ${message}`).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = exitCode
      })
    )
  )
}

export const command = Command.make(
  "worktree-cleanup",
  { directory, yes },
  Effect.fn("worktree-cleanup")(function* ({ directory, yes }) {
    yield* runCleanup({
      cwd: process.cwd(),
      directory,
      yes,
      interactive: process.stdin.isTTY === true
    }).pipe(Effect.catch(handleError))
  })
).pipe(
  Command.withAlias("worktree-clean"),
  Command.withDescription(
    "Safely remove clean Git worktrees already integrated into the base branch"
  ),
  Command.withExamples([
    {
      command: "worktree-cleanup",
      description: "Inspect smart-default worktree roots and ask before deletion"
    },
    {
      command: "worktree-cleanup --dir ../worktrees --yes",
      description: "Clean one explicit root non-interactively"
    }
  ])
)

export const program = command.pipe(Command.run({ version: "0.1.0" }))
