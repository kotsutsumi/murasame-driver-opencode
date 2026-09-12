export class OpenCodeDriverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeDriverError";
  }
}

export class OpenCodeDriverDisposedError extends OpenCodeDriverError {
  constructor(message = "OpenCode driver has been disposed") {
    super(message);
    this.name = "OpenCodeDriverDisposedError";
  }
}

export class OpenCodeSpawnError extends OpenCodeDriverError {
  constructor(message: string, options?: ErrorOptions) {
    super(message);
    this.name = "OpenCodeSpawnError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export class OpenCodeRunConfigurationError extends OpenCodeDriverError {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeRunConfigurationError";
  }
}
