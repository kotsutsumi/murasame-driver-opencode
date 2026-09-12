import { createOpenCodeAdapter } from "@murasame/adapter-opencode";
import { buildOpenCodeArgs } from "./command.ts";
import { OpenCodeDriverDisposedError } from "./errors.ts";
import { createOpenCodeRunId } from "./ids.ts";
import { defaultTimer } from "./process.ts";
import { createInternalOpenCodeRun, type InternalOpenCodeRun } from "./run.ts";
import { nodeProcessSpawner } from "./spawner.ts";
import type {
  OpenCodeAdapterFactory,
  OpenCodeDriver,
  OpenCodeDriverDiagnostic,
  OpenCodeDriverOptions,
  OpenCodeProcessSpawner,
  OpenCodeRunHandle,
  OpenCodeRunInput,
} from "./types.ts";
import { validateDriverOptions, validateRunInput } from "./validation.ts";

const DEFAULT_STDERR_LIMIT = 1024 * 1024;
const DEFAULT_GRACEFUL_CANCEL_MS = 2_000;

export function createOpenCodeDriver(options: OpenCodeDriverOptions): OpenCodeDriver {
  return new OpenCodeDriverImpl(options);
}

class OpenCodeDriverImpl implements OpenCodeDriver {
  #disposed = false;
  #nextRun = 1;
  #runs = new Map<string, InternalOpenCodeRun>();
  #onDiagnostic: OpenCodeDriverOptions["onDiagnostic"];
  #runtime: OpenCodeDriverOptions["runtime"];
  #executable: string;
  #provider: string | undefined;
  #baseEnv: OpenCodeDriverOptions["baseEnv"];
  #stderrLimit: number;
  #defaultTimeoutMs: number | undefined;
  #gracefulCancelMs: number;
  #spawner: OpenCodeProcessSpawner;
  #adapterFactory: OpenCodeAdapterFactory;
  #timer: NonNullable<OpenCodeDriverOptions["timer"]>;
  #now: () => number;

  constructor(options: OpenCodeDriverOptions) {
    validateDriverOptions(options);
    this.#runtime = options.runtime;
    this.#onDiagnostic = options.onDiagnostic;
    this.#executable = options.executable ?? "opencode";
    this.#provider = options.provider;
    this.#baseEnv = options.baseEnv;
    this.#stderrLimit = options.stderrLimit ?? DEFAULT_STDERR_LIMIT;
    this.#defaultTimeoutMs = options.defaultTimeoutMs;
    this.#gracefulCancelMs = options.gracefulCancelMs ?? DEFAULT_GRACEFUL_CANCEL_MS;
    this.#spawner = options.spawner ?? options.processSpawner ?? nodeProcessSpawner;
    this.#adapterFactory = options.adapterFactory ?? createOpenCodeAdapter;
    this.#timer = options.timer ?? defaultTimer;
    this.#now = options.now ?? Date.now;
  }

  run(input: OpenCodeRunInput): OpenCodeRunHandle {
    this.ensureActive();
    validateRunInput(input);
    const args = buildOpenCodeArgs(input);
    const id = createOpenCodeRunId(this.#nextRun);
    this.#nextRun += 1;
    const run = createInternalOpenCodeRun({
      id,
      input,
      args,
      runtime: this.#runtime,
      executable: this.#executable,
      ...(this.#provider === undefined ? {} : { provider: this.#provider }),
      ...(this.#baseEnv === undefined ? {} : { baseEnv: this.#baseEnv }),
      stderrLimit: this.#stderrLimit,
      ...(this.#defaultTimeoutMs === undefined ? {} : { defaultTimeoutMs: this.#defaultTimeoutMs }),
      gracefulCancelMs: this.#gracefulCancelMs,
      spawner: this.#spawner,
      adapterFactory: this.#adapterFactory,
      timer: this.#timer,
      now: this.#now,
      emit: (diagnostic) => this.report(diagnostic),
      onFinished: () => this.#runs.delete(id),
    });
    this.#runs.set(id, run);
    run.start();
    return run;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.report({
      severity: "info",
      code: "DRIVER_DISPOSED",
      message: "OpenCode driver is disposing active runs",
    });
    const activeRuns = [...this.#runs.values()];
    for (const run of activeRuns) run.cancel("driver-dispose");
    await Promise.all(activeRuns.map((run) => run.result));
  }

  private ensureActive(): void {
    if (this.#disposed) throw new OpenCodeDriverDisposedError();
  }

  private report(diagnostic: OpenCodeDriverDiagnostic): void {
    try {
      this.#onDiagnostic?.(diagnostic);
    } catch {
      // A driver diagnostic listener must not break process control.
    }
  }
}
