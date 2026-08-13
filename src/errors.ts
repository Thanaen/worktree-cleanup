import { Schema } from "effect"

export class GitExecutionError extends Schema.TaggedError<GitExecutionError>()(
  "GitExecutionError",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.Defect()
  }
) {}

export class InputError extends Schema.TaggedError<InputError>()("InputError", {
  message: Schema.String,
  exitCode: Schema.Int
}) {}

export class DiscoveryError extends Schema.TaggedError<DiscoveryError>()("DiscoveryError", {
  path: Schema.String,
  message: Schema.String,
  cause: Schema.Defect()
}) {}

export type AppError = GitExecutionError | InputError | DiscoveryError
