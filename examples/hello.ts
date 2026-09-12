import { asSessionId } from "@murasame/protocol";
import { createRuntime } from "@murasame/runtime";
import { createOpenCodeDriver } from "../src/index.ts";

const runtime = createRuntime({
  sessionId: asSessionId(`session-opencode-hello-${Date.now()}`),
});
const driver = createOpenCodeDriver({ runtime });

try {
  const run = driver.run({ prompt: "Reply exactly hello" });
  const result = await run.result;
  console.log(JSON.stringify({ result, snapshot: runtime.snapshot() }, null, 2));
} finally {
  await driver.dispose();
}
