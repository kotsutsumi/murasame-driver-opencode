import type { OpenCodeTimerScheduler } from "./types.ts";

export const defaultTimer: OpenCodeTimerScheduler = {
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export function chunkByteLength(chunk: string | Uint8Array): number {
  return typeof chunk === "string" ? Buffer.byteLength(chunk, "utf8") : chunk.byteLength;
}
