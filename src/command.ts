import { OpenCodeRunConfigurationError } from "./errors.ts";
import type { OpenCodeRunInput } from "./types.ts";

const RESERVED_ARGUMENTS = new Set([
  "run",
  "json",
  "--format",
  "--attach",
  "--dir",
  "--port",
  "--username",
  "--password",
  "--interactive",
  "-i",
]);

/** Builds argv for the local `opencode run --format json` backend. */
export function buildOpenCodeArgs(input: OpenCodeRunInput): readonly string[] {
  const args: string[] = ["run", "--format", "json"];

  if (input.model !== undefined) args.push("--model", input.model);
  if (input.variant !== undefined) args.push("--variant", input.variant);
  if (input.agent !== undefined) args.push("--agent", input.agent);
  if (input.command !== undefined) args.push("--command", input.command);
  for (const file of input.files ?? []) args.push("--file", file);
  if (input.sessionId !== undefined) args.push("--session", input.sessionId);
  if (input.continueSession === true) args.push("--continue");
  if (input.forkSession === true) args.push("--fork");
  if (input.title !== undefined) args.push("--title", input.title);
  if (input.share === true) args.push("--share");
  if (input.thinking === true) args.push("--thinking");
  if (input.autoApprove === true) args.push("--auto");

  for (const argument of input.extraArgs ?? []) {
    if (isReservedOpenCodeArgument(argument)) {
      throw new OpenCodeRunConfigurationError(`extraArgs cannot override ${argument}`);
    }
    args.push(argument);
  }

  // OpenCode's run command accepts one or more positional message arguments.
  // Keep the prompt as one argv element and append it after all options.
  args.push(input.prompt);
  return Object.freeze(args);
}

export function isReservedOpenCodeArgument(argument: string): boolean {
  const [name] = argument.split("=", 1);
  if (name === undefined) return false;
  if (RESERVED_ARGUMENTS.has(name)) return true;
  return argument === "json";
}
