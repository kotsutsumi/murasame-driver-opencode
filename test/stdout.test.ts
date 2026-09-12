import { describe, expect, test } from "bun:test";
import { createOpenCodeDriver } from "../src/index.ts";
import { FakeSpawner, makeRuntime } from "./helpers.ts";

describe("OpenCode stdout pipeline", () => {
  test("does not parse JSON-looking stderr", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createOpenCodeDriver({ runtime, spawner });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stderr.push('{"type":"text","part":{"text":"FAKE"}}\n');
    child.stdout.push('{"type":"step_start","sessionID":"stdout-session"}\n');
    child.stdout.push(
      '{"type":"text","sessionID":"stdout-session","messageID":"m","part":{"type":"text","text":"real"}}\n',
    );
    child.complete();

    const result = await run.result;
    expect(result.status).toBe("completed");
    expect(result.stderr).toContain('"text"');
    expect(runtime.snapshot().streams.find((stream) => stream.stream === "assistant")?.text).toBe(
      "real",
    );
    expect(runtime.snapshot().streams.some((stream) => stream.text.includes("FAKE"))).toBe(false);
    await driver.dispose();
  });

  test("keeps the last stderr bytes within the configured limit", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const diagnostics: string[] = [];
    const driver = createOpenCodeDriver({
      runtime,
      spawner,
      stderrLimit: 5,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const run = driver.run({ prompt: "hello" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stderr.push("abcdef");
    child.complete(2);

    const result = await run.result;
    expect(result.status).toBe("failed");
    expect(result.stderr).toBe("bcdef");
    expect(diagnostics).toContain("STDERR_TRUNCATED");
    await driver.dispose();
  });
});
