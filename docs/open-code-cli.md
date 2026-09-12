# OpenCode CLI contract

The v0.1 driver targets local non-interactive execution:

```text
opencode run --format json <message>
```

The message is passed as one positional argument. The driver uses
`shell: false`, `detached: false`, `stdio: ["ignore", "pipe", "pipe"]`, and
does not parse or merge stderr.

## Managed and supported options

The driver always manages:

```text
run --format json
```

It can pass through model, variant, agent, command, repeated file, session,
continue, fork, title, share, thinking, and auto-approval options. `cwd` is
applied to the spawned process; the remote/server-oriented `--dir` option is
not used by this backend.

`extraArgs` is an escape hatch for provider-specific flags, but it rejects
`run`, `--format`, `json`, `--attach`, `--dir`, server auth/port flags, and
interactive mode flags. This prevents a caller from silently changing the
transport contract.

## Semantic streams

stdout is the semantic source and is passed unchanged to
`OpenCodeAdapter.pushRunJson()`. stderr is diagnostic text only. A JSON-looking
stderr line is not an OpenCode event.

OpenCode run-json output can omit final or intermediate events in some CLI
versions. The process driver does not invent missing events and does not fetch
REST snapshots. It closes the observed run through adapter `flush()` and
`finish()`; complete reconciliation belongs to a future server backend.

## Session continuation

`sessionId`, `continueSession`, and `forkSession` map to the corresponding CLI
options. A resumed OpenCode session gets a new MURASAME run, Agent, Task, and
event-ID namespace. The observed OpenCode session ID is returned in
`OpenCodeRunResult.openCodeSessionId` when the adapter sees it.

## Non-goals

This package does not start `opencode serve`, connect to `/event`, use REST or
SSE, use `--attach`, answer permissions/questions, parse the OpenCode TUI,
own a PTY, retry, or reconcile session snapshots.
