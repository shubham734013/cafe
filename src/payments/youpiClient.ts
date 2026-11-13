import crypto from 'node:crypto';
import { paymentLogger } from './logger';
import {
  canTransitionYoupiStatus,
  isTerminalInternalStatus,
  mapYoupiStatusToInternalStatus,
} from './stateMachine';
import { DEMO_PLACEHOLDER_VPA, buildNpciUpiUri } from './upiUri';
import type {
  YoupiCreateSessionInput,
  YoupiGatewayClient,
  YoupiGatewayRawStatus,
  YoupiGatewaySessionResponse,
  YoupiWebhookPayload,
} from './types';

export class GatewayRequestError extends Error {
  public readonly code: string;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly httpStatus: number;

  constructor(opts: {
    code: string;
    userMessage: string;
    retryable: boolean;
    httpStatus: number;
    internalMessage?: string;
  }) {
    super(opts.internalMessage || opts.userMessage);
    this.name = 'GatewayRequestError';
    this.code = opts.code;
    this.userMessage = opts.userMessage;
    this.retryable = opts.retryable;
    this.httpStatus = opts.httpStatus;
  }
}

export function mapYoupiGatewayError(
  httpStatus: number,
  body: Record<string, unknown> | null,
  fallbackMessage?: string
): GatewayRequestError {
  const code = String(body?.code || body?.error || `HTTP_${httpStatus}`).toUpperCase();

  if (code === 'ORDER_AMOUNT_MISMATCH') {
    return new GatewayRequestError({
      code,
      userMessage: 'Order amount changed for this order ID. Start a fresh payment attempt.',
      retryable: false,
      httpStatus: 409,
    });
  }
  if (code === 'ORDER_PAYMENT_METHOD_MISMATCH') {
    return new GatewayRequestError({
      code,
      userMessage: 'Order payment method does not match the active gateway session.',
      retryable: false,
      httpStatus: 409,
    });
  }
  if (code === 'DUPLICATE_SESSION_DETECTED' || code === 'DEVICE_SESSION_MISMATCH') {
    return new GatewayRequestError({
      code,
      userMessage: 'An active payment session is already open for this customer.',
      retryable: false,
      httpStatus: 409,
    });
  }
  if (httpStatus === 401 || code === 'MISSING_MERCHANT_KEY' || code === 'INVALID_MERCHANT_KEY') {
    return new GatewayRequestError({
      code,
      userMessage: 'YouPI-PG merchant credentials are missing or invalid on the server.',
      retryable: false,
      httpStatus: 502,
    });
  }
  if (httpStatus === 403) {
    return new GatewayRequestError({
      code,
      userMessage: 'Payment request was blocked by YouPI-PG security rules.',
      retryable: false,
      httpStatus: 403,
    });
  }
  if (httpStatus === 408 || httpStatus === 429 || httpStatus >= 500) {
    return new GatewayRequestError({
      code,
      userMessage: 'YouPI-PG gateway is temporarily unavailable. Please try again shortly.',
      retryable: true,
      httpStatus: 503,
      internalMessage: fallbackMessage,
    });
  }

  return new GatewayRequestError({
    code,
    userMessage: String(body?.message || body?.error || fallbackMessage || 'Unable to process YouPI-PG request.'),
    retryable: false,
    httpStatus: httpStatus >= 400 && httpStatus < 500 ? httpStatus : 400,
  });
}

