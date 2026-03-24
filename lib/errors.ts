// ============================================================
// PHUND.CA — Custom Error Classes
// ============================================================

/**
 * Base error class for all PHUND errors
 */
export class PhundError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "PhundError";
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, PhundError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * Error thrown when store operations fail
 */
export class StoreError extends PhundError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "STORE_ERROR", context);
    this.name = "StoreError";
    Object.setPrototypeOf(this, StoreError.prototype);
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends PhundError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message, "VALIDATION_ERROR", { field, value });
    this.name = "ValidationError";
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when trade operations fail
 */
export class TradeError extends PhundError {
  public readonly orderId?: string;
  public readonly reason: string;

  constructor(message: string, reason: string, orderId?: string) {
    super(message, "TRADE_ERROR", { orderId, reason });
    this.name = "TradeError";
    this.orderId = orderId;
    this.reason = reason;
    Object.setPrototypeOf(this, TradeError.prototype);
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthError extends PhundError {
  constructor(message: string = "Authentication failed") {
    super(message, "AUTH_ERROR");
    this.name = "AuthError";
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * Error thrown when rate limits are exceeded
 */
export class RateLimitError extends PhundError {
  public readonly retryAfter?: number;

  constructor(message: string = "Rate limit exceeded", retryAfter?: number) {
    super(message, "RATE_LIMIT_ERROR", { retryAfter });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Error thrown when external service communication fails
 */
export class ExternalServiceError extends PhundError {
  public readonly service: string;
  public readonly statusCode?: number;

  constructor(service: string, message: string, statusCode?: number) {
    super(message, "EXTERNAL_SERVICE_ERROR", { service, statusCode });
    this.name = "ExternalServiceError";
    this.service = service;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

/**
 * Type guard to check if an error is a PhundError
 */
export function isPhundError(error: unknown): error is PhundError {
  return error instanceof PhundError;
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error occurred";
}

/**
 * Wrap an async operation with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMapper?: (error: Error) => PhundError
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isPhundError(error)) {
      throw error;
    }
    if (error instanceof Error && errorMapper) {
      throw errorMapper(error);
    }
    throw new PhundError(getErrorMessage(error), "UNKNOWN_ERROR");
  }
}
