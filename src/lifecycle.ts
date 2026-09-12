import type { OpenCodeRunResult, OpenCodeRunState } from "./types.ts";

export function finalRunStatus(
  state: Pick<
    {
      cancelRequested: boolean;
      executionFailed: boolean;
      exitCode: number | null;
      exitSignal: NodeJS.Signals | null;
    },
    "cancelRequested" | "executionFailed" | "exitCode" | "exitSignal"
  >,
): OpenCodeRunResult["status"] {
  if (state.cancelRequested) return "cancelled";
  if (state.executionFailed || state.exitCode !== 0 || state.exitSignal !== null) return "failed";
  return "completed";
}

export function isTerminalRunState(state: OpenCodeRunState): boolean {
  return state === "completed" || state === "failed" || state === "cancelled";
}
