import crypto from 'node:crypto';
import { z } from 'zod';
import { createOrderSchema } from '../shared/schemas';
import {
  zomatoCircuitBreaker,
  swiggyCircuitBreaker,
  withRetry,
} from './resilience';

export interface ZomatoConfig {
  apiKey?: string;
  webhookSecret?: string;
  resId?: string;
  apiBaseUrl?: string;
}

export interface SwiggyConfig {
  apiKey?: string;
  webhookSecret?: string;
  restaurantId?: string;
  apiBaseUrl?: string;
}

/**
 * -------------------------------------------------------------
 * 1. DIRECT ZOMATO FOOD ORDERING PARTNER API CLIENT
 * -------------------------------------------------------------
 */
export class ZomatoDirectClient {
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly resId: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    config: ZomatoConfig = {
      apiKey: process.env.ZOMATO_PARTNER_API_KEY,
      webhookSecret: process.env.ZOMATO_WEBHOOK_SECRET,
      resId: process.env.ZOMATO_RES_ID,
      apiBaseUrl: process.env.ZOMATO_API_BASE_URL || 'https://api.zomato.com/v1/partner',
    },
    fetchImpl: typeof fetch = fetch
  ) {
    this.apiKey = config.apiKey || '';
    this.webhookSecret = config.webhookSecret || '';
    this.resId = config.resId || '18942123';
    this.apiBaseUrl = config.apiBaseUrl || 'https://api.zomato.com/v1/partner';
    this.fetchImpl = fetchImpl;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.webhookSecret);
  }

  public isSimulated(): boolean {
    return (
      !this.apiKey ||
      this.apiKey.includes('test') ||
      this.apiKey.includes('mock') ||
      process.env.NODE_ENV === 'test'
    );
  }

  public getWebhookSecret(): string {
    return this.webhookSecret;
  }

  /**
   * Cryptographically verify Zomato HMAC-SHA256 Webhook Signature
   */
  public verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader?: string,
    secretOverride?: string
  ): boolean {
    const secret = secretOverride || this.webhookSecret;
    if (!secret || !signatureHeader) return false;

    try {
      const computed = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuf = Buffer.from(computed, 'utf8');
      const actualBuf = Buffer.from(signatureHeader.trim(), 'utf8');

      if (expectedBuf.length !== actualBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Map Zomato Food Partner payload into canonical CafeOS createOrderSchema
   */
  public parseZomatoOrder(body: any): z.infer<typeof createOrderSchema> {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid Zomato order payload: expected JSON object');
    }

    const orderId = String(body.order_id || '').trim();
    if (!orderId) {
      throw new Error('Zomato order_id is required');
    }

    const orderItems = Array.isArray(body.order_items) ? body.order_items : [];
    if (orderItems.length === 0) {
      throw new Error('Zomato order must contain at least one item');
    }

    const mappedItems = orderItems.map((item: any) => ({
      menuItemId: String(item.item_id || item.sku_id || 'unknown').trim(),
      name: String(item.name || item.title || 'Item').trim(),
      price: Number(item.unit_cost ?? item.price ?? 0),
      quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
      station: (['Barista', 'Grill', 'Fryer', 'Cold Bar', 'Kitchen'].includes(item.station)
        ? item.station
        : 'Kitchen') as 'Barista' | 'Grill' | 'Fryer' | 'Cold Bar' | 'Kitchen',
      note: String(item.customization_notes || item.note || '').trim(),
      imageUrl: '',
    }));

    const riderName = body.delivery_details?.rider_name;
    const riderPhone = body.delivery_details?.rider_phone;
    const pickupTime = body.delivery_details?.expected_pickup_time;

    let riderNote = '';
    if (riderName) riderNote += `Rider: ${riderName}`;
    if (riderPhone) riderNote += ` (${riderPhone})`;
    if (pickupTime) riderNote += ` • Pickup in ${pickupTime}`;

    return {
      outletId: 'seth-sawariya-main',
      serviceMode: 'delivery',
      deliveryPartner: 'Zomato',
      deliveryOrderId: orderId,
      riderNote: riderNote.trim() || 'Awaiting rider assignment',
      items: mappedItems,
      couponCode: '',
      paymentMode: 'upi',
      paymentStatus: 'paid', // Zomato partner orders are settled via aggregator
      cookingNote: String(body.special_instructions || body.instructions || '').trim(),
      isPosTerminal: false,
      idempotencyKey: `zomato_${orderId}`,
    };
  }

  /**
   * Call Zomato Outbound Partner API: Notify "Food Ready for Pickup"
   */
  public async notifyFoodReady(deliveryOrderId: string): Promise<{ success: boolean; simulated?: boolean }> {
    return zomatoCircuitBreaker.execute<{ success: boolean; simulated?: boolean }>(
      async () => {
        if (this.isSimulated()) {
          console.log(`[Zomato Partner API (Simulated)] Order ${deliveryOrderId} marked FOOD_READY`);
          return { success: true, simulated: true };
        }

        return withRetry(
          async () => {
            const res = await this.fetchImpl(`${this.apiBaseUrl}/order/${deliveryOrderId}/food_ready`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'X-Res-ID': this.resId,
              },
              body: JSON.stringify({
                res_id: this.resId,
                order_id: deliveryOrderId,
                timestamp: Math.floor(Date.now() / 1000),
              }),
            });

            if (!res.ok) {
              const errorText = await res.text().catch(() => '');
              throw new Error(`Zomato API food_ready failed with status ${res.status}: ${errorText}`);
            }

            return { success: true };
          },
          { maxRetries: 2, initialDelayMs: 200 }
        );
      },
      () => {
        console.warn(`[Zomato Partner API] Circuit Breaker fallback for food_ready on ${deliveryOrderId}`);
        return { success: false, simulated: true };
      }
    );
  }

  /**
   * Call Zomato Outbound Partner API: Sync Item Availability (86-ing)
   */
  public async updateItemAvailability(skuId: string, available: boolean): Promise<{ success: boolean; simulated?: boolean }> {
    return zomatoCircuitBreaker.execute<{ success: boolean; simulated?: boolean }>(
      async () => {
        if (this.isSimulated()) {
          console.log(`[Zomato Partner API (Simulated)] SKU ${skuId} availability set to ${available}`);
          return { success: true, simulated: true };
        }

        const res = await this.fetchImpl(`${this.apiBaseUrl}/item/${encodeURIComponent(skuId)}/status`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Res-ID': this.resId,
          },
          body: JSON.stringify({
            res_id: this.resId,
            item_id: skuId,
            in_stock: available,
          }),
        });

        return { success: res.ok };
      },
      () => ({ success: false, simulated: true })
    );
  }
}

