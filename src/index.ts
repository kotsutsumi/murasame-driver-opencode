/**
 * @murasame/driver-opencode
 *
 * Process/control layer for the local `opencode run --format json` backend.
 */

export { buildOpenCodeArgs, isReservedOpenCodeArgument } from "./command.ts";
export { createOpenCodeDriver } from "./driver.ts";
export {
  OpenCodeDriverDisposedError,
  OpenCodeDriverError,
  OpenCodeRunConfigurationError,
  OpenCodeSpawnError,
} from "./errors.ts";
export { asOpenCodeRunId, createOpenCodeRunId } from "./ids.ts";
export { nodeProcessSpawner } from "./spawner.ts";
export type {
  Disposable,
  OpenCodeAdapterFactory,
  OpenCodeChildProcess,
  OpenCodeDriver,
  OpenCodeDriverDiagnostic,
  OpenCodeDriverDiagnosticCode,
  OpenCodeDriverDiagnosticListener,
  OpenCodeDriverDiagnosticSeverity,
  OpenCodeDriverOptions,
  OpenCodeProcessSpawner,
  OpenCodeReadableStream,
  OpenCodeRunHandle,
  OpenCodeRunId,
  OpenCodeRunInput,
  OpenCodeRunResult,
  OpenCodeRunState,
  OpenCodeRunStatus,
  OpenCodeSpawnOptions,
  OpenCodeTimerScheduler,
} from "./types.ts";
