import { Context, Effect, Layer, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

import { GitExecutionError } from "./errors.js"

export interface GitResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface GitService {
  readonly run: (
    cwd: string,
    args: ReadonlyArray<string>
  ) => Effect.Effect<GitResult, GitExecutionError>
}

export class Git extends Context.Service<Git, GitService>()("@thanaen/worktree-cleanup/Git") {
  static readonly layer = Layer.effect(
    Git,
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner

      const run = Effect.fn("Git.run")(function* (cwd: string, args: ReadonlyArray<string>) {
        const operation = `git ${args.join(" ")}`
        const handle = yield* spawner.spawn(ChildProcess.make("git", [...args], { cwd })).pipe(
          Effect.mapError(
            (cause) =>
              new GitExecutionError({
                operation,
                message: `Could not start Git in ${cwd}`,
                cause
              })
          )
        )

        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            Stream.mkString(Stream.decodeText(handle.stdout)),
            Stream.mkString(Stream.decodeText(handle.stderr)),
            handle.exitCode
          ] as const,
          { concurrency: "unbounded" }
        ).pipe(
          Effect.mapError(
            (cause) =>
              new GitExecutionError({
                operation,
                message: `Git execution failed in ${cwd}`,
                cause
              })
          )
        )

        return {
          stdout,
          stderr,
          exitCode: Number(exitCode)
        }
      }, Effect.scoped)

      return Git.of({ run })
    })
  )
}
