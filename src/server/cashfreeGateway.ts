import crypto from 'node:crypto';
import {
  UpiGatewayClient,
  UpiGatewayOrder,
  UpiGatewayPaymentStatus,
  UpiGatewayRequestError,
} from './upiGateway';

export interface CashfreeConfig {
  appId?: string;
  secretKey?: string;
  apiVersion?: string;
  environment?: 'SANDBOX' | 'PRODUCTION';
  webhookSecret?: string;
}

interface MockCashfreeOrder {
  orderId: string;
  amount: number;
  status: 'ACTIVE' | 'PAID' | 'EXPIRED';
  paymentSessionId: string;
  utr?: string;
}

export interface CashfreePaymentDetails {
  paymentId: string;
  status: string;
  amount: number;
  currency: string;
  bankReference?: string;
}

export class CashfreeGateway implements UpiGatewayClient {
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly apiVersion: string;
  private readonly environment: 'SANDBOX' | 'PRODUCTION';
  private readonly webhookSecret: string;
  private readonly baseUrl: string;
  private readonly mockOrders = new Map<string, MockCashfreeOrder>();
  private readonly fetchImpl: typeof fetch;

  constructor(
    config: CashfreeConfig = {
      appId: process.env.CASHFREE_APP_ID,
      secretKey: process.env.CASHFREE_SECRET_KEY,
      apiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',
      environment: (process.env.CASHFREE_ENVIRONMENT?.toUpperCase() as 'SANDBOX' | 'PRODUCTION') || 'SANDBOX',
      webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET_KEY,
    },
    fetchImpl: typeof fetch = fetch
  ) {
    this.fetchImpl = fetchImpl;
    this.appId = config.appId?.trim() || '';
    this.secretKey = config.secretKey?.trim() || '';
    this.apiVersion = config.apiVersion?.trim() || '2023-08-01';
    this.environment = config.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
    this.webhookSecret = (config.webhookSecret?.trim() || this.secretKey) || 'dev_cashfree_webhook_secret';
    this.baseUrl =
      this.environment === 'PRODUCTION'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';
  }

  public isConfigured(): boolean {
    return Boolean(this.appId && this.secretKey);
  }

  public isMock(): boolean {
    return this.appId.startsWith('CF_SANDBOX') || this.appId.startsWith('dev_') || this.appId.includes('TEST_APP');
  }

  public getWebhookSecret(): string | undefined {
    return this.webhookSecret || undefined;
  }

  public getEnvironment(): 'SANDBOX' | 'PRODUCTION' {
    return this.environment;
  }

  public async createOrder(input: {
    clientOrderId: string;
    amountPaise: number;
    note: string;
    customerPhone?: string;
    customerName?: string;
  }): Promise<UpiGatewayOrder> {
    if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 100 || input.amountPaise > 10_000_000) {
      throw new UpiGatewayRequestError(
        'The order amount must be between ₹1.00 and ₹100,000.00 for payment checkout.',
        400
      );
    }

    const amount = (input.amountPaise / 100).toFixed(2);

    if (this.isMock()) {
      const paymentSessionId = `session_${crypto.randomBytes(12).toString('hex')}`;
      const cfOrderId = `cf_${input.clientOrderId.toLowerCase()}_${Date.now()}`;
      this.mockOrders.set(input.clientOrderId, {
        orderId: cfOrderId,
        amount: parseFloat(amount),
        status: 'ACTIVE',
        paymentSessionId,
      });

      return {
        orderId: cfOrderId,
        clientOrderId: input.clientOrderId,
        amountPaise: input.amountPaise,
        status: 'pending',
        paymentUrl: `http://localhost:3002/api/cashfree-mock/checkout?orderId=${encodeURIComponent(input.clientOrderId)}&session=${paymentSessionId}`,
      };
    }

    const publicUrl = process.env.APP_PUBLIC_URL?.trim();
    const isHttps = publicUrl?.startsWith('https://');

    const payload: Record<string, unknown> = {
      order_id: input.clientOrderId,
      order_amount: parseFloat(amount),
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${input.clientOrderId.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`,
        customer_phone: input.customerPhone || '9999999999',
        customer_name: input.customerName || 'Cafe Customer',
      },
      order_note: input.note.slice(0, 50),
    };

    // Cashfree CloudFront WAF rejects unencrypted http:// or localhost in return_url.
    // If a valid public HTTPS URL is configured (e.g. production domain or ngrok), pass it.
    if (isHttps && publicUrl) {
      payload.order_meta = {
        return_url: `${publicUrl}/api/orders/${encodeURIComponent(input.clientOrderId)}/cashfree-return?order_id={order_id}`,
        notify_url: `${publicUrl}/api/webhooks/cashfree`,
      };
    }

    const response = await this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const data = response as Record<string, unknown>;
    const paymentSessionId = String(data.payment_session_id || '');
    const cfOrderId = String(data.cf_order_id || input.clientOrderId);
    const orderStatus = String(data.order_status || 'ACTIVE');

    const paymentUrl = `/api/orders/${encodeURIComponent(input.clientOrderId)}/cashfree-checkout?session=${encodeURIComponent(paymentSessionId)}&mode=${this.environment === 'PRODUCTION' ? 'production' : 'sandbox'}`;

    return {
      orderId: cfOrderId,
      clientOrderId: input.clientOrderId,
      amountPaise: input.amountPaise,
      status: this.mapCashfreeStatus(orderStatus),
      paymentUrl,
    };
  }

  public async getOrder(clientOrderId: string): Promise<UpiGatewayOrder | null> {
    if (this.isMock()) {
      const mock = this.mockOrders.get(clientOrderId);
      if (!mock) return null;
      return {
        orderId: mock.orderId,
        clientOrderId,
        amountPaise: Math.round(mock.amount * 100),
        status: mock.status === 'PAID' ? 'paid' : 'pending',
        paymentUrl: `http://localhost:3002/api/cashfree-mock/checkout?orderId=${encodeURIComponent(clientOrderId)}&session=${mock.paymentSessionId}`,
        ...(mock.utr ? { utr: mock.utr } : {}),
      };
    }

