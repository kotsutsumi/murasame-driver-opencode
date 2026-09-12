import { describe, expect, test } from "bun:test";
import { createOpenCodeDriver, OpenCodeRunConfigurationError } from "../src/index.ts";
import { makeRuntime } from "./helpers.ts";

describe("OpenCode driver validation", () => {
  test("rejects incompatible session continuation options", () => {
    const driver = createOpenCodeDriver({ runtime: makeRuntime() });

    expect(() =>
      driver.run({
        prompt: "hello",
        sessionId: "session-1",
        continueSession: true,
      }),
    ).toThrow(OpenCodeRunConfigurationError);
    expect(() => driver.run({ prompt: "hello", forkSession: true })).toThrow(
      OpenCodeRunConfigurationError,
    );
  });

  test("rejects empty prompts and invalid timeouts", () => {
    const driver = createOpenCodeDriver({ runtime: makeRuntime() });

    expect(() => driver.run({ prompt: "" })).toThrow(OpenCodeRunConfigurationError);
    expect(() => driver.run({ prompt: "hello", timeoutMs: -1 })).toThrow(
      OpenCodeRunConfigurationError,
    );
  });
});