export async function withBackoffRetry<T>(
  operationName: string,
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRetryable =
        err instanceof GatewayRequestError
          ? err.retryable
          : err instanceof Error &&
            (err.name === 'AbortError' ||
              err.name === 'TimeoutError' ||
              /fetch|network|econnreset|etimedout|econnrefused/i.test(err.message));

      if (!isRetryable || attempt >= maxAttempts) {
        throw err;
      }

      const jitter = Math.floor(Math.random() * 50);
      const delayMs = baseDelayMs * 2 ** (attempt - 1) + jitter;
      paymentLogger.warn('youpi_retry_scheduled', {
        operationName,
        attempt,
        maxAttempts,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

interface YoupiApiRawResponse {
  paymentId: string;
  orderId: string;
  amount: string;
  amountPaise: string | number;
  currency?: string;
  status: YoupiGatewayRawStatus;
  settlementState?: 'NOT_RECONCILED' | 'RECONCILED' | 'NOT_BANK_SETTLEMENT';
  verificationLevel?: number;
  verificationSources?: string[];
  verificationTag?: string;
  queuePosition?: number;
  checkoutUrl?: string;
  completedAt?: string | null;
}

export class YoupiHttpClient implements YoupiGatewayClient {
  public readonly mode = 'youpi-live' as const;
  private readonly apiUrl: string;
  private readonly checkoutBaseUrl: string;
  private readonly merchantId: string;
  private readonly apiKey: string;
  private readonly payeeVpa: string;
  private readonly timeoutMs: number;

  constructor(config: {
    apiUrl: string;
    checkoutBaseUrl?: string;
    merchantId: string;
    apiKey: string;
    payeeVpa?: string;
    timeoutMs?: number;
  }) {
    this.apiUrl = config.apiUrl.replace(/\/+$/, '');
    this.checkoutBaseUrl = (config.checkoutBaseUrl || 'http://localhost:7000').replace(/\/+$/, '');
    this.merchantId = config.merchantId;
    this.apiKey = config.apiKey;
    this.payeeVpa = config.payeeVpa || DEMO_PLACEHOLDER_VPA;
    this.timeoutMs = config.timeoutMs ?? 12_000;
  }

  private async requestJson<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<T> {
    return withBackoffRetry(`${method} ${path}`, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Merchant-Id': this.merchantId,
        'X-Merchant-Key': this.apiKey,
      };
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      try {
        const response = await fetch(`${this.apiUrl}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const text = await response.text();
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
        } catch {
          parsed = null;
        }

        if (!response.ok) {
          throw mapYoupiGatewayError(response.status, parsed, text || response.statusText);
        }

        return (parsed ?? {}) as T;
      } catch (err) {
        if (err instanceof GatewayRequestError) {
          throw err;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          throw new GatewayRequestError({
            code: 'GATEWAY_TIMEOUT',
            userMessage: 'YouPI-PG gateway timed out. Please retry in a moment.',
            retryable: true,
            httpStatus: 504,
            internalMessage: err.message,
          });
        }
        throw new GatewayRequestError({
          code: 'GATEWAY_NETWORK_ERROR',
          userMessage: 'Could not reach YouPI-PG payment engine. Check that the gateway server is running.',
          retryable: true,
          httpStatus: 503,
          internalMessage: err instanceof Error ? err.message : 'Network failure',
        });
      } finally {
        clearTimeout(timer);
      }
    });
  }

  public async createPayment(input: YoupiCreateSessionInput): Promise<YoupiGatewaySessionResponse> {
    const res = await this.requestJson<YoupiApiRawResponse>(
      'POST',
      '/api/v1/payments',
      {
        orderId: input.orderId,
        amount: input.amountInr,
        currency: input.currency,
        returnUrl: input.returnUrl,
        description: input.description,
        customer: input.customer,
        metadata: input.metadata,
      },
      input.idempotencyKey
    );

    const amountPaise = Number(res.amountPaise || input.amountPaise);
    const checkoutUrl = res.checkoutUrl || `${this.checkoutBaseUrl}/checkout/${res.paymentId}`;

    return {
      gatewayPaymentId: res.paymentId,
      orderId: res.orderId || input.orderId,
      amountInr: res.amount || input.amountInr,
      amountPaise: Number.isFinite(amountPaise) ? amountPaise : input.amountPaise,
      currency: 'INR',
      status: res.status || 'INITIATED',
      settlementState: res.settlementState || 'NOT_RECONCILED',
      verificationLevel: res.verificationLevel ?? 0,
      verificationSources: res.verificationSources ?? [],
      verificationTag: res.verificationTag,
      queuePosition: res.queuePosition ?? 0,
      checkoutUrl,
      payeeVpa: input.payeeVpa || this.payeeVpa,
      completedAt: res.completedAt ?? undefined,
    };
  }

  public async getPayment(gatewayPaymentId: string): Promise<YoupiGatewaySessionResponse> {
    const res = await this.requestJson<YoupiApiRawResponse>(
      'GET',
      `/api/v1/payments/${encodeURIComponent(gatewayPaymentId)}`
    );

    const amountPaise = Number(res.amountPaise || 0);
    return {
      gatewayPaymentId: res.paymentId,
      orderId: res.orderId,
      amountInr: res.amount,
      amountPaise: Number.isFinite(amountPaise) ? amountPaise : 0,
      currency: 'INR',
      status: res.status,
      settlementState: res.settlementState || 'NOT_RECONCILED',
      verificationLevel: res.verificationLevel ?? 0,
      verificationSources: res.verificationSources ?? [],
      verificationTag: res.verificationTag,
      queuePosition: res.queuePosition ?? 0,
      checkoutUrl: `${this.checkoutBaseUrl}/checkout/${res.paymentId}`,
      payeeVpa: this.payeeVpa,
      completedAt: res.completedAt ?? undefined,
    };
  }

  public async cancelPayment(
    gatewayPaymentId: string
  ): Promise<{ success: boolean; status: YoupiGatewayRawStatus }> {
    const res = await this.requestJson<{ success?: boolean; status?: YoupiGatewayRawStatus }>(
      'POST',
      `/api/v1/checkout/${encodeURIComponent(gatewayPaymentId)}/cancel`
    );
    return {
      success: Boolean(res.success ?? true),
      status: res.status || 'CANCELLED',
    };
  }
}

interface SandboxSession {
  gatewayPaymentId: string;
  orderId: string;
  amountInr: string;
  amountPaise: number;
  status: YoupiGatewayRawStatus;
  settlementState: 'NOT_RECONCILED' | 'RECONCILED';
  verificationLevel: number;
  verificationSources: string[];
  verificationTag: string;
  queuePosition: number;
  checkoutUrl: string;
  upiUri: string;
  payeeVpa: string;
  utr?: string;
  createdAtMs: number;
  submittedAtMs?: number;
  completedAt?: string;
}

/**
 * Non-production sandbox adapter used ONLY when YOUPI_MERCHANT_API_KEY and
 * YOUPI_MERCHANT_ID are not set, allowing full local UI & webhook testing
 * without running the external YouPI-PG portal + Android observer.
 */
export class LocalYoupiSandboxAdapter implements YoupiGatewayClient {
  public readonly mode = 'youpi-sandbox-fallback' as const;
  private readonly sessions = new Map<string, SandboxSession>();
  private readonly payeeVpa: string;
  private readonly merchantName: string;

  constructor(options?: { payeeVpa?: string; merchantName?: string }) {
    this.payeeVpa = options?.payeeVpa || process.env.YOUPI_PAYEE_VPA || DEMO_PLACEHOLDER_VPA;
    this.merchantName = options?.merchantName || 'Seth Sawariya Cafe';
  }

  private buildUpiUri(
    orderId: string,
    amountInr: string,
    gatewayPaymentId: string,
    payeeVpa?: string,
    payeeName?: string
  ): string {
    return buildNpciUpiUri({
      payeeVpa: payeeVpa || this.payeeVpa,
      payeeName: payeeName || this.merchantName,
      amountInr,
      transactionRef: gatewayPaymentId,
      note: `Order ${orderId}`,
    });
  }

  public async createPayment(input: YoupiCreateSessionInput): Promise<YoupiGatewaySessionResponse> {
    const activeCount = Array.from(this.sessions.values()).filter(
      (s) => s.status === 'ACTIVE' || s.status === 'PROCESSING'
    ).length;

    const gatewayPaymentId = crypto.randomUUID();
    const status: YoupiGatewayRawStatus = activeCount > 0 ? 'QUEUED' : 'ACTIVE';
    const queuePosition = activeCount > 0 ? activeCount : 0;
    const effectiveVpa = input.payeeVpa?.trim() || this.payeeVpa;
    const effectiveName = input.payeeName?.trim() || this.merchantName;
    const upiUri = this.buildUpiUri(
      input.orderId,
      input.amountInr,
      gatewayPaymentId,
      effectiveVpa,
      effectiveName
    );

    const session: SandboxSession = {
      gatewayPaymentId,
      orderId: input.orderId,
      amountInr: input.amountInr,
      amountPaise: input.amountPaise,
      status,
      settlementState: 'NOT_RECONCILED',
      verificationLevel: 0,
      verificationSources: [],
      verificationTag: 'UNVERIFIED',
      queuePosition,
      checkoutUrl: upiUri,
      upiUri,
      payeeVpa: effectiveVpa,
      createdAtMs: Date.now(),
    };

    this.sessions.set(gatewayPaymentId, session);
    return this.toResponse(session);
  }

  public async getPayment(gatewayPaymentId: string): Promise<YoupiGatewaySessionResponse> {
    const session = this.sessions.get(gatewayPaymentId);
    if (!session) {
      throw new GatewayRequestError({
        code: 'PAYMENT_NOT_FOUND',
        userMessage: 'YouPI-PG payment session not found.',
        retryable: false,
        httpStatus: 404,
      });
    }

    // If queued and earlier active slot closed, promote to ACTIVE via state machine
    if (session.status === 'QUEUED') {
      const hasActiveAhead = Array.from(this.sessions.values()).some(
        (other) =>
          other.gatewayPaymentId !== session.gatewayPaymentId &&
          (other.status === 'ACTIVE' || other.status === 'PROCESSING') &&
          other.createdAtMs < session.createdAtMs
      );
      if (
        !hasActiveAhead &&
        canTransitionYoupiStatus(
          mapYoupiStatusToInternalStatus(session.status),
          mapYoupiStatusToInternalStatus('ACTIVE')
        )
      ) {
        session.status = 'ACTIVE';
        session.queuePosition = 0;
      }
    }

    // Auto-complete sandbox observer match 1.5s after customer taps "I Have Paid"
    if (
      session.status === 'PROCESSING' &&
      session.submittedAtMs &&
      Date.now() - session.submittedAtMs >= 1500 &&
      canTransitionYoupiStatus('processing', 'observed')
    ) {
      session.status = 'OBSERVED_SUCCESS';
      session.settlementState = 'NOT_RECONCILED';
      session.verificationLevel = 2;
      session.verificationSources = ['ANDROID_SMS', 'GMAIL_ALERT'];
      session.verificationTag = 'DUAL_OBSERVER_MATCHED';
      session.utr = String(Math.floor(100000000000 + Math.random() * 899999999999));
      session.completedAt = new Date().toISOString();
    }

    return this.toResponse(session);
  }

  public async markPayerSubmitted(gatewayPaymentId: string): Promise<YoupiGatewaySessionResponse> {
    const session = this.sessions.get(gatewayPaymentId);
    if (!session) {
      throw new GatewayRequestError({
        code: 'PAYMENT_NOT_FOUND',
        userMessage: 'Payment session not found.',
        retryable: false,
        httpStatus: 404,
      });
    }
    const currentInternal = mapYoupiStatusToInternalStatus(session.status);
    if (
      !isTerminalInternalStatus(currentInternal) &&
      currentInternal !== 'observed' &&
      canTransitionYoupiStatus(currentInternal, 'processing')
    ) {
      session.status = 'PROCESSING';
      session.queuePosition = 0;
      session.submittedAtMs = Date.now();
    }
    return this.toResponse(session);
  }

  public async cancelPayment(
    gatewayPaymentId: string
  ): Promise<{ success: boolean; status: YoupiGatewayRawStatus }> {
    const session = this.sessions.get(gatewayPaymentId);
    if (!session) {
      return { success: true, status: 'CANCELLED' };
    }
    const currentInternal = mapYoupiStatusToInternalStatus(session.status);
    if (
      isTerminalInternalStatus(currentInternal) ||
      currentInternal === 'observed' ||
      !canTransitionYoupiStatus(currentInternal, 'cancelled')
    ) {
      return { success: false, status: session.status };
    }
    session.status = 'CANCELLED';
    session.completedAt = new Date().toISOString();
    return { success: true, status: 'CANCELLED' };
  }

  public async refundPayment(
    gatewayPaymentId: string,
    options?: { refundRef?: string; reason?: string }
  ): Promise<{ success: boolean; status: YoupiGatewayRawStatus; refundRef?: string }> {
    const session = this.sessions.get(gatewayPaymentId);
    if (!session) {
      return {
        success: true,
        status: 'REFUNDED',
        refundRef: options?.refundRef,
      };
    }
    const currentInternal = mapYoupiStatusToInternalStatus(session.status, {
      settlementState: session.settlementState,
    });
    if (currentInternal !== 'reconciled') {
      throw new GatewayRequestError({
        code: 'INVALID_REFUND_STATE',
        userMessage: `Cannot refund payment in ${session.status} state.`,
        retryable: false,
        httpStatus: 409,
      });
    }
    session.status = 'REFUNDED';
    session.completedAt = session.completedAt || new Date().toISOString();
    return {
      success: true,
      status: 'REFUNDED',
      refundRef: options?.refundRef,
    };
  }

  public simulateOutcome(
    gatewayPaymentId: string,
    outcome: 'OBSERVED_SUCCESS' | 'RECONCILED' | 'MANUAL_REVIEW' | 'FAILED' | 'EXPIRED' | 'CANCELLED',
    options?: { utr?: string; overrideAmountPaise?: number }
  ): YoupiWebhookPayload | null {
    const session = this.sessions.get(gatewayPaymentId);
    if (!session) return null;

    const currentInternal = mapYoupiStatusToInternalStatus(session.status);
    const nextInternal = mapYoupiStatusToInternalStatus(outcome, {
      settlementState: outcome === 'RECONCILED' ? 'RECONCILED' : 'NOT_RECONCILED',
    });

    if (!canTransitionYoupiStatus(currentInternal, nextInternal)) {
      throw new GatewayRequestError({
        code: 'INVALID_SANDBOX_TRANSITION',
        userMessage: `Cannot simulate ${outcome} from terminal or incompatible state ${session.status}.`,
        retryable: false,
        httpStatus: 409,
      });
    }

    const utr = options?.utr || session.utr || String(Math.floor(100000000000 + Math.random() * 899999999999));
    session.status = outcome;
    session.completedAt = new Date().toISOString();

    if (outcome === 'OBSERVED_SUCCESS') {
      session.settlementState = 'NOT_RECONCILED';
      session.verificationLevel = 1;
      session.verificationSources = ['ANDROID_SMS'];
      session.verificationTag = 'SMS_OBSERVER_MATCHED';
      session.utr = utr;
    } else if (outcome === 'RECONCILED') {
      session.settlementState = 'RECONCILED';
      session.verificationLevel = 2;
      session.verificationSources = ['ANDROID_SMS', 'BANK_STATEMENT_CSV'];
      session.verificationTag = 'STATEMENT_RECONCILED';
      session.utr = utr;
    } else if (outcome === 'MANUAL_REVIEW') {
      session.settlementState = 'NOT_RECONCILED';
      session.verificationTag = 'AMBIGUOUS_DUPLICATE_MATCH';
      session.utr = utr;
    }

    const amountPaise = options?.overrideAmountPaise ?? session.amountPaise;
    return {
      event: outcome,
      paymentId: session.gatewayPaymentId,
      orderId: session.orderId,
      amount: (amountPaise / 100).toFixed(2),
      amountPaise,
      currency: 'INR',
      method: 'UPI',
      settlementState: session.settlementState,
      utr: outcome === 'OBSERVED_SUCCESS' || outcome === 'RECONCILED' || outcome === 'MANUAL_REVIEW' ? utr : undefined,
      deliveryId: `dlv_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: Date.now(),
      verificationTag: session.verificationTag,
      verificationLevel: session.verificationLevel,
      verificationSources: session.verificationSources,
      completedAt: session.completedAt,
    };
  }

  private toResponse(s: SandboxSession): YoupiGatewaySessionResponse {
    return {
      gatewayPaymentId: s.gatewayPaymentId,
      orderId: s.orderId,
      amountInr: s.amountInr,
      amountPaise: s.amountPaise,
      currency: 'INR',
      status: s.status,
      settlementState: s.settlementState,
      verificationLevel: s.verificationLevel,
      verificationSources: s.verificationSources,
      verificationTag: s.verificationTag,
      queuePosition: s.queuePosition,
      checkoutUrl: s.checkoutUrl,
      upiUri: s.upiUri,
      payeeVpa: s.payeeVpa,
      utr: s.utr,
      completedAt: s.completedAt,
    };
  }
}

export function isLoopbackApiUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

const TEST_OR_PLACEHOLDER_PATTERNS = [
  /^test_/i,
  /^sbx_/i,
  /^sandbox/i,
  /^demo_/i,
  /changeme/i,
  /placeholder/i,
  /^dev-youpi-webhook-secret/i,
];

export function isPlaceholderOrTestSecret(value?: string): boolean {
  const trimmed = value?.trim() || '';
  if (!trimmed) return true;
  return TEST_OR_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function validateLiveKeyConfiguration(env: {
  nodeEnv?: string;
  apiUrl?: string;
  merchantId?: string;
  apiKey?: string;
  webhookSecret?: string;
}): void {
  if (env.nodeEnv !== 'production') return;

  const apiUrl = env.apiUrl?.trim() || '';
  const merchantId = env.merchantId?.trim() || '';
  const apiKey = env.apiKey?.trim() || '';
  const webhookSecret = env.webhookSecret?.trim() || '';

  if (!apiUrl || !merchantId || !apiKey) {
    throw new Error(
      'YOUPI_API_URL, YOUPI_MERCHANT_ID, and YOUPI_MERCHANT_API_KEY are required in production.'
    );
  }

  if (!webhookSecret || isPlaceholderOrTestSecret(webhookSecret)) {
    throw new Error(
      'YOUPI_WEBHOOK_SECRET must be configured with a live production secret in production.'
    );
  }

  if (!isLoopbackApiUrl(apiUrl) && isPlaceholderOrTestSecret(apiKey)) {
    throw new Error(
      'YOUPI_MERCHANT_API_KEY appears to be a test/sandbox/placeholder key while targeting a live YouPI-PG URL.'
    );
  }
}

/**
 * Non-production resilience wrapper: when YOUPI_API_URL points to localhost/127.0.0.1
 * (e.g. local laptop config while running CafeOS in cloud preview) and is unreachable,
 * fall back to LocalYoupiSandboxAdapter using the merchant's real configured VPA.
 */
export class DevLoopbackFallbackGateway implements YoupiGatewayClient {
  private readonly live: YoupiHttpClient;
  private readonly sandbox: LocalYoupiSandboxAdapter;
  private readonly sandboxSessionIds = new Set<string>();
  private fallbackActive = false;

  constructor(live: YoupiHttpClient, sandbox: LocalYoupiSandboxAdapter) {
    this.live = live;
    this.sandbox = sandbox;
  }

  public get mode(): 'youpi-live' | 'youpi-sandbox-fallback' {
    return this.fallbackActive ? 'youpi-sandbox-fallback' : 'youpi-live';
  }

  public async createPayment(input: YoupiCreateSessionInput): Promise<YoupiGatewaySessionResponse> {
    try {
      return await this.live.createPayment(input);
    } catch (err) {
      const isUnreachable =
        err instanceof GatewayRequestError &&
        (err.code === 'GATEWAY_NETWORK_ERROR' || err.code === 'GATEWAY_TIMEOUT');
      if (!isUnreachable) {
        throw err;
      }
      this.fallbackActive = true;
      paymentLogger.warn('youpi_loopback_unreachable_using_sandbox', {
        orderId: input.orderId,
        code: err.code,
      });
      const session = await this.sandbox.createPayment(input);
      this.sandboxSessionIds.add(session.gatewayPaymentId);
      return session;
    }
  }

  public async getPayment(gatewayPaymentId: string): Promise<YoupiGatewaySessionResponse> {
    if (this.sandboxSessionIds.has(gatewayPaymentId)) {
      return this.sandbox.getPayment(gatewayPaymentId);
    }
    return this.live.getPayment(gatewayPaymentId);
  }

  public async cancelPayment(
    gatewayPaymentId: string
  ): Promise<{ success: boolean; status: YoupiGatewayRawStatus }> {
    if (this.sandboxSessionIds.has(gatewayPaymentId)) {
      return this.sandbox.cancelPayment(gatewayPaymentId);
    }
    return this.live.cancelPayment(gatewayPaymentId);
  }

  public async refundPayment(
    gatewayPaymentId: string,
    options?: { refundRef?: string; reason?: string }
  ): Promise<{ success: boolean; status: YoupiGatewayRawStatus; refundRef?: string }> {
    if (this.sandboxSessionIds.has(gatewayPaymentId)) {
      return this.sandbox.refundPayment(gatewayPaymentId, options);
    }
    return {
      success: true,
      status: 'REFUNDED',
      refundRef: options?.refundRef,
    };
  }

  public async markPayerSubmitted(gatewayPaymentId: string): Promise<YoupiGatewaySessionResponse> {
    if (this.sandboxSessionIds.has(gatewayPaymentId)) {
      return this.sandbox.markPayerSubmitted(gatewayPaymentId);
    }
    return this.live.getPayment(gatewayPaymentId);
  }

  public simulateOutcome(
    gatewayPaymentId: string,
    outcome: 'OBSERVED_SUCCESS' | 'RECONCILED' | 'MANUAL_REVIEW' | 'FAILED' | 'EXPIRED' | 'CANCELLED',
    options?: { utr?: string; overrideAmountPaise?: number }
  ): YoupiWebhookPayload | null {
    if (!this.sandboxSessionIds.has(gatewayPaymentId)) {
      return null;
    }
    return this.sandbox.simulateOutcome(gatewayPaymentId, outcome, options);
  }
}

export function createYoupiGatewayFromEnv(): YoupiGatewayClient {
  const apiUrl = process.env.YOUPI_API_URL?.trim();
  const merchantId = process.env.YOUPI_MERCHANT_ID?.trim();
  const apiKey = process.env.YOUPI_MERCHANT_API_KEY?.trim();
  const webhookSecret = process.env.YOUPI_WEBHOOK_SECRET?.trim();

  validateLiveKeyConfiguration({
    nodeEnv: process.env.NODE_ENV,
    apiUrl,
    merchantId,
    apiKey,
    webhookSecret,
  });

  if (apiUrl && merchantId && apiKey) {
    const isDevLoopback =
      process.env.NODE_ENV !== 'production' && isLoopbackApiUrl(apiUrl);
    const liveClient = new YoupiHttpClient({
      apiUrl,
      checkoutBaseUrl: process.env.YOUPI_CHECKOUT_URL?.trim(),
      merchantId,
      apiKey,
      payeeVpa: process.env.YOUPI_PAYEE_VPA?.trim(),
      timeoutMs: isDevLoopback ? 3500 : 12_000,
    });
    if (isDevLoopback) {
      return new DevLoopbackFallbackGateway(
        liveClient,
        new LocalYoupiSandboxAdapter({
          payeeVpa: process.env.YOUPI_PAYEE_VPA?.trim(),
        })
      );
    }
    return liveClient;
  }

  return new LocalYoupiSandboxAdapter();
}
