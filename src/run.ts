import type {
  OpenCodeAdapter,
  OpenCodeAdapterDiagnostic,
  OpenCodeAdapterFinishInput,
} from "@murasame/adapter-opencode";
import type { MurasameEvent } from "@murasame/protocol";
import { type CancelEscalationStage, nextEscalationSignal } from "./cancellation.ts";
import { buildOpenCodeEnvironment } from "./environment.ts";
import { createRunAgentId, createRunTaskId } from "./ids.ts";
import { finalRunStatus, isTerminalRunState } from "./lifecycle.ts";
import { chunkByteLength } from "./process.ts";
import { BoundedTailBuffer } from "./stderr.ts";
import type {
  Disposable,
  InternalOpenCodeRunOptions,
  OpenCodeChildProcess,
  OpenCodeDriverDiagnostic,
  OpenCodeDriverDiagnosticListener,
  OpenCodeRunHandle,
  OpenCodeRunResult,
  OpenCodeRunState,
} from "./types.ts";

type AdapterFinishReason = NonNullable<OpenCodeAdapterFinishInput["reason"]>;

export class InternalOpenCodeRun implements OpenCodeRunHandle {
  readonly id: import("./types.ts").OpenCodeRunId;
  readonly result: Promise<OpenCodeRunResult>;

  #state: OpenCodeRunState = "starting";
  #child: OpenCodeChildProcess | undefined;
  #adapter: OpenCodeAdapter;
  #resolveResult!: (result: OpenCodeRunResult) => void;
  #listeners = new Set<OpenCodeDriverDiagnosticListener>();
  #stderr: BoundedTailBuffer;
  #stdoutDecoder = new TextDecoder();
  #stderrDecoder = new TextDecoder();
  #stdoutEnded = false;
  #stderrEnded = false;
  #processExitKnown = false;
  #exitCode: number | null = null;
  #exitSignal: NodeJS.Signals | null = null;
  #executionFailed = false;
  #cancelRequested = false;
  #terminationRequested = false;
  #cancelReason: string | undefined;
  #finishCalled = false;
  #finalizing = false;
  #finalized = false;
  #timeoutHandle: unknown;
  #escalationHandle: unknown;
  #stdoutBytes = 0;
  #stderrBytes = 0;
  #semanticEventCount = 0;
  #liveSemanticEventCount = 0;
  #startedAt: number;

