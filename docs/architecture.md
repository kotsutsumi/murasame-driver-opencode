# Process backend architecture

```text
caller
  │ OpenCodeRunInput
  ▼
OpenCodeDriver
  │ spawn(shell=false, detached=false, stdin=ignore)
  ├─ argv message
  ├─ stdout ──▶ OpenCodeAdapter.pushRunJson(string)
  │                         │
  │                         └─▶ runtime.ingestMany(MurasameEvent[])
  └─ stderr ──▶ bounded diagnostic tail

process exit + stdout EOF
  │
  ├─ adapter.flush()
  ├─ adapter.finish()
  └─ runtime final state
```

The driver does not inspect event types or dispatch tool/subtask semantics.
Those responsibilities belong to `@murasame/adapter-opencode`. Runtime state
reduction belongs to `@murasame/runtime`.

Each process run receives a fresh adapter and fresh MURASAME identities. The
runtime sequence provider is shared, while `opencode-run-N` is passed to the
adapter as the event-ID namespace. This keeps concurrent runs in one session
unique without making the driver aware of vendor event semantics.

The v0.1 transport is only:

```text
opencode run --format json
```

The adapter's bus and snapshot ingress are intentionally not called here. A
future server backend can feed those ingress methods from `/event` and the
session REST APIs without changing this process backend.