    try {
      const response = await this.request(`/orders/${encodeURIComponent(clientOrderId)}`, {
        method: 'GET',
      });
      const data = response as Record<string, unknown>;
      const orderAmount = parseFloat(String(data.order_amount || 0));
      const amountPaise = Math.round(orderAmount * 100);
      const paymentSessionId = String(data.payment_session_id || '');
      const cfOrderId = String(data.cf_order_id || clientOrderId);
      const orderStatus = String(data.order_status || 'ACTIVE');

      let utr: string | undefined;
      try {
        const paymentsRes = await this.request(`/orders/${encodeURIComponent(clientOrderId)}/payments`, {
          method: 'GET',
        });
        if (Array.isArray(paymentsRes) && paymentsRes.length > 0) {
          const successPayment = paymentsRes.find((p) => p.payment_status === 'SUCCESS') || paymentsRes[0];
          if (successPayment?.bank_reference) {
            utr = String(successPayment.bank_reference);
          }
        }
      } catch {
        // Payments list query is optional
      }

      const paymentUrl = `/api/orders/${encodeURIComponent(clientOrderId)}/cashfree-checkout?session=${encodeURIComponent(paymentSessionId)}&mode=${this.environment === 'PRODUCTION' ? 'production' : 'sandbox'}`;

      return {
        orderId: cfOrderId,
        clientOrderId,
        amountPaise,
        status: this.mapCashfreeStatus(orderStatus),
        paymentUrl,
        ...(utr ? { utr } : {}),
      };
    } catch (error) {
      if (error instanceof UpiGatewayRequestError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  public async getPaymentDetails(
    clientOrderId: string,
    paymentId: string
  ): Promise<CashfreePaymentDetails | null> {
    if (!clientOrderId.trim() || !paymentId.trim()) return null;

    if (this.isMock()) {
      const mock = this.mockOrders.get(clientOrderId);
      if (!mock || mock.status !== 'PAID') return null;
      return {
        paymentId,
        status: 'SUCCESS',
        amount: mock.amount,
        currency: 'INR',
        ...(mock.utr ? { bankReference: mock.utr } : {}),
      };
    }

    try {
      const response = await this.request(
        `/orders/${encodeURIComponent(clientOrderId)}/payments/${encodeURIComponent(paymentId)}`,
        { method: 'GET' }
      );
      if (typeof response !== 'object' || response === null) return null;
      const data = response as Record<string, unknown>;
      const amount = Number(data.payment_amount);
      const resolvedPaymentId = String(data.cf_payment_id ?? '');
      const status = String(data.payment_status ?? '').toUpperCase();
      const currency = String(data.payment_currency ?? '').toUpperCase();
      if (!Number.isFinite(amount) || !resolvedPaymentId || !status || !currency) return null;
      return {
        paymentId: resolvedPaymentId,
        status,
        amount,
        currency,
        ...(data.bank_reference ? { bankReference: String(data.bank_reference) } : {}),
      };
    } catch (error) {
      if (error instanceof UpiGatewayRequestError && error.statusCode === 404) return null;
      throw error;
    }
  }

  public simulateMockPayment(clientOrderId: string, utr?: string): boolean {
    const mock = this.mockOrders.get(clientOrderId);
    if (!mock) return false;
    mock.status = 'PAID';
    mock.utr = utr || `CF${Date.now()}`;
    return true;
  }

  public verifyWebhook(rawBody: Buffer, signature: string | undefined, timestamp: string | undefined): boolean {
    if (!signature || !timestamp || !this.secretKey) return false;

    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - (ts > 1e11 ? Math.floor(ts / 1000) : ts)) > 300) {
      return false;
    }

    try {
      const secret = this.webhookSecret || this.secretKey;
      const expected = crypto
        .createHmac('sha256', secret)
        .update(timestamp + rawBody.toString('utf8'))
        .digest('base64');

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  private mapCashfreeStatus(status: string): UpiGatewayPaymentStatus {
    const s = status.toUpperCase();
    if (s === 'PAID' || s === 'SUCCESS') return 'paid';
    if (s === 'EXPIRED') return 'expired';
    if (s === 'FAILED' || s === 'USER_DROPPED') return 'failed';
    return 'pending';
  }

  private async request(
    path: string,
    options: { method: 'GET' | 'POST'; body?: string }
  ): Promise<unknown> {
    if (!this.isConfigured()) {
      throw new UpiGatewayRequestError('Cashfree payment gateway is not configured.', 503);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method,
        headers: {
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey,
          'x-api-version': this.apiVersion,
          'User-Agent': 'Cashfree/1.0 (Node.js; CafeOS)',
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(options.body ? { body: options.body } : {}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Network request failed.';
      throw new UpiGatewayRequestError(`Could not reach Cashfree: ${detail}`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new UpiGatewayRequestError(`Cashfree returned a non-JSON response (${response.status}).`);
    }

    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : `Cashfree request failed (${response.status}).`;
      throw new UpiGatewayRequestError(message, response.status);
    }

    return payload;
  }
}
