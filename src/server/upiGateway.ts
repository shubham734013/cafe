import crypto from 'node:crypto';

export type UpiGatewayPaymentStatus = 'pending' | 'paid' | 'expired' | 'review' | 'failed';

export interface UpiGatewayOrder {
  orderId: string;
  clientOrderId: string;
  amountPaise: number;
  status: UpiGatewayPaymentStatus;
  paymentUrl: string;
  utr?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
}

interface UpiGatewayConfig {
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  webhookSecret?: string;
  isProduction?: boolean;
}

interface UpiGatewayApiOrder {
  order_id?: unknown;
  client_order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  environment?: unknown;
  test?: unknown;
  payment_url?: unknown;
  utr?: unknown;
}

interface UpiGatewayApiResponse {
  success?: unknown;
  data?: UpiGatewayApiOrder;
  message?: unknown;
}

export class UpiGatewayRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 502
  ) {
    super(message);
    this.name = 'UpiGatewayRequestError';
  }
}

export interface UpiGatewayClient {
  isConfigured(): boolean;
  getWebhookSecret(): string | undefined;
  createOrder(input: {
    clientOrderId: string;
    amountPaise: number;
    note: string;
    customerPhone?: string;
    customerName?: string;
    customerEmail?: string;
  }): Promise<UpiGatewayOrder>;
  getOrder(clientOrderId: string): Promise<UpiGatewayOrder | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapGatewayOrder(
  input: unknown,
  expectedClientOrderId: string,
  baseUrl: string,
  isProduction: boolean
): UpiGatewayOrder {
  if (!isRecord(input)) {
    throw new UpiGatewayRequestError('The UPI gateway returned an invalid order response.');
  }

  const order = input as UpiGatewayApiOrder;
  const amount = typeof order.amount === 'string' || typeof order.amount === 'number'
    ? Number(order.amount)
    : Number.NaN;
  const amountPaise = Math.round(amount * 100);
  const status = order.status;
  if (
    typeof order.order_id !== 'string' ||
    order.client_order_id !== expectedClientOrderId ||
    !Number.isFinite(amount) ||
    amountPaise < 1 ||
    Math.abs(amount * 100 - amountPaise) > 0.001 ||
    order.currency !== 'INR' ||
    order.environment !== 'live' ||
    order.test !== false ||
    !['pending', 'paid', 'expired', 'review', 'failed'].includes(String(status)) ||
    typeof order.payment_url !== 'string'
  ) {
    throw new UpiGatewayRequestError(
      'The UPI gateway response did not match this live CafeOS order.'
    );
  }

  let paymentUrl: URL;
  try {
    paymentUrl = new URL(order.payment_url);
  } catch {
    throw new UpiGatewayRequestError('The UPI gateway returned an invalid checkout URL.');
  }
  const gatewayUrl = new URL(baseUrl);
  const localGateway = ['localhost', '127.0.0.1', '::1'].includes(gatewayUrl.hostname);
  if (
    paymentUrl.username ||
    paymentUrl.password ||
    (paymentUrl.protocol !== 'https:' &&
      !(paymentUrl.protocol === 'http:' && !isProduction && localGateway && paymentUrl.hostname === gatewayUrl.hostname))
  ) {
    throw new UpiGatewayRequestError('The UPI gateway returned an insecure checkout URL.');
  }

  return {
    orderId: order.order_id,
    clientOrderId: expectedClientOrderId,
    amountPaise,
    status: status as UpiGatewayPaymentStatus,
    paymentUrl: paymentUrl.toString(),
    ...(typeof order.utr === 'string' && order.utr ? { utr: order.utr } : {}),
  };
}

export class UpiGateway implements UpiGatewayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly webhookSecret?: string;
  private readonly isProduction: boolean;

