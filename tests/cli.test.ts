import { NodeServices } from "@effect/platform-node"
import { assert, it } from "@effect/vitest"
import { Effect, Exit, Layer } from "effect"
import { Command } from "effect/unstable/cli"

import { command } from "../src/cli.js"
import { Git } from "../src/git.js"

const TestLayer = Git.layer.pipe(Layer.provideMerge(NodeServices.layer))

it.effect("accepts an invocation without --yes", () =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(Command.runWith(command, { version: "test" })([]))

    assert.isTrue(Exit.isSuccess(exit))
  }).pipe(Effect.provide(TestLayer))
)
