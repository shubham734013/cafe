import crypto from 'node:crypto';
import { paymentLogger } from './logger';
import {
  assertValidYoupiTransition,
  canTransitionYoupiStatus,
  isTerminalInternalStatus,
  isValidTwelveDigitUtr,
  mapInternalStatusToOrderPaymentStatus,
  mapYoupiStatusToInternalStatus,
} from './stateMachine';
import type {
  YoupiGatewayClient,
  YoupiInternalStatus,
  YoupiPaymentRecord,
  YoupiPersistenceAdapter,
  YoupiWebhookPayload,
} from './types';
import { verifyYoupiWebhookRequest } from './webhookHandler';
import { GatewayRequestError } from './youpiClient';
import { DEMO_PLACEHOLDER_VPA, type UpiAppId, isDemoPlaceholderVpa, isValidUpiVpa } from './upiUri';

export interface YoupiPaymentServiceOptions {
  gateway: YoupiGatewayClient;
  persistence: YoupiPersistenceAdapter;
  webhookSecret?: string;
  confirmOnObserver?: boolean;
  publicAppUrl?: string;
  payeeVpa?: string;
  resolvePayeeConfig?: () => { payeeVpa?: string; payeeName?: string };
  onPaymentUpdated?: (payment: YoupiPaymentRecord) => void;
}

const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // YouPI-PG 5-minute payment window
const PROCESSING_WINDOW_MS = 30 * 1000; // YouPI-PG 30-second verification window

export class YoupiPaymentService {
  private readonly gateway: YoupiGatewayClient;
  private readonly persistence: YoupiPersistenceAdapter;
  private readonly webhookSecret: string;
  private readonly confirmOnObserver: boolean;
  private readonly publicAppUrl: string;
  private readonly defaultPayeeVpa: string;
  private readonly resolvePayeeConfig?: () => { payeeVpa?: string; payeeName?: string };
  private readonly onPaymentUpdated?: (payment: YoupiPaymentRecord) => void;