  constructor(
    config: UpiGatewayConfig = {
      baseUrl: process.env.UPI_GATEWAY_API_URL,
      apiKey: process.env.UPI_GATEWAY_API_KEY,
      apiSecret: process.env.UPI_GATEWAY_API_SECRET,
      webhookSecret: process.env.UPI_GATEWAY_WEBHOOK_SECRET,
      isProduction: process.env.NODE_ENV === 'production',
    },
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.baseUrl = (config.baseUrl ?? '').replace(/\/+$/, '');
    this.apiKey = config.apiKey ?? '';
    this.apiSecret = config.apiSecret ?? '';
    this.webhookSecret = config.webhookSecret?.trim() || undefined;
    this.isProduction = config.isProduction ?? false;
  }

  public isConfigured(): boolean {
    if (!this.baseUrl || !this.apiKey || !this.apiSecret) return false;
    try {
      const url = new URL(this.baseUrl);
      return (
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.protocol === 'https:' ||
          (!this.isProduction &&
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '::1'].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }

  public getWebhookSecret(): string | undefined {
    return this.webhookSecret;
  }

  public async createOrder(input: {
    clientOrderId: string;
    amountPaise: number;
    note: string;
    customerPhone?: string;
    customerName?: string;
    customerEmail?: string;
  }): Promise<UpiGatewayOrder> {
    if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 100 || input.amountPaise > 10_000_000) {
      throw new UpiGatewayRequestError(
        'The order amount must be between ₹1.00 and ₹100,000.00 for UPI checkout.',
        400
      );
    }
    const response = await this.request('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount: (input.amountPaise / 100).toFixed(2),
        client_order_id: input.clientOrderId,
        note: input.note.slice(0, 50),
      }),
    });
    return mapGatewayOrder(response.data, input.clientOrderId, this.baseUrl, this.isProduction);
  }

  public async getOrder(clientOrderId: string): Promise<UpiGatewayOrder | null> {
    let response: UpiGatewayApiResponse;
    try {
      response = await this.request(
        `/api/v1/orders/${encodeURIComponent(clientOrderId)}`,
        { method: 'GET' }
      );
    } catch (error) {
      if (error instanceof UpiGatewayRequestError && error.statusCode === 404) return null;
      throw error;
    }
    return mapGatewayOrder(response.data, clientOrderId, this.baseUrl, this.isProduction);
  }

  private async request(
    path: string,
    options: { method: 'GET' | 'POST'; body?: string }
  ): Promise<UpiGatewayApiResponse> {
    if (!this.isConfigured()) {
      throw new UpiGatewayRequestError('The UPI gateway is not configured.', 503);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          Accept: 'application/json',
          'X-Api-Key': this.apiKey,
          'X-Api-Secret': this.apiSecret,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body ? { body: options.body } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Network request failed.';
      throw new UpiGatewayRequestError(`Could not reach the UPI gateway: ${detail}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new UpiGatewayRequestError('The UPI gateway returned a non-JSON response.');
    }
    if (!response.ok) {
      const message =
        isRecord(payload) && typeof payload.message === 'string'
          ? payload.message
          : `UPI gateway request failed (${response.status}).`;
      throw new UpiGatewayRequestError(message, response.status);
    }
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
      throw new UpiGatewayRequestError('The UPI gateway returned an invalid API response.');
    }
    return payload as UpiGatewayApiResponse;
  }
}

export function verifyUpiGatewayWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  if (!signatureHeader || !secret) return false;
  const parts: Record<string, string> = {};
  for (const entry of signatureHeader.split(',')) {
    const match = /^\s*(t|v1)=([^\s,]+)\s*$/.exec(entry);
    if (!match || parts[match[1]!] !== undefined) return false;
    parts[match[1]!] = match[2]!;
  }

  const timestamp = parts.t;
  const signature = parts.v1;
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    !signature ||
    !/^[a-f\d]{64}$/i.test(signature) ||
    Math.abs(nowSeconds - Number(timestamp)) > 300
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody.toString('utf8')}`)
    .digest();
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
