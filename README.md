# @murasame/driver-opencode

`@murasame/driver-opencode` is the process/control layer for the local
OpenCode `run --format json` backend. It launches OpenCode, feeds its stdout to
`@murasame/adapter-opencode`, and ingests the resulting `MurasameEvent` values
into `@murasame/runtime`.

The v0.1 driver is intentionally process-only. It does not start an OpenCode
server, open HTTP/SSE connections, perform REST snapshot reconciliation, parse
OpenCode semantics itself, render a TUI, or own a PTY.

## Architecture

```text
prompt
  │ one positional argv message
  ▼
opencode run --format json
  │
  ├─ stdout ──▶ @murasame/adapter-opencode ──▶ @murasame/runtime
  │
  └─ stderr ──▶ bounded diagnostics/result tail
```

OpenCode's run-json, server bus, and REST snapshot inputs are all understood by
the adapter. This driver uses only run-json; server and snapshot integration is
reserved for a future backend.

## Usage

```ts
import { asSessionId } from "@murasame/protocol";
import { createOpenCodeDriver } from "@murasame/driver-opencode";
import { createRuntime } from "@murasame/runtime";

const runtime = createRuntime({
  sessionId: asSessionId("session-001"),
});
const driver = createOpenCodeDriver({ runtime });

const run = driver.run({
  prompt: "Reply exactly hello",
  cwd: process.cwd(),
});

const result = await run.result;
console.log(result.status);
console.log(runtime.snapshot());

await driver.dispose();
```

One `run()` creates one adapter, one MURASAME agent/task identity, and one
process. The prompt is passed as one positional argv value because that is the
OpenCode `run` CLI contract. The process uses `shell: false` and stdin is
ignored. All runs share the runtime's session-scoped sequence provider and use
their run ID as the adapter event-ID namespace.

## Streams and lifecycle

stdout is the only semantic input. The driver never calls `JSON.parse` on it;
`@murasame/adapter-opencode` owns run-json parsing. stderr is diagnostic text,
kept as a bounded tail and never sent to the adapter or merged with stdout.

After process exit and stdout EOF, the driver calls `adapter.flush()`, then
`adapter.finish()`, ingests both results into the runtime, and only then
resolves `run.result`. Process failures resolve a failed or cancelled result;
configuration errors throw synchronously from `run()`.

Cancellation sends `SIGINT`, then escalates to `SIGTERM` and `SIGKILL` after the
configured grace interval. A timeout requests cancellation. The driver does
not create a scheduler or UI frame loop.

## Controls

`OpenCodeRunInput` exposes model, variant, agent, command, files, session
continuation/forking, title, share, thinking, auto-approval, environment,
timeout, and an `extraArgs` escape hatch. The driver always owns `run` and
`--format json`; `extraArgs` cannot replace the semantic transport or switch
to attach/server/interactive modes.

OpenCode CLI flags are versioned independently of this package. In particular,
callers should verify that their installed version supports optional flags such
as `--auto` and `--thinking`.

## Development

```sh
bun install
bun run check
bun run example:hello
```

Unit tests use a fake process spawner. Examples invoke the installed
`opencode` executable and may require a configured provider.
