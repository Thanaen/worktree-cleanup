import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts", "src/main.ts"],
  format: "esm",
  dts: true,
  sourcemap: true,
  clean: true,
  platform: "node",
  target: "node22",
  banner: {
    js: "#!/usr/bin/env node"
  }
})
