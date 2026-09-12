import { isReservedOpenCodeArgument } from "./command.ts";
import { OpenCodeRunConfigurationError } from "./errors.ts";
import type { OpenCodeDriverOptions, OpenCodeRunInput } from "./types.ts";

export function validateDriverOptions(options: OpenCodeDriverOptions): void {
  if (options.runtime === undefined || options.runtime === null) {
    throw new TypeError("runtime is required");
  }
  if (options.executable !== undefined && options.executable.trim().length === 0) {
    throw new OpenCodeRunConfigurationError("executable must not be empty");
  }
  validateNonNegativeInteger(options.stderrLimit, "stderrLimit");
  validateNonNegativeInteger(options.defaultTimeoutMs, "defaultTimeoutMs");
  validateNonNegativeInteger(options.gracefulCancelMs, "gracefulCancelMs");
}

export function validateRunInput(input: OpenCodeRunInput): void {
  if (typeof input.prompt !== "string" || input.prompt.length === 0) {
    throw new OpenCodeRunConfigurationError("prompt must be a non-empty string");
  }
  validateNonNegativeInteger(input.timeoutMs, "timeoutMs");

  for (const [name, value] of [
    ["cwd", input.cwd],
    ["model", input.model],
    ["variant", input.variant],
    ["agent", input.agent],
    ["command", input.command],
    ["sessionId", input.sessionId],
    ["title", input.title],
  ] as const) {
    if (value !== undefined && value.length === 0) {
      throw new OpenCodeRunConfigurationError(`${name} must not be empty`);
    }
  }

  if (input.sessionId !== undefined && input.continueSession === true) {
    throw new OpenCodeRunConfigurationError("sessionId and continueSession are mutually exclusive");
  }
  if (
    input.forkSession === true &&
    input.sessionId === undefined &&
    input.continueSession !== true
  ) {
    throw new OpenCodeRunConfigurationError("forkSession requires sessionId or continueSession");
  }

  validateStringArray(input.files, "files");
  for (const [index, argument] of (input.extraArgs ?? []).entries()) {
    if (argument.length === 0) {
      throw new OpenCodeRunConfigurationError(`extraArgs[${index}] must not be empty`);
    }
    if (isReservedOpenCodeArgument(argument)) {
      throw new OpenCodeRunConfigurationError(
        `extraArgs[${index}] attempts to override ${argument}`,
      );
    }
  }
}

function validateStringArray(values: readonly string[] | undefined, name: string): void {
  if (values === undefined) return;
  for (const [index, value] of values.entries()) {
    if (value.length === 0) {
      throw new OpenCodeRunConfigurationError(`${name}[${index}] must not be empty`);
    }
  }
}

function validateNonNegativeInteger(value: number | undefined, name: string): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OpenCodeRunConfigurationError(`${name} must be a non-negative safe integer`);
  }
}