  constructor(options: YoupiPaymentServiceOptions) {
    this.gateway = options.gateway;
    this.persistence = options.persistence;
    this.webhookSecret =
      options.webhookSecret ??
      (process.env.YOUPI_WEBHOOK_SECRET?.trim() ||
        (process.env.NODE_ENV !== 'production' ? 'dev-youpi-webhook-secret-change-me' : ''));
    if (process.env.NODE_ENV === 'production' && !this.webhookSecret) {
      throw new Error('YOUPI_WEBHOOK_SECRET is required in production.');
    }
    this.confirmOnObserver =
      options.confirmOnObserver ?? process.env.YOUPI_CONFIRM_ON_OBSERVER === 'true';
    this.publicAppUrl = (
      options.publicAppUrl ||
      process.env.APP_URL?.trim() ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
    this.defaultPayeeVpa =
      options.payeeVpa || process.env.YOUPI_PAYEE_VPA?.trim() || DEMO_PLACEHOLDER_VPA;
    this.resolvePayeeConfig = options.resolvePayeeConfig;
    this.onPaymentUpdated = options.onPaymentUpdated;
  }

  private getEffectivePayee(): { payeeVpa: string; payeeName: string } {
    const resolved = this.resolvePayeeConfig?.();
    const configuredVpa = resolved?.payeeVpa?.trim();
    const payeeVpa =
      configuredVpa && isValidUpiVpa(configuredVpa) ? configuredVpa : this.defaultPayeeVpa;
    const payeeName = resolved?.payeeName?.trim() || 'Seth Sawariya Cafe';
    return { payeeVpa, payeeName };
  }

  public getConfigInfo() {
    const { payeeVpa, payeeName } = this.getEffectivePayee();
    return {
      configured: this.gateway.mode === 'youpi-live',
      mode: this.gateway.mode,
      gateway: 'youpi-pg' as const,
      currency: 'INR' as const,
      payeeVpa,
      payeeName,
      isDemoVpa: isDemoPlaceholderVpa(payeeVpa),
      confirmOnObserver: this.confirmOnObserver,
      activeWindowSeconds: ACTIVE_WINDOW_MS / 1000,
      processingWindowSeconds: PROCESSING_WINDOW_MS / 1000,
    };
  }

  public getWebhookSecretForDev(): string {
    return this.webhookSecret;
  }

  public getGatewayForDev(): YoupiGatewayClient {
    return this.gateway;
  }

  private transitionAndPersist(
    payment: YoupiPaymentRecord,
    nextStatus: YoupiInternalStatus,
    patch?: Partial<YoupiPaymentRecord>,
    options?: { awardPointsOnSettlement?: boolean }
  ): YoupiPaymentRecord {
    const prevStatus = payment.status;
    assertValidYoupiTransition(prevStatus, nextStatus);

    const now = new Date().toISOString();
    const updated: YoupiPaymentRecord = {
      ...payment,
      ...patch,
      status: nextStatus,
      updatedAt: now,
    };

    this.persistence.savePayment(updated);

    const shouldAwardPoints =
      Boolean(options?.awardPointsOnSettlement) &&
      prevStatus !== 'reconciled' &&
      nextStatus === 'reconciled';

    const orderPaymentStatus = mapInternalStatusToOrderPaymentStatus(nextStatus);
    const paymentRef =
      nextStatus === 'refunded'
        ? updated.refundRef
          ? `Refund ${updated.refundRef}`
          : 'UPI Refunded'
        : updated.utr
          ? `UTR ${updated.utr}`
          : nextStatus === 'manual_review'
            ? 'Manual Bank Review'
            : undefined;

    this.persistence.updateOrderPaymentState(updated.orderId, {
      paymentId: updated.id,
      paymentStatus: orderPaymentStatus,
      paymentRef,
      awardCustomerPoints: shouldAwardPoints,
    });

    this.onPaymentUpdated?.(updated);
    return updated;
  }

  public async createPaymentSession(input: {
    orderId: string;
    customerId?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    idempotencyKey: string;
    preferredApp?: UpiAppId;
  }): Promise<{ payment: YoupiPaymentRecord; duplicate: boolean }> {
    const existingByIdem = this.persistence.getPaymentByIdempotencyKey(input.idempotencyKey);
    if (existingByIdem) {
      return { payment: existingByIdem, duplicate: true };
    }

    const order = this.persistence.getOrderById(input.orderId);
    if (!order) {
      throw new GatewayRequestError({
        code: 'ORDER_NOT_FOUND',
        userMessage: `Order #${input.orderId} was not found.`,
        retryable: false,
        httpStatus: 404,
      });
    }

    if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
      throw new GatewayRequestError({
        code: order.paymentStatus === 'refunded' ? 'ORDER_REFUNDED' : 'ORDER_ALREADY_PAID',
        userMessage: `Order #${input.orderId} is already ${order.paymentStatus}.`,
        retryable: false,
        httpStatus: 409,
      });
    }

    // Reuse any existing non-terminal payment session for this order (prevents duplicate charges
    // across rapid double-clicks or multiple tabs even if client idempotency keys differ).
    const nowMs = Date.now();
    const orderSessions = this.persistence.listPaymentsByOrderId(order.id);
    for (const candidate of orderSessions) {
      if (isTerminalInternalStatus(candidate.status)) continue;

      if (candidate.status === 'observed' || candidate.status === 'manual_review') {
        return { payment: candidate, duplicate: true };
      }

      const expiredByWindow = new Date(candidate.expiresAt).getTime() <= nowMs;
      if (expiredByWindow) {
        this.transitionAndPersist(candidate, 'expired', {
          gatewayStatus: 'EXPIRED',
          failureMessage: '5-minute UPI payment window expired without confirmation.',
          completedAt: new Date(nowMs).toISOString(),
        });
        continue;
      }

      const processingTimedOut =
        candidate.status === 'processing' &&
        Boolean(candidate.processingExpiresAt) &&
        new Date(candidate.processingExpiresAt!).getTime() <= nowMs;
      if (processingTimedOut) {
        this.transitionAndPersist(candidate, 'failed', {
          gatewayStatus: 'FAILED',
          failureCode: 'OBSERVER_WINDOW_EXPIRED',
          failureMessage: '30-second verification ended with no matching bank alert.',
          completedAt: new Date(nowMs).toISOString(),
        });
        continue;
      }

      return { payment: candidate, duplicate: true };
    }

    // Server-authoritative paise & rupees string (never trust browser amount)
    const amountPaise = Math.max(100, Math.round(order.total * 100));
    const amountInr = (amountPaise / 100).toFixed(2);
    const returnUrl = `${this.publicAppUrl}/?orderId=${encodeURIComponent(order.id)}`;
    const { payeeVpa, payeeName } = this.getEffectivePayee();

    if (!isValidUpiVpa(payeeVpa)) {
      throw new GatewayRequestError({
        code: 'INVALID_UPI_ID',
        userMessage: `Configured Receiving UPI ID "${payeeVpa}" is invalid. Update it in Settings -> Payments.`,
        retryable: false,
        httpStatus: 400,
      });
    }

    const gwSession = await this.gateway.createPayment({
      orderId: order.id,
      amountInr,
      amountPaise,
      currency: 'INR',
      returnUrl,
      description: `Seth Sawariya Cafe Order #${order.id}`,
      payeeVpa,
      payeeName,
      idempotencyKey: input.idempotencyKey,
      customer: {
        name: input.customerName?.trim() || undefined,
        email: input.customerEmail?.trim() || undefined,
        phoneNumber: input.customerPhone?.trim() || undefined,
      },
      metadata: {
        orderId: order.id,
        ...(input.customerId || order.customerId
          ? { customerId: input.customerId || order.customerId }
          : {}),
      },
    });

    const now = new Date();
    const mappedStatus = mapYoupiStatusToInternalStatus(gwSession.status, {
      settlementState: gwSession.settlementState,
      confirmOnObserver: this.confirmOnObserver,
    });

    const record: YoupiPaymentRecord = {
      id: `yp_${crypto.randomBytes(8).toString('hex')}`,
      gatewayPaymentId: gwSession.gatewayPaymentId,
      orderId: order.id,
      customerId: input.customerId || order.customerId,
      outletId: 'seth-sawariya-main',
      gateway: 'youpi-pg',
      idempotencyKey: input.idempotencyKey,
      amountPaise,
      amountInr,
      currency: 'INR',
      method: 'UPI',
      preferredApp: input.preferredApp ?? 'any',
      status: mappedStatus,
      gatewayStatus: gwSession.status,
      settlementState: gwSession.settlementState,
      verificationLevel: gwSession.verificationLevel,
      verificationSources: gwSession.verificationSources,
      verificationTag: gwSession.verificationTag,
      queuePosition: gwSession.queuePosition,
      checkoutUrl: gwSession.checkoutUrl,
      upiUri: gwSession.upiUri,
      payeeVpa: gwSession.payeeVpa || payeeVpa,
      utr: gwSession.utr,
      expiresAt: new Date(now.getTime() + ACTIVE_WINDOW_MS).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.persistence.savePayment(record);
    this.persistence.updateOrderPaymentState(order.id, {
      paymentId: record.id,
      paymentStatus: mapInternalStatusToOrderPaymentStatus(mappedStatus),
      awardCustomerPoints: mappedStatus === 'reconciled',
    });

    paymentLogger.info('youpi_session_created', {
      paymentId: record.id,
      gatewayPaymentId: record.gatewayPaymentId,
      orderId: record.orderId,
      amountPaise: record.amountPaise,
      status: record.status,
      vpa: record.payeeVpa,
      phone: input.customerPhone,
    });

    this.onPaymentUpdated?.(record);
    return { payment: record, duplicate: false };
  }

  public async getPaymentStatus(
    paymentId: string,
    options?: { syncWithGateway?: boolean }
  ): Promise<YoupiPaymentRecord | null> {
    let record = this.persistence.getPaymentById(paymentId);
    if (!record) return null;

    if (options?.syncWithGateway !== false && !isTerminalInternalStatus(record.status)) {
      try {
        const gw = await this.gateway.getPayment(record.gatewayPaymentId);
        const nextStatus = mapYoupiStatusToInternalStatus(gw.status, {
          settlementState: gw.settlementState,
          confirmOnObserver: this.confirmOnObserver,
        });

        if (
          gw.utr &&
          record.utr !== gw.utr &&
          this.persistence.isUtrUsedByOtherOrder(gw.utr, record.orderId)
        ) {
          record = this.transitionAndPersist(record, 'manual_review', {
            gatewayStatus: 'MANUAL_REVIEW',
            manualReviewReason: `Duplicate UTR ${gw.utr} already matched another order.`,
            verificationTag: 'DUPLICATE_UTR_DETECTED',
          });
          return record;
        }

        if (gw.utr && (nextStatus === 'observed' || nextStatus === 'reconciled')) {
          this.persistence.recordUtrClaim(gw.utr, record.orderId, record.id);
        }

        if (
          nextStatus !== record.status ||
          gw.queuePosition !== record.queuePosition ||
          gw.verificationLevel !== record.verificationLevel
        ) {
          record = this.transitionAndPersist(
            record,
            nextStatus,
            {
              gatewayStatus: gw.status,
              settlementState: gw.settlementState,
              verificationLevel: gw.verificationLevel,
              verificationSources: gw.verificationSources,
              verificationTag: gw.verificationTag,
              queuePosition: gw.queuePosition,
              utr: gw.utr ?? record.utr,
              completedAt: gw.completedAt ?? record.completedAt,
            },
            { awardPointsOnSettlement: true }
          );
        }
      } catch (err) {
        paymentLogger.warn('youpi_sync_failed', {
          paymentId: record.id,
          error: err instanceof Error ? err.message : 'sync_error',
        });
      }
    }

    // Fallback timeout recovery when gateway sync is unavailable, restarted (sandbox), or stalled
    if (!isTerminalInternalStatus(record.status)) {
      const nowMs = Date.now();
      const pendingStates: YoupiInternalStatus[] = ['initiated', 'active', 'queued', 'processing'];
      if (pendingStates.includes(record.status)) {
        if (
          record.status === 'processing' &&
          record.processingExpiresAt &&
          new Date(record.processingExpiresAt).getTime() <= nowMs
        ) {
          record = this.transitionAndPersist(record, 'failed', {
            gatewayStatus: 'FAILED',
            failureCode: 'OBSERVER_WINDOW_EXPIRED',
            failureMessage: '30-second verification ended with no matching bank alert.',
            completedAt: new Date(nowMs).toISOString(),
          });
        } else if (new Date(record.expiresAt).getTime() <= nowMs) {
          record = this.transitionAndPersist(record, 'expired', {
            gatewayStatus: 'EXPIRED',
            failureMessage: '5-minute UPI payment window expired without confirmation.',
            completedAt: new Date(nowMs).toISOString(),
          });
        }
      }
    }

    return record;
  }

  public async markPayerSubmitted(paymentId: string): Promise<YoupiPaymentRecord> {
    const record = this.persistence.getPaymentById(paymentId);
    if (!record) {
      throw new GatewayRequestError({
        code: 'PAYMENT_NOT_FOUND',
        userMessage: 'Payment session not found.',
        retryable: false,
        httpStatus: 404,
      });
    }

    if (isTerminalInternalStatus(record.status) || record.status === 'observed') {
      return record;
    }

    if (this.gateway.markPayerSubmitted) {
      const gw = await this.gateway.markPayerSubmitted(record.gatewayPaymentId);
      const nextStatus = mapYoupiStatusToInternalStatus(gw.status, {
        settlementState: gw.settlementState,
        confirmOnObserver: this.confirmOnObserver,
      });
      if (!canTransitionYoupiStatus(record.status, nextStatus)) {
        return record;
      }
      return this.transitionAndPersist(record, nextStatus, {
        gatewayStatus: gw.status,
        processingExpiresAt: new Date(Date.now() + PROCESSING_WINDOW_MS).toISOString(),
      });
    }

    return record;
  }

  public async cancelPaymentSession(paymentId: string): Promise<YoupiPaymentRecord> {
    const record = this.persistence.getPaymentById(paymentId);
    if (!record) {
      throw new GatewayRequestError({
        code: 'PAYMENT_NOT_FOUND',
        userMessage: 'Payment session not found.',
        retryable: false,
        httpStatus: 404,
      });
    }

    if (isTerminalInternalStatus(record.status) || record.status === 'observed') {
      return record;
    }

    const res = await this.gateway.cancelPayment(record.gatewayPaymentId);
    return this.transitionAndPersist(record, 'cancelled', {
      gatewayStatus: res.status || 'CANCELLED',
      failureMessage: 'Checkout cancelled by customer. Queue slot released.',
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Implements all 6 mandatory YouPI-PG webhook checks:
   * 1. Raw body bytes preserved
   * 2. Constant-time HMAC-SHA256 verification (v1 & v2 + timestamp tolerance)
   * 3. Idempotent deliveryId deduplication
   * 4. Order exists and isn't already settled
   * 5. Exact amountPaise match against saved order
   * 6. Unique 12-digit UTR not previously claimed by another order
   */
  public processWebhook(input: {
    rawBody: Buffer | string;
    signature?: string;
    signatureV2?: string;
    timestamp?: string;
    deliveryId?: string;
  }): {
    httpStatus: number;
    body: Record<string, unknown>;
    payment?: YoupiPaymentRecord;
  } {
    // Checks 1 & 2: Raw body + HMAC-SHA256 + timestamp freshness
    const verified = verifyYoupiWebhookRequest({
      rawBody: input.rawBody,
      signature: input.signature,
      signatureV2: input.signatureV2,
      timestamp: input.timestamp,
      deliveryId: input.deliveryId,
      secret: this.webhookSecret,
    });

    if (!verified.valid) {
      paymentLogger.warn('youpi_webhook_rejected', { reason: verified.reason });
      return {
        httpStatus: 401,
        body: { error: verified.reason },
      };
    }

    const payload: YoupiWebhookPayload = verified.payload;
    const deliveryId =
      payload.deliveryId ||
      `dlv_${crypto.createHash('sha256').update(input.rawBody).digest('hex').slice(0, 16)}`;

    // Check 3: Delivery ID idempotency
    if (this.persistence.hasWebhookDelivery(deliveryId)) {
      paymentLogger.info('youpi_webhook_duplicate_ignored', {
        deliveryId,
        event: payload.event,
      });
      return {
        httpStatus: 200,
        body: { received: true, duplicate: true },
      };
    }

    // Check 4: Find payment & order
    const payment = this.persistence.getPaymentByGatewayId(payload.paymentId);
    const order = this.persistence.getOrderById(payload.orderId);

    this.persistence.saveWebhookDelivery({
      deliveryId,
      event: payload.event,
      paymentId: payload.paymentId,
      orderId: payload.orderId,
      utr: payload.utr,
      receivedAt: new Date().toISOString(),
    });

    if (!payment || !order) {
      paymentLogger.warn('youpi_webhook_unknown_session', {
        deliveryId,
        paymentId: payload.paymentId,
        orderId: payload.orderId,
      });
      return {
        httpStatus: 200,
        body: { received: true, ignored: true, reason: 'Order or payment session not found' },
      };
    }

    if (
      isTerminalInternalStatus(payment.status) ||
      order.paymentStatus === 'paid' ||
      order.paymentStatus === 'refunded'
    ) {
      paymentLogger.info('youpi_webhook_terminal_ignored', {
        deliveryId,
        paymentId: payment.id,
        status: payment.status,
        orderPaymentStatus: order.paymentStatus,
        event: payload.event,
      });
      return {
        httpStatus: 200,
        body: {
          received: true,
          ignored: true,
          alreadySettled: payment.status === 'reconciled' || order.paymentStatus === 'paid',
          alreadyTerminal: isTerminalInternalStatus(payment.status),
          status: payment.status,
        },
        payment,
      };
    }

    // Check 5: Server-side amountPaise verification (catches browser tampering or partial payments)
    const expectedPaise = Math.max(100, Math.round(order.total * 100));
    if (
      (payload.event === 'OBSERVED_SUCCESS' ||
        payload.event === 'RECONCILED' ||
        payload.event === 'SUCCESS') &&
      payload.amountPaise !== expectedPaise
    ) {
      const flagged = this.transitionAndPersist(payment, 'manual_review', {
        gatewayStatus: 'MANUAL_REVIEW',
        utr: payload.utr ?? payment.utr,
        verificationTag: 'AMOUNT_MISMATCH',
        manualReviewReason: `Amount mismatch: expected ${expectedPaise} paise, gateway sent ${payload.amountPaise} paise.`,
      });
      paymentLogger.warn('youpi_webhook_amount_mismatch', {
        paymentId: payment.id,
        orderId: payment.orderId,
        expectedPaise,
        receivedPaise: payload.amountPaise,
      });
      return {
        httpStatus: 200,
        body: { received: true, flagged: true, reason: 'ORDER_AMOUNT_MISMATCH' },
        payment: flagged,
      };
    }

    // Check 6: UTR uniqueness verification (never allow reusing one bank UTR across two orders)
    if (
      payload.utr &&
      (payload.event === 'OBSERVED_SUCCESS' ||
        payload.event === 'RECONCILED' ||
        payload.event === 'SUCCESS')
    ) {
      if (this.persistence.isUtrUsedByOtherOrder(payload.utr, order.id)) {
        const flagged = this.transitionAndPersist(payment, 'manual_review', {
          gatewayStatus: 'MANUAL_REVIEW',
          utr: payload.utr,
          verificationTag: 'DUPLICATE_UTR_DETECTED',
          manualReviewReason: `Bank reference UTR ${payload.utr} was already claimed by another order.`,
        });
        paymentLogger.warn('youpi_webhook_duplicate_utr', {
          paymentId: payment.id,
          orderId: payment.orderId,
          utr: payload.utr,
        });
        return {
          httpStatus: 200,
          body: { received: true, flagged: true, reason: 'DUPLICATE_UTR' },
          payment: flagged,
        };
      }
      this.persistence.recordUtrClaim(payload.utr, order.id, payment.id);
    }

    const nextStatus = mapYoupiStatusToInternalStatus(payload.event, {
      settlementState: payload.settlementState,
      confirmOnObserver: this.confirmOnObserver,
    });

    if (!canTransitionYoupiStatus(payment.status, nextStatus)) {
      paymentLogger.warn('youpi_webhook_incompatible_transition_ignored', {
        deliveryId,
        paymentId: payment.id,
        fromStatus: payment.status,
        toStatus: nextStatus,
        event: payload.event,
      });
      return {
        httpStatus: 200,
        body: {
          received: true,
          ignored: true,
          reason: 'INCOMPATIBLE_STATE_TRANSITION',
          status: payment.status,
        },
        payment,
      };
    }

    const updated = this.transitionAndPersist(
      payment,
      nextStatus,
      {
        gatewayStatus: payload.event,
        settlementState: payload.settlementState ?? payment.settlementState,
        utr: payload.utr ?? payment.utr,
        verificationLevel: payload.verificationLevel ?? payment.verificationLevel,
        verificationSources: payload.verificationSources ?? payment.verificationSources,
        verificationTag: payload.verificationTag ?? payment.verificationTag,
        failureMessage:
          nextStatus === 'failed'
            ? payload.reason || '30-second verification ended with no matching bank alert.'
            : nextStatus === 'expired'
              ? '5-minute UPI payment window expired.'
              : nextStatus === 'cancelled'
                ? 'Customer cancelled the checkout.'
                : undefined,
        manualReviewReason:
          nextStatus === 'manual_review'
            ? payload.reason || 'Flagged by YouPI-PG for manual bank verification.'
            : undefined,
        completedAt: payload.completedAt ?? new Date().toISOString(),
      },
      { awardPointsOnSettlement: true }
    );

    paymentLogger.info('youpi_webhook_processed', {
      deliveryId,
      event: payload.event,
      paymentId: updated.id,
      orderId: updated.orderId,
      status: updated.status,
    });

    return {
      httpStatus: 200,
      body: {
        received: true,
        status: updated.status,
        settlementState: updated.settlementState,
      },
      payment: updated,
    };
  }

  /**
   * Staff bank-statement verification: promotes an observed or manual-review payment
   * to `reconciled` (paid) after a manager confirms the UTR in the bank app/statement,
   * or rejects it to `failed`.
   */
  public staffVerifyBankCredit(input: {
    paymentId: string;
    decision: 'approve' | 'reject';
    utr?: string;
    note?: string;
    staffName?: string;
  }): YoupiPaymentRecord {
    const payment = this.persistence.getPaymentById(input.paymentId);
    if (!payment) {
      throw new GatewayRequestError({
        code: 'PAYMENT_NOT_FOUND',
        userMessage: 'Payment record not found.',
        retryable: false,
        httpStatus: 404,
      });
    }

    if (payment.status !== 'observed' && payment.status !== 'manual_review') {
      throw new GatewayRequestError({
        code: 'INVALID_VERIFY_STATE',
        userMessage: `Only bank-alert observed or manual-review payments can be verified (current: ${payment.status}).`,
        retryable: false,
        httpStatus: 409,
      });
    }

    if (input.decision === 'approve') {
      const utr = (input.utr ?? payment.utr ?? '').trim();
      if (!isValidTwelveDigitUtr(utr)) {
        throw new GatewayRequestError({
          code: 'INVALID_UTR',
          userMessage: 'Enter a valid 12-digit UTR number from your bank statement to confirm settlement.',
          retryable: false,
          httpStatus: 400,
        });
      }

      if (this.persistence.isUtrUsedByOtherOrder(utr, payment.orderId)) {
        throw new GatewayRequestError({
          code: 'DUPLICATE_UTR',
          userMessage: `UTR ${utr} is already linked to a different order.`,
          retryable: false,
          httpStatus: 409,
        });
      }

      this.persistence.recordUtrClaim(utr, payment.orderId, payment.id);

      return this.transitionAndPersist(
        payment,
        'reconciled',
        {
          gatewayStatus: 'RECONCILED',
          settlementState: 'RECONCILED',
          utr,
          verificationTag: 'STAFF_BANK_VERIFIED',
          verifiedByStaff: input.staffName || 'Seth Sawariya Manager',
          manualReviewReason: input.note?.trim() || undefined,
          completedAt: payment.completedAt || new Date().toISOString(),
        },
        { awardPointsOnSettlement: true }
      );
    }

    if (payment.status === 'observed') {
      // Move observed -> manual_review -> failed cleanly or allow direct failure with reason
      const reviewed = this.transitionAndPersist(payment, 'manual_review', {
        gatewayStatus: 'MANUAL_REVIEW',
        manualReviewReason: input.note?.trim() || 'Rejected during bank statement verification.',
      });
      return this.transitionAndPersist(reviewed, 'failed', {
        gatewayStatus: 'FAILED',
        failureCode: 'BANK_VERIFY_REJECTED',
        failureMessage: input.note?.trim() || 'Bank credit not found on statement check.',
        verifiedByStaff: input.staffName || 'Seth Sawariya Manager',
        completedAt: new Date().toISOString(),
      });
    }

    return this.transitionAndPersist(payment, 'failed', {
      gatewayStatus: 'FAILED',
      failureCode: 'BANK_VERIFY_REJECTED',
      failureMessage: input.note?.trim() || 'Bank credit not found on statement check.',
      verifiedByStaff: input.staffName || 'Seth Sawariya Manager',
      completedAt: new Date().toISOString(),
    });
  }

  public async refundPaymentSession(input: {
    paymentId: string;
    refundRef?: string;
    reason?: string;
    staffName?: string;
  }): Promise<YoupiPaymentRecord> {
    const payment = this.persistence.getPaymentById(input.paymentId);
    if (!payment) {
      throw new GatewayRequestError({
        code: 'PAYMENT_NOT_FOUND',
        userMessage: 'Payment record not found.',
        retryable: false,
        httpStatus: 404,
      });
    }

    if (payment.status !== 'reconciled') {
      throw new GatewayRequestError({
        code: 'INVALID_REFUND_STATE',
        userMessage: `Only settled/reconciled UPI payments can be refunded (current: ${payment.status}).`,
        retryable: false,
        httpStatus: 409,
      });
    }

    const generatedRef = `RF-${Date.now().toString(36).toUpperCase()}`;
    const refundRef = input.refundRef?.trim() || generatedRef;
    const reason = input.reason?.trim() || 'Full UPI refund issued by counter manager';
    const staffName = input.staffName?.trim() || 'Seth Sawariya Manager';

    if (typeof this.gateway.refundPayment === 'function') {
      await this.gateway.refundPayment(payment.gatewayPaymentId, {
        refundRef,
        reason,
      });
    }

    const refundedAt = new Date().toISOString();
    const updated = this.transitionAndPersist(payment, 'refunded', {
      gatewayStatus: 'REFUNDED',
      refundRef,
      refundReason: reason,
      refundedAt,
      refundedByStaff: staffName,
    });

    paymentLogger.info('youpi_payment_refunded', {
      paymentId: updated.id,
      orderId: updated.orderId,
      amountPaise: updated.amountPaise,
      refundRef,
    });

    return updated;
  }

  public listPaymentsByOrder(orderId: string): YoupiPaymentRecord[] {
    return this.persistence.listPaymentsByOrderId(orderId);
  }

  public listPaymentsByCustomer(customerId: string): YoupiPaymentRecord[] {
    return this.persistence.listPaymentsByCustomerId(customerId);
  }

  public getDailyReconciliationSummary() {
    const all = this.persistence.listAllPayments();
    const observedPending = all.filter((p) => p.status === 'observed' || p.status === 'manual_review');
    const reconciled = all.filter((p) => p.status === 'reconciled');
    const refunded = all.filter((p) => p.status === 'refunded');
    return {
      totalSessions: all.length,
      reconciledCount: reconciled.length,
      reconciledAmountPaise: reconciled.reduce((s, p) => s + p.amountPaise, 0),
      refundedCount: refunded.length,
      refundedAmountPaise: refunded.reduce((s, p) => s + p.amountPaise, 0),
      pendingVerificationCount: observedPending.length,
      pendingVerificationPaise: observedPending.reduce((s, p) => s + p.amountPaise, 0),
      pendingItems: observedPending,
    };
  }

  /**
   * Scheduled reconciliation job: re-checks YouPI-PG sessions stuck in
   * initiated/active/queued/processing past staleAfterMs, processingExpiresAt, or expiresAt.
   */
  public async reconcileStuckPendingPayments(options?: {
    staleAfterMs?: number;
    nowMs?: number;
  }): Promise<{ checked: number; updated: number }> {
    const nowMs = options?.nowMs ?? Date.now();
    const staleAfterMs = options?.staleAfterMs ?? 2 * 60 * 1000;
    const pendingStatuses = new Set<YoupiInternalStatus>([
      'initiated',
      'active',
      'queued',
      'processing',
    ]);

    const candidates = this.persistence.listAllPayments().filter((p) => {
      if (!pendingStatuses.has(p.status)) return false;
      const ageMs = nowMs - new Date(p.updatedAt).getTime();
      const expired = new Date(p.expiresAt).getTime() <= nowMs;
      const processingExpired =
        p.status === 'processing' &&
        Boolean(p.processingExpiresAt) &&
        new Date(p.processingExpiresAt!).getTime() <= nowMs;
      return expired || processingExpired || ageMs >= staleAfterMs;
    });

    let updated = 0;
    for (const candidate of candidates) {
      const beforeStatus = candidate.status;
      const synced = await this.getPaymentStatus(candidate.id, { syncWithGateway: true });
      if (synced && synced.status !== beforeStatus) {
        updated += 1;
        continue;
      }

      if (synced && !isTerminalInternalStatus(synced.status)) {
        const processingTimedOut =
          synced.status === 'processing' &&
          Boolean(synced.processingExpiresAt) &&
          new Date(synced.processingExpiresAt!).getTime() <= nowMs;
        if (processingTimedOut) {
          this.transitionAndPersist(synced, 'failed', {
            gatewayStatus: 'FAILED',
            failureCode: 'OBSERVER_WINDOW_EXPIRED',
            failureMessage: '30-second verification ended with no matching bank alert.',
            completedAt: new Date(nowMs).toISOString(),
          });
          updated += 1;
          continue;
        }

        const isExpired = new Date(synced.expiresAt).getTime() <= nowMs;
        if (isExpired) {
          this.transitionAndPersist(synced, 'expired', {
            gatewayStatus: 'EXPIRED',
            failureMessage: '5-minute UPI payment window expired without confirmation.',
            completedAt: new Date(nowMs).toISOString(),
          });
          updated += 1;
        }
      }
    }

    if (candidates.length > 0) {
      paymentLogger.info('youpi_reconcile_job_ran', {
        checked: candidates.length,
        updated,
      });
    }

    return { checked: candidates.length, updated };
  }
}