  constructor(private readonly options: InternalOpenCodeRunOptions) {
    this.id = options.id;
    this.#startedAt = options.now();
    this.#stderr = new BoundedTailBuffer(options.stderrLimit);
    this.#adapter = options.adapterFactory({
      sessionId: options.runtime.sessionId,
      agentId: createRunAgentId(options.id),
      taskId: createRunTaskId(options.id),
      eventIdPrefix: options.id,
      ...(options.provider === undefined ? {} : { provider: options.provider }),
      ...(options.input.model === undefined ? {} : { model: options.input.model }),
      sequenceProvider: options.runtime.sequenceProvider,
      onDiagnostic: (diagnostic) => this.handleAdapterDiagnostic(diagnostic),
    });
    this.result = new Promise<OpenCodeRunResult>((resolve) => {
      this.#resolveResult = resolve;
    });
  }

  get state(): OpenCodeRunState {
    return this.#state;
  }

  get pid(): number | undefined {
    return this.#child?.pid;
  }

  start(): void {
    let child: OpenCodeChildProcess;
    try {
      child = this.options.spawner.spawn(this.options.executable, this.options.args, {
        cwd: this.options.input.cwd ?? process.cwd(),
        env: buildOpenCodeEnvironment(this.options.baseEnv, this.options.input.env),
        shell: false,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      this.report("error", "SPAWN_FAILED", `could not spawn ${this.options.executable}`, error);
      this.#executionFailed = true;
      this.#processExitKnown = true;
      this.#stdoutEnded = true;
      this.#stderrEnded = true;
      this.finalize();
      return;
    }

    this.#child = child;
    this.#state = "running";
    this.attachProcess(child);
    this.scheduleTimeout();
  }

  cancel(reason = "cancelled"): void {
    if (this.#finalized || this.#cancelRequested) return;
    this.#cancelRequested = true;
    this.#terminationRequested = true;
    this.#cancelReason = reason;
    if (isTerminalRunState(this.#state)) return;
    this.#state = "cancelling";

    if (this.#processExitKnown || this.#child === undefined) {
      this.tryFinalize();
      return;
    }

    this.sendSignal("SIGINT");
    this.scheduleEscalation("SIGTERM");
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): void {
    if (this.#finalized) return;
    this.#terminationRequested = true;
    this.#cancelRequested = true;
    this.#cancelReason = `kill:${signal}`;
    if (!isTerminalRunState(this.#state)) this.#state = "cancelling";
    this.clearEscalationTimer();
    if (this.#processExitKnown) {
      this.tryFinalize();
      return;
    }
    this.sendSignal(signal);
  }

  onDiagnostic(listener: OpenCodeDriverDiagnosticListener): Disposable {
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    this.#listeners.add(listener);
    let active = true;
    return {
      dispose: () => {
        if (!active) return;
        active = false;
        this.#listeners.delete(listener);
      },
    };
  }

  private attachProcess(child: OpenCodeChildProcess): void {
    child.once("error", (error) => this.handleProcessError(error));
    child.once("exit", (code, signal) => this.handleProcessExit(code, signal));
    child.once("close", (code, signal) => this.handleProcessClose(code, signal));

    if (child.stdout === null) {
      this.#stdoutEnded = true;
    } else {
      this.configureEncoding(child.stdout, "stdout");
      child.stdout.on("data", (chunk) => this.handleStdoutChunk(chunk));
      child.stdout.once("end", () => this.handleStdoutEnd());
      child.stdout.once("close", () => this.handleStdoutEnd());
    }

    if (child.stderr === null) {
      this.#stderrEnded = true;
    } else {
      this.configureEncoding(child.stderr, "stderr");
      child.stderr.on("data", (chunk) => this.handleStderrChunk(chunk));
      child.stderr.once("end", () => this.handleStderrEnd());
      child.stderr.once("close", () => this.handleStderrEnd());
    }
  }

  private configureEncoding(
    stream: NonNullable<OpenCodeChildProcess["stdout"]>,
    name: "stdout" | "stderr",
  ): void {
    if (stream.setEncoding === undefined) return;
    try {
      stream.setEncoding("utf8");
    } catch (error) {
      this.report("warning", "UNEXPECTED_PROCESS_STATE", `could not set ${name} encoding`, error);
    }
  }

  private scheduleTimeout(): void {
    const timeoutMs = this.options.input.timeoutMs ?? this.options.defaultTimeoutMs;
    if (timeoutMs === undefined) return;
    this.#timeoutHandle = this.options.timer.setTimeout(() => {
      if (this.#finalized || this.#processExitKnown) return;
      this.report("warning", "RUN_TIMEOUT", `OpenCode run exceeded ${timeoutMs}ms`);
      this.cancel("timeout");
    }, timeoutMs);
  }

  private scheduleEscalation(signal: CancelEscalationStage): void {
    this.clearEscalationTimer();
    this.#escalationHandle = this.options.timer.setTimeout(() => {
      this.#escalationHandle = undefined;
      if (this.#finalized || this.#processExitKnown || !this.#cancelRequested) return;
      this.report(
        "warning",
        "CANCEL_ESCALATED",
        `OpenCode did not stop after cancellation; sending ${signal}`,
      );
      this.sendSignal(signal);
      const next = nextEscalationSignal(signal);
      if (next !== undefined) this.scheduleEscalation(next as CancelEscalationStage);
    }, this.options.gracefulCancelMs);
  }

  private clearTimeout(): void {
    if (this.#timeoutHandle === undefined) return;
    this.options.timer.clearTimeout(this.#timeoutHandle);
    this.#timeoutHandle = undefined;
  }

  private clearEscalationTimer(): void {
    if (this.#escalationHandle === undefined) return;
    this.options.timer.clearTimeout(this.#escalationHandle);
    this.#escalationHandle = undefined;
  }

  private handleStdoutChunk(chunk: string | Uint8Array): void {
    if (this.#finalized) return;
    this.#stdoutBytes += chunkByteLength(chunk);
    const text = this.decodeChunk(chunk, "stdout");
    if (text.length === 0) return;
    try {
      this.ingestAdapterEvents(this.#adapter.pushRunJson(text), true);
    } catch (error) {
      this.handleAdapterFailure(error);
    }
  }

  private handleStdoutEnd(): void {
    if (this.#stdoutEnded) return;
    this.#stdoutEnded = true;
    const trailing = this.#stdoutDecoder.decode();
    if (trailing.length > 0) {
      try {
        this.ingestAdapterEvents(this.#adapter.pushRunJson(trailing), true);
      } catch (error) {
        this.handleAdapterFailure(error);
      }
    }
    this.tryFinalize();
  }

  private handleStderrChunk(chunk: string | Uint8Array): void {
    if (this.#finalized) return;
    this.#stderrBytes += chunkByteLength(chunk);
    const text = this.decodeChunk(chunk, "stderr");
    this.appendStderr(text);
  }

  private handleStderrEnd(): void {
    if (this.#stderrEnded) return;
    this.#stderrEnded = true;
    this.appendStderr(this.#stderrDecoder.decode());
  }

  private appendStderr(text: string): void {
    if (!this.#stderr.append(text)) return;
    this.report(
      "warning",
      "STDERR_TRUNCATED",
      `OpenCode stderr exceeded ${this.#stderr.limit} bytes`,
    );
  }

  private decodeChunk(chunk: string | Uint8Array, stream: "stdout" | "stderr"): string {
    if (typeof chunk === "string") return chunk;
    if (stream === "stdout") return this.#stdoutDecoder.decode(chunk, { stream: true });
    return this.#stderrDecoder.decode(chunk, { stream: true });
  }

  private handleProcessError(error: unknown): void {
    if (this.#finalized) return;
    this.#executionFailed = true;
    this.report("error", "SPAWN_FAILED", "OpenCode process emitted a process error", error);
    if (this.#child?.pid === undefined && !this.#processExitKnown) {
      this.#processExitKnown = true;
      this.#stdoutEnded = true;
      this.#stderrEnded = true;
      this.finalize();
      return;
    }
    this.terminateAfterFailure();
    this.tryFinalize();
  }

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.#processExitKnown) return;
    this.#processExitKnown = true;
    this.#exitCode = code;
    this.#exitSignal = signal;
    if (signal !== null) {
      this.report("warning", "PROCESS_EXITED_BY_SIGNAL", `OpenCode exited with signal ${signal}`);
    } else if (code !== 0) {
      this.report("error", "PROCESS_EXIT_NON_ZERO", `OpenCode exited with status ${String(code)}`);
    }
    this.tryFinalize();
  }

  private handleProcessClose(code: number | null, signal: NodeJS.Signals | null): void {
    if (!this.#processExitKnown) this.handleProcessExit(code, signal);
    if (!this.#stdoutEnded) this.handleStdoutEnd();
    if (!this.#stderrEnded) this.handleStderrEnd();
    this.tryFinalize();
  }

  private terminateAfterFailure(): void {
    if (this.#terminationRequested || this.#processExitKnown || this.#child === undefined) return;
    this.#terminationRequested = true;
    this.sendSignal("SIGTERM");
  }

  private sendSignal(signal: NodeJS.Signals): void {
    if (this.#child === undefined || this.#processExitKnown) return;
    try {
      this.#child.kill(signal);
    } catch (error) {
      this.report(
        "error",
        "UNEXPECTED_PROCESS_STATE",
        `could not send ${signal} to OpenCode`,
        error,
      );
    }
  }

  private handleAdapterDiagnostic(diagnostic: OpenCodeAdapterDiagnostic): void {
    this.report("info", "ADAPTER_DIAGNOSTIC", "OpenCode adapter reported a diagnostic", diagnostic);
  }

  private handleAdapterFailure(error: unknown): void {
    if (this.#finalized) return;
    this.#executionFailed = true;
    this.report(
      "error",
      "ADAPTER_FAILURE",
      "OpenCode adapter failed while consuming stdout",
      error,
    );
    this.terminateAfterFailure();
  }

  private ingestAdapterEvents(events: readonly MurasameEvent[], live: boolean): void {
    if (events.length === 0) return;
    this.#semanticEventCount += events.length;
    if (live) this.#liveSemanticEventCount += events.length;
    try {
      const result = this.options.runtime.ingestMany(events);
      if (result.rejected > 0) {
        this.report(
          "warning",
          "RUNTIME_EVENT_REJECTED",
          `${result.rejected} OpenCode event(s) were rejected by runtime`,
          result.diagnostics,
        );
      }
    } catch (error) {
      this.#executionFailed = true;
      this.report("error", "RUNTIME_EVENT_REJECTED", "runtime rejected OpenCode events", error);
      this.terminateAfterFailure();
    }
  }

  private tryFinalize(): void {
    if (!this.#processExitKnown || !this.#stdoutEnded) return;
    this.finalize();
  }

  private finalize(): void {
    if (this.#finalized || this.#finalizing) return;
    this.#finalizing = true;
    this.clearTimeout();
    this.clearEscalationTimer();

    try {
      try {
        this.ingestAdapterEvents(this.#adapter.flush(), true);
      } catch (error) {
        this.handleAdapterFailure(error);
      }

      const emptySuccessfulRun =
        !this.#cancelRequested &&
        !this.#executionFailed &&
        this.#exitCode === 0 &&
        this.#exitSignal === null &&
        this.#liveSemanticEventCount === 0;
      if (emptySuccessfulRun) {
        this.#executionFailed = true;
        this.report(
          "error",
          "EMPTY_SUCCESSFUL_RUN",
          "OpenCode exited successfully without producing semantic stdout events",
        );
      }

      const reason: AdapterFinishReason = this.#cancelRequested
        ? "cancelled"
        : this.#executionFailed || this.#exitCode !== 0 || this.#exitSignal !== null
          ? "failed"
          : "completed";
      if (!this.#finishCalled) {
        this.#finishCalled = true;
        try {
          this.ingestAdapterEvents(
            this.#adapter.finish({
              ...(this.#exitCode === null ? {} : { exitCode: this.#exitCode }),
              signal: this.#exitSignal,
              reason,
            }),
            false,
          );
        } catch (error) {
          this.#executionFailed = true;
          this.report(
            "error",
            "ADAPTER_FAILURE",
            "OpenCode adapter failed during finalization",
            error,
          );
        }
      }

      let openCodeSessionId: string | undefined;
      try {
        openCodeSessionId = this.#adapter.context.openCodeSessionId;
      } catch (error) {
        this.#executionFailed = true;
        this.report("error", "ADAPTER_FAILURE", "could not read OpenCode adapter context", error);
      }
      const status = finalRunStatus({
        cancelRequested: this.#cancelRequested,
        executionFailed: this.#executionFailed,
        exitCode: this.#exitCode,
        exitSignal: this.#exitSignal,
      });
      const finishedAt = Math.max(this.options.now(), this.#startedAt);
      const result: OpenCodeRunResult = Object.freeze({
        runId: this.id,
        status,
        exitCode: this.#exitCode,
        signal: this.#exitSignal,
        ...(this.#cancelReason === undefined ? {} : { cancelReason: this.#cancelReason }),
        ...(openCodeSessionId === undefined ? {} : { openCodeSessionId }),
        stderr: this.#stderr.value,
        stdoutBytes: this.#stdoutBytes,
        stderrBytes: this.#stderrBytes,
        semanticEventCount: this.#semanticEventCount,
        startedAt: this.#startedAt,
        finishedAt,
        durationMs: finishedAt - this.#startedAt,
      });
      this.#state = status;
      this.#finalized = true;
      this.#resolveResult(result);
      this.options.onFinished();
    } finally {
      this.#finalizing = false;
    }
  }

  private report(
    severity: OpenCodeDriverDiagnostic["severity"],
    code: OpenCodeDriverDiagnostic["code"],
    message: string,
    cause?: unknown,
  ): void {
    const diagnostic: OpenCodeDriverDiagnostic = Object.freeze({
      severity,
      code,
      message,
      runId: this.id,
      ...(cause === undefined ? {} : { cause }),
    });
    try {
      this.options.emit(diagnostic);
    } catch {
      // Diagnostics must not destabilize the process-control path.
    }
    for (const listener of [...this.#listeners]) {
      try {
        listener(diagnostic);
      } catch {
        // A run-local diagnostic listener is observational only.
      }
    }
  }
}

export function createInternalOpenCodeRun(
  options: InternalOpenCodeRunOptions,
): InternalOpenCodeRun {
  return new InternalOpenCodeRun(options);
}