/**
 * -------------------------------------------------------------
 * 2. DIRECT SWIGGY CONNECT PARTNER API CLIENT
 * -------------------------------------------------------------
 */
export class SwiggyDirectClient {
  private readonly apiKey: string;
  private readonly webhookSecret: string;
  private readonly restaurantId: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    config: SwiggyConfig = {
      apiKey: process.env.SWIGGY_PARTNER_API_KEY,
      webhookSecret: process.env.SWIGGY_WEBHOOK_SECRET,
      restaurantId: process.env.SWIGGY_RESTAURANT_ID,
      apiBaseUrl: process.env.SWIGGY_API_BASE_URL || 'https://partner.swiggy.com/v1',
    },
    fetchImpl: typeof fetch = fetch
  ) {
    this.apiKey = config.apiKey || '';
    this.webhookSecret = config.webhookSecret || '';
    this.restaurantId = config.restaurantId || 'SWG-87612';
    this.apiBaseUrl = config.apiBaseUrl || 'https://partner.swiggy.com/v1';
    this.fetchImpl = fetchImpl;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.webhookSecret);
  }

  public isSimulated(): boolean {
    return (
      !this.apiKey ||
      this.apiKey.includes('test') ||
      this.apiKey.includes('mock') ||
      process.env.NODE_ENV === 'test'
    );
  }

  public getWebhookSecret(): string {
    return this.webhookSecret;
  }

  /**
   * Cryptographically verify Swiggy HMAC-SHA256 Webhook Signature
   */
  public verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader?: string,
    secretOverride?: string
  ): boolean {
    const secret = secretOverride || this.webhookSecret;
    if (!secret || !signatureHeader) return false;

    try {
      const computed = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuf = Buffer.from(computed, 'utf8');
      const actualBuf = Buffer.from(signatureHeader.trim(), 'utf8');

      if (expectedBuf.length !== actualBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Map Swiggy Connect payload into canonical CafeOS createOrderSchema
   */
  public parseSwiggyOrder(body: any): z.infer<typeof createOrderSchema> {
    if (!body || typeof body !== 'object') {
      throw new Error('Invalid Swiggy order payload: expected JSON object');
    }

    const orderId = String(body.order_id || '').trim();
    if (!orderId) {
      throw new Error('Swiggy order_id is required');
    }

    const cartItems = Array.isArray(body.cart?.items)
      ? body.cart.items
      : Array.isArray(body.items)
      ? body.items
      : [];

    if (cartItems.length === 0) {
      throw new Error('Swiggy order must contain at least one item');
    }

    const mappedItems = cartItems.map((item: any) => ({
      menuItemId: String(item.item_id || item.sku || 'unknown').trim(),
      name: String(item.name || item.item_name || 'Item').trim(),
      price: Number(item.price ?? item.unit_price ?? 0),
      quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
      station: (['Barista', 'Grill', 'Fryer', 'Cold Bar', 'Kitchen'].includes(item.station)
        ? item.station
        : 'Kitchen') as 'Barista' | 'Grill' | 'Fryer' | 'Cold Bar' | 'Kitchen',
      note: String(item.notes || item.special_request || '').trim(),
      imageUrl: '',
    }));

    const executive = body.delivery_info?.delivery_executive;
    let riderNote = '';
    if (executive?.name) riderNote += `Rider: ${executive.name}`;
    if (executive?.phone) riderNote += ` (${executive.phone})`;
    if (body.delivery_info?.otp) riderNote += ` • OTP: ${body.delivery_info.otp}`;

    return {
      outletId: 'seth-sawariya-main',
      serviceMode: 'delivery',
      deliveryPartner: 'Swiggy',
      deliveryOrderId: orderId,
      riderNote: riderNote.trim() || 'Awaiting rider assignment',
      items: mappedItems,
      couponCode: '',
      paymentMode: 'upi',
      paymentStatus: 'paid', // Swiggy orders are pre-paid aggregator transactions
      cookingNote: String(body.special_instructions || body.instructions || '').trim(),
      isPosTerminal: false,
      idempotencyKey: `swiggy_${orderId}`,
    };
  }

  /**
   * Call Swiggy Outbound Partner API: Notify "FOOD_READY"
   */
  public async notifyFoodReady(deliveryOrderId: string): Promise<{ success: boolean; simulated?: boolean }> {
    return swiggyCircuitBreaker.execute<{ success: boolean; simulated?: boolean }>(
      async () => {
        if (this.isSimulated()) {
          console.log(`[Swiggy Partner API (Simulated)] Order ${deliveryOrderId} marked FOOD_READY`);
          return { success: true, simulated: true };
        }

        return withRetry(
          async () => {
            const res = await this.fetchImpl(`${this.apiBaseUrl}/orders/${deliveryOrderId}/status`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'X-Restaurant-ID': this.restaurantId,
              },
              body: JSON.stringify({
                restaurant_id: this.restaurantId,
                order_id: deliveryOrderId,
                status: 'FOOD_READY',
              }),
            });

            if (!res.ok) {
              const errorText = await res.text().catch(() => '');
              throw new Error(`Swiggy API FOOD_READY failed with status ${res.status}: ${errorText}`);
            }

            return { success: true };
          },
          { maxRetries: 2, initialDelayMs: 200 }
        );
      },
      () => {
        console.warn(`[Swiggy Partner API] Circuit Breaker fallback for food_ready on ${deliveryOrderId}`);
        return { success: false, simulated: true };
      }
    );
  }

  /**
   * Call Swiggy Outbound Partner API: Sync Item Availability (86-ing)
   */
  public async updateItemAvailability(skuId: string, available: boolean): Promise<{ success: boolean; simulated?: boolean }> {
    return swiggyCircuitBreaker.execute<{ success: boolean; simulated?: boolean }>(
      async () => {
        if (this.isSimulated()) {
          console.log(`[Swiggy Partner API (Simulated)] SKU ${skuId} availability set to ${available}`);
          return { success: true, simulated: true };
        }

        const res = await this.fetchImpl(`${this.apiBaseUrl}/items/${encodeURIComponent(skuId)}/status`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'X-Restaurant-ID': this.restaurantId,
          },
          body: JSON.stringify({
            restaurant_id: this.restaurantId,
            item_id: skuId,
            is_available: available,
          }),
        });

        return { success: res.ok };
      },
      () => ({ success: false, simulated: true })
    );
  }
}
