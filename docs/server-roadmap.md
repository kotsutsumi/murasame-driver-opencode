# Future server backend

The process backend deliberately stops at `opencode run --format json`.

```text
opencode serve
  │
  ├─ /event SSE ───────────────▶ adapter.acceptBusEvent()
  ├─ /session/:id/message ─────▶ adapter.acceptSnapshot()
  ├─ /session/:id/todo ────────▶ adapter.acceptSnapshot()
  ├─ /session/status ──────────▶ adapter.acceptSnapshot()
  └─ /session/:id/abort ───────▶ server cancellation
```

The likely v0.2 design is a direct REST/SSE backend. It can combine low
latency live bus events with session snapshots for reconciliation, while
keeping this process backend unchanged. The driver itself does not implement
HTTP, SSE, server health checks, or polling.
