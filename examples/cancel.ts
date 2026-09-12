import { asSessionId } from "@murasame/protocol";
import { createRuntime } from "@murasame/runtime";
import { createOpenCodeDriver } from "../src/index.ts";

const runtime = createRuntime({
  sessionId: asSessionId(`session-opencode-cancel-${Date.now()}`),
});
const driver = createOpenCodeDriver({ runtime, gracefulCancelMs: 2_000 });

try {
  const run = driver.run({
    prompt: "Work slowly and explain this repository in detail.",
    timeoutMs: 30_000,
  });
  const cancellation = setTimeout(() => run.cancel("example-cancel"), 1_000);
  const result = await run.result;
  clearTimeout(cancellation);
  console.log(JSON.stringify({ result, snapshot: runtime.snapshot() }, null, 2));
} finally {
  await driver.dispose();
}
