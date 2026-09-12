import type { AgentId, TaskId } from "@murasame/protocol";
import { asAgentId, asTaskId } from "@murasame/protocol";
import type { OpenCodeRunId } from "./types.ts";

export function asOpenCodeRunId(value: string): OpenCodeRunId {
  if (value.length === 0) throw new TypeError("OpenCodeRunId must not be empty");
  return value as OpenCodeRunId;
}

export function createOpenCodeRunId(sequence: number): OpenCodeRunId {
  return asOpenCodeRunId(`opencode-run-${sequence}`);
}

export function createRunAgentId(runId: OpenCodeRunId): AgentId {
  return asAgentId(`agent_opencode_run_${runId}`);
}

export function createRunTaskId(runId: OpenCodeRunId): TaskId {
  return asTaskId(`task_opencode_run_${runId}`);
}
