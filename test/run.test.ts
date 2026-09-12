import { describe, expect, test } from "bun:test";
import { createOpenCodeDriver } from "../src/index.ts";
import { FakeSpawner, makeRuntime } from "./helpers.ts";

function readFixture(name: string): Promise<string> {
  return Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text();
}

describe("OpenCodeDriver run", () => {
  test("feeds run-json stdout through adapter into runtime", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const diagnostics: string[] = [];
    const driver = createOpenCodeDriver({
      runtime,
      executable: "opencode-test",
      spawner,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const run = driver.run({ prompt: "hello from argv", cwd: "/repo" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stdout.push(await readFixture("simple.jsonl"));
    child.complete();

    const result = await run.result;
    const snapshot = runtime.snapshot();
    expect(result.status).toBe("completed");
    expect(result.openCodeSessionId).toBe("opencode-session-1");
    expect(result.stdoutBytes).toBeGreaterThan(0);
    expect(spawner.calls[0]?.command).toBe("opencode-test");
    expect(spawner.calls[0]?.args.slice(0, 3)).toEqual(["run", "--format", "json"]);
    expect(spawner.calls[0]?.args.at(-1)).toBe("hello from argv");
    expect(spawner.calls[0]?.options.shell).toBe(false);
    expect(spawner.calls[0]?.options.detached).toBe(false);
    expect(spawner.calls[0]?.options.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(snapshot.streams[0]?.text).toBe("hello from fixture");
    expect(snapshot.tasks[0]?.status).toBe("completed");
    expect(snapshot.agents[0]?.status).toBe("completed");
    expect(diagnostics).not.toContain("RUNTIME_EVENT_REJECTED");

    await driver.dispose();
  });

  test("is independent of stdout JSONL chunk boundaries", async () => {
    const wholeRuntime = makeRuntime();
    const wholeSpawner = new FakeSpawner();
    const wholeDriver = createOpenCodeDriver({ runtime: wholeRuntime, spawner: wholeSpawner });
    const wholeRun = wholeDriver.run({ prompt: "hello" });
    const wholeChild = wholeSpawner.children[0];
    if (wholeChild === undefined) throw new Error("whole fake child was not created");
    const data = await readFixture("simple.jsonl");
    wholeChild.stdout.push(data);
    wholeChild.complete();

    const splitRuntime = makeRuntime();
    const splitSpawner = new FakeSpawner();
    const splitDriver = createOpenCodeDriver({ runtime: splitRuntime, spawner: splitSpawner });
    const splitRun = splitDriver.run({ prompt: "hello" });
    const splitChild = splitSpawner.children[0];
    if (splitChild === undefined) throw new Error("split fake child was not created");
    for (const character of data) splitChild.stdout.push(character);
    splitChild.complete();

    expect((await wholeRun.result).status).toBe("completed");
    expect((await splitRun.result).status).toBe("completed");
    expect(splitRuntime.snapshot().streams[0]?.text).toBe(wholeRuntime.snapshot().streams[0]?.text);
    expect(splitRuntime.events.map((event) => event.type)).toEqual(
      wholeRuntime.events.map((event) => event.type),
    );
    await wholeDriver.dispose();
    await splitDriver.dispose();
  });

  test("deduplicates tool lifecycle and preserves final assistant text", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createOpenCodeDriver({ runtime, spawner });
    const run = driver.run({ prompt: "list files" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stdout.push(await readFixture("tool.jsonl"));
    child.complete();

    expect((await run.result).status).toBe("completed");
    const snapshot = runtime.snapshot();
    expect(snapshot.tools).toHaveLength(1);
    expect(snapshot.tools[0]?.status).toBe("success");
    expect(snapshot.streams.find((stream) => stream.stream === "assistant")?.text).toBe("DONE");
    await driver.dispose();
  });

  test("maps reasoning and explicit subtask data through the adapter", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const driver = createOpenCodeDriver({ runtime, spawner });
    const run = driver.run({ prompt: "inspect" });
    const child = spawner.children[0];
    if (child === undefined) throw new Error("fake child was not created");

    child.stdout.push(await readFixture("reasoning.jsonl"));
    child.stdout.push(await readFixture("subtask.jsonl"));
    child.complete();

    expect((await run.result).status).toBe("completed");
    const snapshot = runtime.snapshot();
    expect(snapshot.streams.find((stream) => stream.stream === "reasoning")?.text).toBe(
      "public reasoning",
    );
    expect(snapshot.agents).toHaveLength(2);
    expect(snapshot.flow.edges).toHaveLength(1);
    await driver.dispose();
  });

  test("returns failed for a spawn failure without throwing from run", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    spawner.throwError = new Error("ENOENT");
    const diagnostics: string[] = [];
    const driver = createOpenCodeDriver({
      runtime,
      spawner,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });

    const run = driver.run({ prompt: "hello" });

    expect(run.state).toBe("failed");
    expect((await run.result).status).toBe("failed");
    expect(diagnostics).toContain("SPAWN_FAILED");
    await driver.dispose();
  });

  test("detects a silent zero-exit process", async () => {
    const runtime = makeRuntime();
    const spawner = new FakeSpawner();
    const diagnostics: string[] = [];
    const driver = createOpenCodeDriver({
      runtime,
      spawner,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const run = driver.run({ prompt: "hello" });
    spawner.children[0]?.complete();

    expect((await run.result).status).toBe("failed");
    expect(diagnostics).toContain("EMPTY_SUCCESSFUL_RUN");
    await driver.dispose();
  });
});
