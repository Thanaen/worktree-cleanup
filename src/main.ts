import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Effect, Layer } from "effect"

import { program } from "./cli.js"
import { Git } from "./git.js"

const MainLayer = Git.layer.pipe(Layer.provideMerge(NodeServices.layer))

program.pipe(Effect.provide(MainLayer), NodeRuntime.runMain)
