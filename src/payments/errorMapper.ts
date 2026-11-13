export class GatewayRequestError extends Error {
  public readonly code: string;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly httpStatus: number;

  constructor(opts: {
    code: string;
    userMessage: string;
    retryable: boolean;
    httpStatus?: number;
    causeMessage?: string;
  }) {
    super(opts.causeMessage || opts.userMessage);
    this.name = 'GatewayRequestError';
    this.code = opts.code;
    this.userMessage = opts.userMessage;
    this.retryable = opts.retryable;
    this.httpStatus = opts.httpStatus ?? 502;
  }
}

export function isRetryableGatewayError(err: unknown): boolean {
  if (err instanceof GatewayRequestError) {
    return err.retryable;
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
    if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(err.message)) {
      return true;
    }
  }
  return false;
}

export function mapYoupiGatewayError(input: {
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
}): GatewayRequestError {
  const code = (input.errorCode || '').trim().toUpperCase();
  const status = input.httpStatus ?? 502;

  if (code === 'ORDER_AMOUNT_MISMATCH') {
    return new GatewayRequestError({
      code,
      userMessage: 'Order amount does not match the existing YouPI-PG payment session.',
      retryable: false,
      httpStatus: 409,
      causeMessage: input.errorMessage,
    });
  }

  if (code === 'ORDER_PAYMENT_METHOD_MISMATCH') {
    return new GatewayRequestError({
      code,
      userMessage: 'This order already has a payment session with a different payment method.',
      retryable: false,
      httpStatus: 409,
      causeMessage: input.errorMessage,
    });
  }

  if (code === 'DEVICE_SESSION_MISMATCH' || code === 'DUPLICATE_SESSION_DETECTED') {
    return new GatewayRequestError({
      code: 'DEVICE_SESSION_MISMATCH',
      userMessage: 'An active payment session is already open on another device. Cancel it before retrying.',
      retryable: false,
      httpStatus: 409,
      causeMessage: input.errorMessage,
    });
  }

  if (code === 'INVALID_MERCHANT_KEY' || code === 'MISSING_MERCHANT_KEY' || status === 401) {
    return new GatewayRequestError({
      code: code || 'MERCHANT_AUTH_FAILED',
      userMessage: 'Payment gateway merchant credentials are invalid or missing.',
      retryable: false,
      httpStatus: 502,
      causeMessage: input.errorMessage,
    });
  }

  if (status === 403) {
    return new GatewayRequestError({
      code: code || 'CUSTOMER_BLOCKED',
      userMessage: input.errorMessage || 'Checkout blocked by gateway security rules.',
      retryable: false,
      httpStatus: 403,
      causeMessage: input.errorMessage,
    });
  }

  if (status === 400 || status === 422) {
    return new GatewayRequestError({
      code: code || 'INVALID_PAYMENT_REQUEST',
      userMessage: input.errorMessage || 'Invalid payment request details.',
      retryable: false,
      httpStatus: 400,
      causeMessage: input.errorMessage,
    });
  }

  if (status === 408 || status === 429 || status >= 500) {
    return new GatewayRequestError({
      code: code || 'GATEWAY_TEMPORARY_UNAVAILABLE',
      userMessage: 'YouPI-PG gateway is temporarily busy or unreachable. Please try again.',
      retryable: true,
      httpStatus: 503,
      causeMessage: input.errorMessage,
    });
  }

  return new GatewayRequestError({
    code: code || 'GATEWAY_ERROR',
    userMessage: input.errorMessage || 'Unable to process UPI payment with YouPI-PG.',
    retryable: false,
    httpStatus: status,
    causeMessage: input.errorMessage,
  });
}
