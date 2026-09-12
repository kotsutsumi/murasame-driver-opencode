import type { OpenCodeAdapter, OpenCodeAdapterOptions } from "@murasame/adapter-opencode";
import type { MurasameRuntime } from "@murasame/runtime";

export type OpenCodeRunId = string & { readonly __brand: "OpenCodeRunId" };

export type OpenCodeRunState =
  | "starting"
  | "running"
  | "cancelling"
  | "completed"
  | "failed"
  | "cancelled";

export type OpenCodeRunStatus = "completed" | "failed" | "cancelled";

export interface OpenCodeRunInput {
  readonly prompt: string;
  readonly cwd?: string;
  readonly model?: string;
  readonly variant?: string;
  readonly agent?: string;
  readonly command?: string;
  readonly files?: readonly string[];
  readonly sessionId?: string;
  readonly continueSession?: boolean;
  readonly forkSession?: boolean;
  readonly title?: string;
  readonly share?: boolean;
  readonly thinking?: boolean;
  readonly autoApprove?: boolean;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs?: number;
  readonly extraArgs?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface OpenCodeRunResult {
  readonly runId: OpenCodeRunId;
  readonly status: OpenCodeRunStatus;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly cancelReason?: string;
  readonly openCodeSessionId?: string;
  readonly stderr: string;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly semanticEventCount: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly durationMs: number;
}

export interface Disposable {
  dispose(): void;
}

export type OpenCodeDriverDiagnosticSeverity = "info" | "warning" | "error";

export type OpenCodeDriverDiagnosticCode =
  | "SPAWN_FAILED"
  | "STDIN_WRITE_FAILED"
  | "STDERR_TRUNCATED"
  | "ADAPTER_DIAGNOSTIC"
  | "ADAPTER_FAILURE"
  | "RUNTIME_EVENT_REJECTED"
  | "RUN_TIMEOUT"
  | "CANCEL_ESCALATED"
  | "PROCESS_EXITED_BY_SIGNAL"
  | "PROCESS_EXIT_NON_ZERO"
  | "EMPTY_SUCCESSFUL_RUN"
  | "STDOUT_CLOSED_EARLY"
  | "UNEXPECTED_PROCESS_STATE"
  | "DRIVER_DISPOSED";

export interface OpenCodeDriverDiagnostic {
  readonly severity: OpenCodeDriverDiagnosticSeverity;
  readonly code: OpenCodeDriverDiagnosticCode;
  readonly message: string;
  readonly runId?: OpenCodeRunId;
  readonly cause?: unknown;
}

export type OpenCodeDriverDiagnosticListener = (diagnostic: OpenCodeDriverDiagnostic) => void;

export interface OpenCodeRunHandle {
  readonly id: OpenCodeRunId;
  readonly state: OpenCodeRunState;
  readonly pid: number | undefined;
  readonly result: Promise<OpenCodeRunResult>;

  cancel(reason?: string): void;
  kill(signal?: NodeJS.Signals): void;
  onDiagnostic(listener: OpenCodeDriverDiagnosticListener): Disposable;
}

export interface OpenCodeDriver {
  run(input: OpenCodeRunInput): OpenCodeRunHandle;
  dispose(): Promise<void>;
}

export interface OpenCodeDriverOptions {
  readonly runtime: MurasameRuntime;
  readonly executable?: string;
  readonly provider?: string;
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly stderrLimit?: number;
  readonly defaultTimeoutMs?: number;
  readonly gracefulCancelMs?: number;
  readonly onDiagnostic?: OpenCodeDriverDiagnosticListener;
  readonly spawner?: OpenCodeProcessSpawner;
  readonly processSpawner?: OpenCodeProcessSpawner;
  readonly adapterFactory?: OpenCodeAdapterFactory;
  readonly timer?: OpenCodeTimerScheduler;
  readonly now?: () => number;
}

export type OpenCodeAdapterFactory = (options: OpenCodeAdapterOptions) => OpenCodeAdapter;

export interface OpenCodeTimerScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface OpenCodeSpawnOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly shell: false;
  readonly detached: false;
  readonly stdio: readonly ["ignore", "pipe", "pipe"];
}

export interface OpenCodeReadableStream {
  setEncoding?(encoding: "utf8"): void;
  on(event: "data", listener: (chunk: string | Uint8Array) => void): unknown;
  once(event: "end" | "close", listener: () => void): unknown;
}

export interface OpenCodeChildProcess {
  readonly pid?: number;
  readonly stdin: null;
  readonly stdout: OpenCodeReadableStream | null;
  readonly stderr: OpenCodeReadableStream | null;

  once(event: "error", listener: (error: unknown) => void): unknown;
  once(
    event: "exit" | "close",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface OpenCodeProcessSpawner {
  spawn(
    command: string,
    args: readonly string[],
    options: OpenCodeSpawnOptions,
  ): OpenCodeChildProcess;
}

export interface InternalOpenCodeRunOptions {
  readonly id: OpenCodeRunId;
  readonly input: OpenCodeRunInput;
  readonly args: readonly string[];
  readonly runtime: MurasameRuntime;
  readonly executable: string;
  readonly provider?: string;
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly stderrLimit: number;
  readonly gracefulCancelMs: number;
  readonly defaultTimeoutMs?: number;
  readonly spawner: OpenCodeProcessSpawner;
  readonly adapterFactory: OpenCodeAdapterFactory;
  readonly timer: OpenCodeTimerScheduler;
  readonly now: () => number;
  readonly emit: (diagnostic: OpenCodeDriverDiagnostic) => void;
  readonly onFinished: () => void;
}
