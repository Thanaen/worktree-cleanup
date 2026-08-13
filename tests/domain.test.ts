import { assert, describe, it } from "@effect/vitest"

import { parseWorktreePorcelain } from "../src/domain.js"

describe("parseWorktreePorcelain", () => {
  it("parses NUL-delimited records and preserves paths containing spaces", () => {
    const input = [
      "worktree /repo",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree /repo/worktrees/agent one",
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/feature",
      "locked in use",
      "",
      ""
    ].join("\0")

    assert.deepStrictEqual(parseWorktreePorcelain(input), [
      {
        path: "/repo",
        head: "1111111111111111111111111111111111111111",
        branch: "refs/heads/main",
        detached: false,
        isMain: true
      },
      {
        path: "/repo/worktrees/agent one",
        head: "2222222222222222222222222222222222222222",
        branch: "refs/heads/feature",
        detached: false,
        lockedReason: "in use",
        isMain: false
      }
    ])
  })

  it("parses detached and prunable markers", () => {
    const input = [
      "worktree /repo",
      "HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "detached",
      "prunable gitdir file points to non-existent location",
      "",
      ""
    ].join("\0")

    assert.deepStrictEqual(parseWorktreePorcelain(input), [
      {
        path: "/repo",
        head: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        detached: true,
        prunableReason: "gitdir file points to non-existent location",
        isMain: true
      }
    ])
  })
})
