import { spawn as nodeSpawn } from "node:child_process";
import type {
  OpenCodeChildProcess,
  OpenCodeProcessSpawner,
  OpenCodeSpawnOptions,
} from "./types.ts";

export const nodeProcessSpawner: OpenCodeProcessSpawner = {
  spawn(
    command: string,
    args: readonly string[],
    options: OpenCodeSpawnOptions,
  ): OpenCodeChildProcess {
    return nodeSpawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    }) as unknown as OpenCodeChildProcess;
  },
};
