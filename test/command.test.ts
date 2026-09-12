import { describe, expect, test } from "bun:test";
import {
  buildOpenCodeArgs,
  isReservedOpenCodeArgument,
  OpenCodeRunConfigurationError,
} from "../src/index.ts";

describe("OpenCode command builder", () => {
  test("builds the process backend arguments and keeps the prompt as one argv value", () => {
    const args = buildOpenCodeArgs({
      prompt: "multiline\nprompt",
      model: "anthropic/claude-test",
      variant: "high",
      agent: "reviewer",
      command: "review",
      files: ["README.md", "src/index.ts"],
      sessionId: "session-1",
      forkSession: true,
      title: "Review task",
      share: true,
      thinking: true,
      autoApprove: true,
      extraArgs: ["--print-logs"],
    });

    expect(args).toEqual([
      "run",
      "--format",
      "json",
      "--model",
      "anthropic/claude-test",
      "--variant",
      "high",
      "--agent",
      "reviewer",
      "--command",
      "review",
      "--file",
      "README.md",
      "--file",
      "src/index.ts",
      "--session",
      "session-1",
      "--fork",
      "--title",
      "Review task",
      "--share",
      "--thinking",
      "--auto",
      "--print-logs",
      "multiline\nprompt",
    ]);
  });

  test("maps continuation and optional controls", () => {
    expect(
      buildOpenCodeArgs({
        prompt: "continue",
        continueSession: true,
        thinking: false,
        autoApprove: false,
      }),
    ).toEqual(["run", "--format", "json", "--continue", "continue"]);
  });

  test("rejects transport and server arguments in the escape hatch", () => {
    expect(isReservedOpenCodeArgument("--format=default")).toBe(true);
    expect(isReservedOpenCodeArgument("--attach=http://127.0.0.1:4096")).toBe(true);
    expect(() =>
      buildOpenCodeArgs({ prompt: "hello", extraArgs: ["--format", "default"] }),
    ).toThrow(OpenCodeRunConfigurationError);
    expect(() =>
      buildOpenCodeArgs({ prompt: "hello", extraArgs: ["--attach=http://server"] }),
    ).toThrow(OpenCodeRunConfigurationError);
    expect(() => buildOpenCodeArgs({ prompt: "hello", extraArgs: ["--interactive"] })).toThrow(
      OpenCodeRunConfigurationError,
    );
  });
});
