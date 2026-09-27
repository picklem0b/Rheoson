import {
  ERROR_MESSAGES,
  messageForCode,
  wireDetail,
  type ErrorCode,
} from '@rheoson/shared';

/**
 * The one error shape the API throws. Every error carries a DCCNN code from
 * the shared registry — the client renders `[ERROR_CODE: DEX01]` chips and
 * the info panel resolves the full copy from the same registry, so the
 * traceability promise ("a code lands on exactly one raise site") holds
 * across the rewrite.
 */

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(code: ErrorCode, status: number, detail?: string) {
    super(wireDetail(code, detail));
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export const notFound = (code: ErrorCode, detail?: string) => new ApiError(code, 404, detail);
export const forbidden = (code: ErrorCode, detail?: string) => new ApiError(code, 403, detail);
export const badRequest = (code: ErrorCode, detail?: string) => new ApiError(code, 400, detail);
export const unauthorized = (code: ErrorCode, detail?: string) => new ApiError(code, 401, detail);
export const tooMany = (code: ErrorCode, detail?: string) => new ApiError(code, 429, detail);

/** Copy for a code, falling back to the raw code if the registry somehow lacks it. */
export function copyForCode(code: ErrorCode): string {
  if (Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)) {
    return messageForCode(code);
  }
  return code;
}

/**
 * The wire body for an error — the client contract:
 * `{ error, code, detail }` where `code` is the DCCNN chip and `detail`
 * the machine-free extra copy. Unknown errors degrade to a generic 500
 * shape (the client's ErrorPage falls back the same way).
 */
export function wireErrorBody(error: unknown): {
  status: number;
  error: string;
  code: ErrorCode | null;
  detail: string | null;
} {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      error: copyForCode(error.code),
      code: error.code,
      detail: error.detail ?? null,
    };
  }
  return { status: 500, error: 'Something broke', code: null, detail: null };
}

/** Fastify error handler — installed once in main.ts. */
export function errorHandler(
  error: unknown,
  _request: unknown,
  reply: { status: (n: number) => { send: (body: unknown) => unknown } },
): void {
  const body = wireErrorBody(error);
  reply.status(body.status).send({
    error: body.error,
    code: body.code,
    detail: body.detail,
  });
}
