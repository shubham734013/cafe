import type { UpiAppId } from './upiUri';

export type YoupiGatewayRawStatus =
  | 'INITIATED'
  | 'ACTIVE'
  | 'QUEUED'
  | 'PROCESSING'
  | 'OBSERVED_SUCCESS'
  | 'RECONCILED'
  | 'REFUNDED'
  | 'MANUAL_REVIEW'
  | 'SUCCESS'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export type YoupiInternalStatus =
  | 'initiated'
  | 'active'
  | 'queued'
  | 'processing'
  | 'observed'
  | 'reconciled'
  | 'refunded'
  | 'manual_review'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type YoupiSettlementState =
  | 'NOT_RECONCILED'
  | 'RECONCILED'
  | 'NOT_BANK_SETTLEMENT';

export type PaymentOrderSyncStatus =
  | 'unpaid'
  | 'pending'
  | 'observed'
  | 'paid'
  | 'manual_review'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded';

export interface YoupiPaymentRecord {
  id: string;
  gatewayPaymentId: string;
  orderId: string;
  customerId?: string;
  outletId: string;
  gateway: 'youpi-pg';
  idempotencyKey: string;
  amountPaise: number;
  amountInr: string;
  currency: 'INR';
  method: 'UPI';
  preferredApp?: UpiAppId;
  status: YoupiInternalStatus;
  gatewayStatus: YoupiGatewayRawStatus;
  settlementState: YoupiSettlementState;
  verificationLevel: number;
  verificationSources: string[];
  verificationTag?: string;
  queuePosition: number;
  checkoutUrl: string;
  upiUri?: string;
  payeeVpa?: string;
  utr?: string;
  failureCode?: string;
  failureMessage?: string;
  manualReviewReason?: string;
  verifiedByStaff?: string;
  refundRef?: string;
  refundReason?: string;
  refundedAt?: string;
  refundedByStaff?: string;
  expiresAt: string;
  processingExpiresAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyReconciliationSummary {
  totalSessions: number;
  reconciledCount: number;
  reconciledAmountPaise: number;
  refundedCount: number;
  refundedAmountPaise: number;
  pendingVerificationCount: number;
  pendingVerificationPaise: number;
  pendingItems: YoupiPaymentRecord[];
}

export interface YoupiWebhookDeliveryRecord {
  deliveryId: string;
  event: YoupiGatewayRawStatus;
  paymentId: string;
  orderId: string;
  utr?: string;
  receivedAt: string;
}

export interface YoupiWebhookPayload {
  event: YoupiGatewayRawStatus;
  paymentId: string;
  orderId: string;
  amount: string;
  amountPaise: number;
  currency: string;
  method?: string;
  settlementState?: YoupiSettlementState;
  utr?: string;
  deliveryId?: string;
  timestamp?: number | string;
  verificationTag?: string;
  verificationLevel?: number;
  verificationSources?: string[];
  completedAt?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface YoupiCreateSessionInput {
  orderId: string;
  amountInr: string;
  amountPaise: number;
  currency: 'INR';
  returnUrl?: string;
  description?: string;
  payeeVpa?: string;
  payeeName?: string;
  idempotencyKey: string;
  customer?: {
    name?: string;
    email?: string;
    phoneNumber?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface YoupiGatewaySessionResponse {
  gatewayPaymentId: string;
  orderId: string;
  amountInr: string;
  amountPaise: number;
  currency: 'INR';
  status: YoupiGatewayRawStatus;
  settlementState: YoupiSettlementState;
  verificationLevel: number;
  verificationSources: string[];
  verificationTag?: string;
  queuePosition: number;
  checkoutUrl: string;
  upiUri?: string;
  payeeVpa?: string;
  utr?: string;
  completedAt?: string;
}

export interface YoupiGatewayClient {
  readonly mode: 'youpi-live' | 'youpi-sandbox-fallback';
  createPayment(input: YoupiCreateSessionInput): Promise<YoupiGatewaySessionResponse>;
  getPayment(gatewayPaymentId: string): Promise<YoupiGatewaySessionResponse>;
  cancelPayment(gatewayPaymentId: string): Promise<{ success: boolean; status: YoupiGatewayRawStatus }>;
  refundPayment?(
    gatewayPaymentId: string,
    options?: { refundRef?: string; reason?: string }
  ): Promise<{ success: boolean; status: YoupiGatewayRawStatus; refundRef?: string }>;
  markPayerSubmitted?(gatewayPaymentId: string): Promise<YoupiGatewaySessionResponse>;
  simulateOutcome?(
    gatewayPaymentId: string,
    outcome: 'OBSERVED_SUCCESS' | 'RECONCILED' | 'MANUAL_REVIEW' | 'FAILED' | 'EXPIRED' | 'CANCELLED',
    options?: { utr?: string; overrideAmountPaise?: number }
  ): YoupiWebhookPayload | null;
}

export interface YoupiOrderLookup {
  id: string;
  total: number;
  customerId?: string;
  paymentStatus?: PaymentOrderSyncStatus;
}

export interface YoupiPersistenceAdapter {
  getOrderById(orderId: string): YoupiOrderLookup | null;
  getPaymentById(id: string): YoupiPaymentRecord | null;
  getPaymentByGatewayId(gatewayPaymentId: string): YoupiPaymentRecord | null;
  getPaymentByIdempotencyKey(key: string): YoupiPaymentRecord | null;
  listPaymentsByOrderId(orderId: string): YoupiPaymentRecord[];
  listPaymentsByCustomerId(customerId: string): YoupiPaymentRecord[];
  listAllPayments(): YoupiPaymentRecord[];
  savePayment(payment: YoupiPaymentRecord): void;
  isUtrUsedByOtherOrder(utr: string, orderId: string): boolean;
  recordUtrClaim(utr: string, orderId: string, paymentId: string): void;
  hasWebhookDelivery(deliveryId: string): boolean;
  saveWebhookDelivery(record: YoupiWebhookDeliveryRecord): void;
  updateOrderPaymentState(
    orderId: string,
    patch: {
      paymentId: string;
      paymentStatus: PaymentOrderSyncStatus;
      paymentRef?: string;
      awardCustomerPoints?: boolean;
    }
  ): void;
}
