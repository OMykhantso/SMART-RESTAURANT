/**
 * Єдиний формат помилок API:
 * { "error": { "code": "RESERVATION_CONFLICT", "message": "…", "details": … } }
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) =>
  new AppError(400, code, message, details);
export const unauthorized = (message = 'Потрібна автентифікація', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'Недостатньо прав для цієї операції', code = 'FORBIDDEN') =>
  new AppError(403, code, message);
export const notFound = (message = 'Ресурс не знайдено', code = 'NOT_FOUND') =>
  new AppError(404, code, message);
export const conflict = (message: string, code = 'CONFLICT', details?: unknown) =>
  new AppError(409, code, message, details);
export const unprocessable = (message: string, code = 'UNPROCESSABLE', details?: unknown) =>
  new AppError(422, code, message, details);
