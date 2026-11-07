export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function publicError(error: unknown): { error: string; status: number } {
  if (error instanceof AppError)
    return { error: error.message, status: error.status };
  return {
    error:
      "The operation could not finish. Please retry or check the server configuration.",
    status: 500,
  };
}
