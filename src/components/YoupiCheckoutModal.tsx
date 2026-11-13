import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchYoupiPaymentStatusApi } from '../hooks/useCafeApi';
import { derivePaymentExpiryState } from '../payments/sessionExpiry';
import type { YoupiPaymentRecord } from '../payments/types';
import {
  DEMO_PLACEHOLDER_VPA,
  type StaticAppQrResult,
  UPI_APP_OPTIONS,
  type UpiAppId,
  buildAndroidUpiIntentUri,
  buildNpciUpiUri,
  buildUpiAppIntentUri,
  generateStaticAppQrCodeUrl,
  generateUpiQrDataUrl,
  getOneTapUpiUri,
  getUpiAppLabel,
  getUpiAppOption,
  isDemoPlaceholderVpa,
  isMobileDevice,
  isValidUpiVpa,
} from '../payments/upiUri';
import { deriveYoupiCheckoutPhase } from '../state/cafeStateMachines';
import { UpiAppIcon } from './UpiAppIcon';

interface YoupiCheckoutModalProps {
  open: boolean;
  payment: YoupiPaymentRecord | null;
  gatewayMode?: 'youpi-live' | 'youpi-sandbox-fallback';
  autoLaunchOneTap?: boolean;
  isSubmitting?: boolean;
  onPaymentUpdate: (next: YoupiPaymentRecord) => void;
  onMarkSubmitted: (paymentId: string) => Promise<void>;
  onCancelSession: (paymentId: string) => Promise<void>;
  onRetrySession: () => Promise<void>;
  onSimulateOutcome?: (
    paymentId: string,
    outcome: 'OBSERVED_SUCCESS' | 'RECONCILED' | 'MANUAL_REVIEW' | 'FAILED' | 'EXPIRED'
  ) => Promise<void>;
  onOpenPaymentSettings?: () => void;
  onClose: () => void;
  onContinueToTracking?: () => void;
  continueLabel?: string;
}

export const YoupiCheckoutModal: React.FC<YoupiCheckoutModalProps> = ({
  open,
  payment,
  gatewayMode = 'youpi-sandbox-fallback',
  autoLaunchOneTap = false,
  isSubmitting = false,
  onPaymentUpdate,
  onMarkSubmitted,
  onCancelSession,
  onRetrySession,
  onSimulateOutcome,
  onOpenPaymentSettings,
  onClose,
  onContinueToTracking,
  continueLabel = 'View Live Order Status',
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrMode, setQrMode] = useState<'dynamic' | 'static'>('dynamic');
  const [staticAppQr, setStaticAppQr] = useState<StaticAppQrResult | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [copiedVpa, setCopiedVpa] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<UpiAppId>(payment?.preferredApp ?? 'any');
  const [prevPaymentId, setPrevPaymentId] = useState<string | undefined>(payment?.id);
  const launchedSessionRef = useRef<string | null>(null);
  const notifiedExpiryKeysRef = useRef<Set<string>>(new Set());
  const onPaymentUpdateRef = useRef(onPaymentUpdate);
  useEffect(() => {
    onPaymentUpdateRef.current = onPaymentUpdate;
  }, [onPaymentUpdate]);

  if (payment?.id !== prevPaymentId) {
    setPrevPaymentId(payment?.id);
    setSelectedApp(payment?.preferredApp ?? 'any');
    setQrMode('dynamic');
  }

  const effectiveVpa = payment?.payeeVpa?.trim() || DEMO_PLACEHOLDER_VPA;
  const usingDemoVpa = isDemoPlaceholderVpa(effectiveVpa);

  const qrValue = useMemo(() => {
    if (!payment) return '';
    if (payment.upiUri && !payment.upiUri.includes('%40') && !payment.upiUri.includes('+')) {
      return payment.upiUri;
    }
    if (effectiveVpa && isValidUpiVpa(effectiveVpa)) {
      return buildNpciUpiUri({
        payeeVpa: effectiveVpa,
        payeeName: 'Seth Sawariya Cafe',
        amountInr: payment.amountInr,
        transactionRef: payment.gatewayPaymentId,
        note: `Order ${payment.orderId}`,
      });
    }
    return payment.upiUri || payment.checkoutUrl;
  }, [effectiveVpa, payment]);

  useEffect(() => {
    if (!open || !qrValue) return;
    let cancelled = false;
    generateUpiQrDataUrl(qrValue, { width: 240, margin: 2 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [open, qrValue]);

  useEffect(() => {
    if (!open || !payment || !isValidUpiVpa(effectiveVpa)) {
      setStaticAppQr(null);
      return;
    }
    let cancelled = false;
    generateStaticAppQrCodeUrl({
      payeeVpa: effectiveVpa,
      payeeName: 'Seth Sawariya Cafe',
      amountInr: payment.amountInr,
      note: `Order ${payment.orderId}`,
      appId: selectedApp,
      width: 240,
      margin: 2,
    })
      .then((res) => {
        if (!cancelled) setStaticAppQr(res);
      })
      .catch(() => {
        if (!cancelled) setStaticAppQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveVpa, open, payment, selectedApp]);

  // Countdown tick
  useEffect(() => {
    if (!open) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, payment?.id, payment?.status]);

  // Poll YouPI-PG status while awaiting payer or bank alert match
  const shouldPoll =
    open &&
    Boolean(payment) &&
    ['initiated', 'active', 'queued', 'processing', 'observed'].includes(payment!.status);

  useEffect(() => {
    if (!shouldPoll || !payment?.id) return;
    let active = true;
    const paymentId = payment.id;
    const interval = setInterval(() => {
      void fetchYoupiPaymentStatusApi(paymentId, true)
        .then((fresh) => {
          if (active) onPaymentUpdateRef.current(fresh);
        })
        .catch(() => {
          // Non-fatal: retry on next poll tick
        });
    }, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [shouldPoll, payment?.id]);

  useEffect(() => {
    setModalError(null);
  }, [open, payment?.id, payment?.status]);

  const androidFallbackUrl = payment?.checkoutUrl?.startsWith('http')
    ? payment.checkoutUrl
    : undefined;

  const selectedOneTapUri = useMemo(() => {
    if (!qrValue) return '';
    return getOneTapUpiUri(qrValue, selectedApp, undefined, androidFallbackUrl);
  }, [androidFallbackUrl, qrValue, selectedApp]);

  useEffect(() => {
    if (
      !open ||
      !autoLaunchOneTap ||
      !payment ||
      !qrValue.startsWith('upi://') ||
      !isMobileDevice()
    ) {
      return;
    }
    const isReadyStatus =
      payment.status === 'initiated' ||
      payment.status === 'active' ||
      payment.status === 'queued';
    if (!isReadyStatus || launchedSessionRef.current === payment.id) {
      return;
    }
    launchedSessionRef.current = payment.id;
    const targetUri = getOneTapUpiUri(qrValue, payment.preferredApp ?? selectedApp);
    if (typeof document !== 'undefined' && targetUri) {
      const anchor = document.createElement('a');
      anchor.href = targetUri;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  }, [open, autoLaunchOneTap, payment, qrValue, selectedApp]);

  const runAction = async (fn: () => Promise<void>) => {
    setModalError(null);
    try {
      await fn();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to complete UPI action.');
    }
  };

  const handleCopyVpa = async () => {
    if (!effectiveVpa) return;
    try {
      await navigator.clipboard.writeText(effectiveVpa);
      setCopiedVpa(true);
      setTimeout(() => setCopiedVpa(false), 1800);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const handleCopyUpiLink = async () => {
    const linkToCopy =
      qrMode === 'static' && staticAppQr?.qrPayloadUri ? staticAppQr.qrPayloadUri : qrValue;
    if (!linkToCopy) return;
    try {
      await navigator.clipboard.writeText(linkToCopy);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const phase = payment ? deriveYoupiCheckoutPhase(payment) : 'awaiting_payment';
  const expiryState = useMemo(
    () =>
      derivePaymentExpiryState({
        phase,
        expiresAt: payment?.expiresAt,
        processingExpiresAt: payment?.processingExpiresAt,
        createdAt: payment?.createdAt,
        nowMs,
        orderId: payment?.orderId,
        appLabel: getUpiAppLabel(selectedApp),
      }),
    [
      nowMs,
      payment?.createdAt,
      payment?.expiresAt,
      payment?.orderId,
      payment?.processingExpiresAt,
      phase,
      selectedApp,
    ]
  );

  // Trigger a one-time warning / critical / expired toast as session nears expiration
  useEffect(() => {
    if (!open || !payment || !expiryState.isActiveWindow) return;
    if (expiryState.urgency === 'normal') return;

    const dedupeKey = `${payment.id}:${phase}:${expiryState.urgency}`;
    if (notifiedExpiryKeysRef.current.has(dedupeKey)) return;
    notifiedExpiryKeysRef.current.add(dedupeKey);

    if (expiryState.urgency === 'expired') {
      toast.error(expiryState.warningTitle, {
        id: `youpi-expiry-${payment.id}`,
        description: expiryState.warningMessage,
        duration: 8000,
        style: {
          background: '#3c1816',
          border: '1px solid rgba(248, 113, 113, 0.55)',
          color: '#fee2e2',
        },
      });
      void fetchYoupiPaymentStatusApi(payment.id, true)
        .then((fresh) => onPaymentUpdateRef.current(fresh))
        .catch(() => {
          // Non-fatal: regular polling / manual retry handles recovery
        });
      return;
    }

    toast.warning(expiryState.warningTitle, {
      id: `youpi-expiry-${payment.id}`,
      description: expiryState.warningMessage,
      duration: expiryState.urgency === 'critical' ? 8000 : 7000,
      style:
        expiryState.urgency === 'critical'
          ? {
              background: '#3c1816',
              border: '1px solid rgba(248, 113, 113, 0.55)',
              color: '#fee2e2',
            }
          : {
              background: '#372611',
              border: '1px solid rgba(251, 191, 36, 0.55)',
              color: '#fef3c7',
            },
    });
  }, [
    expiryState.isActiveWindow,
    expiryState.urgency,
    expiryState.warningMessage,
    expiryState.warningTitle,
    open,
    payment,
    phase,
  ]);

  if (!payment) return null;

  const isInteractivePay = phase === 'awaiting_payment' || phase === 'verifying_observer';

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5 max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
              <UpiAppIcon appId={selectedApp} className="w-7 h-7" />
              <span>YouPI-PG UPI Checkout</span>
            </DialogTitle>
            <span className="px-2 py-0.5 rounded bg-surface-container-highest text-[10px] font-mono text-secondary uppercase">
              {gatewayMode === 'youpi-live' ? 'Live Engine' : 'Sandbox'}
            </span>
          </div>
          <DialogDescription className="text-xs text-on-surface-variant flex items-center flex-wrap gap-1.5">
            <span>
              Order #{payment.orderId} · Server-verified payable{' '}
              <span className="text-primary font-bold">₹{payment.amountInr}</span> (INR)
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold text-[10px]">
              {getUpiAppLabel(selectedApp)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {modalError && (
          <div className="rounded-xl bg-error-container/25 border border-error/40 px-3 py-2 text-xs text-error flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">error</span>
            <span>{modalError}</span>
          </div>
        )}

        {usingDemoVpa && isInteractivePay && (
          <div className="rounded-xl bg-primary-container/15 border border-primary/35 p-3 text-xs text-on-surface flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">
                warning
              </span>
              <div>
                <p className="font-bold text-primary">Demo VPA Active ({effectiveVpa})</p>
                <p className="text-on-surface-variant mt-0.5">
                  Real UPI apps (GPay/PhonePe/Paytm) will show &ldquo;Invalid UPI ID&rdquo; until you save your real UPI ID in Settings → Payments.
                </p>
              </div>
            </div>
            {onOpenPaymentSettings && (
              <button
                type="button"
                onClick={onOpenPaymentSettings}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-primary text-on-primary text-[11px] font-bold cursor-pointer"
              >
                Set UPI ID
              </button>
            )}
          </div>
        )}

        {/* Queue Position Banner */}
        {payment.status === 'queued' && (
          <div className="rounded-xl bg-primary-container/15 border border-primary/30 p-3 text-xs text-on-surface flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
              hourglass_top
            </span>
            <div>
              <p className="font-bold text-primary">
                Waiting in YouPI-PG Queue (Slot #{Math.max(1, payment.queuePosition)})
              </p>
              <p className="text-on-surface-variant mt-0.5">
                YouPI-PG processes one active UPI payment per amount slot. Your QR activates automatically once the current payer completes or cancels.
              </p>
            </div>
          </div>
        )}

        {/* Active / Initiated / Queued QR View */}
        {isInteractivePay && (
          <div className="flex flex-col items-center gap-3 py-1">
            <div
              data-testid="payment-expiry-timer"
              data-urgency={expiryState.urgency}
              className={`w-full rounded-xl px-3 py-2.5 text-xs border transition-colors ${
                expiryState.urgency === 'critical' || expiryState.urgency === 'expired'
                  ? 'bg-error-container/20 border-error/45'
                  : expiryState.urgency === 'warning'
                    ? 'bg-amber-500/10 border-amber-400/45'
                    : 'bg-surface-container-low border-outline-variant/15'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-on-surface-variant flex items-center gap-1.5 font-medium">
                  <span
                    className={`material-symbols-outlined text-[15px] ${
                      expiryState.urgency === 'critical' || expiryState.urgency === 'expired'
                        ? 'text-error animate-pulse'
                        : expiryState.urgency === 'warning'
                          ? 'text-amber-300'
                          : 'text-primary'
                    }`}
                  >
                    {expiryState.urgency === 'expired' ? 'timer_off' : 'timer'}
                  </span>
                  <span>
                    {phase === 'verifying_observer' ? 'Verifying Bank Alert' : 'Payment Window'}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  {expiryState.shouldShowWarning && (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        expiryState.urgency === 'critical' || expiryState.urgency === 'expired'
                          ? 'text-error'
                          : 'text-amber-300'
                      }`}
                    >
                      {expiryState.urgency === 'expired'
                        ? 'Timed Out'
                        : expiryState.urgency === 'critical'
                          ? 'Final Seconds'
                          : 'Expiring Soon'}
                    </span>
                  )}
                  <span
                    data-testid="payment-expiry-countdown"
                    className={`font-mono font-bold tabular-nums text-sm ${
                      expiryState.urgency === 'critical' || expiryState.urgency === 'expired'
                        ? 'text-error'
                        : expiryState.urgency === 'warning'
                          ? 'text-amber-300'
                          : 'text-primary'
                    }`}
                  >
                    {expiryState.formattedCountdown}
                  </span>
                </div>
              </div>
              <div
                role="progressbar"
                aria-label="Payment session time remaining"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={expiryState.progressPercent}
                className="mt-2 h-1.5 w-full rounded-full bg-surface-container-lowest overflow-hidden"
              >
                <div
                  style={{ width: `${expiryState.progressPercent}%` }}
                  className={`h-full rounded-full transition-all duration-700 ${
                    expiryState.urgency === 'critical' || expiryState.urgency === 'expired'
                      ? 'bg-error'
                      : expiryState.urgency === 'warning'
                        ? 'bg-amber-400'
                        : 'bg-primary'
                  }`}
                />
              </div>
            </div>

            {expiryState.shouldShowWarning && (
              <div
                role="alert"
                data-testid="payment-expiry-warning-banner"
                className={`w-full rounded-xl px-3 py-2.5 text-xs border flex items-start justify-between gap-2.5 ${
                  expiryState.urgency === 'critical' || expiryState.urgency === 'expired'
                    ? 'bg-error-container/25 border-error/45 text-on-surface'
                    : 'bg-amber-500/12 border-amber-400/40 text-on-surface'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <span
                    className={`material-symbols-outlined text-[18px] shrink-0 mt-0.5 ${
                      expiryState.urgency === 'critical' || expiryState.urgency === 'expired'
                        ? 'text-error'
                        : 'text-amber-300'
                    }`}
                  >
                    {expiryState.urgency === 'expired' ? 'running_with_errors' : 'schedule'}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`font-bold ${
                        expiryState.urgency === 'critical' || expiryState.urgency === 'expired'
                          ? 'text-error'
                          : 'text-amber-300'
                      }`}
                    >
                      {expiryState.warningTitle}
                    </p>
                    <p className="text-on-surface-variant mt-0.5 leading-snug">
                      {expiryState.warningMessage}
                    </p>
                  </div>
                </div>
                {expiryState.urgency === 'expired' ? (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void runAction(onRetrySession)}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg bg-primary text-on-primary text-[11px] font-bold cursor-pointer disabled:opacity-50"
                  >
                    New Attempt
                  </button>
                ) : phase === 'awaiting_payment' ? (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void runAction(() => onMarkSubmitted(payment.id))}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-primary text-[11px] font-bold cursor-pointer disabled:opacity-50"
                  >
                    I Have Paid
                  </button>
                ) : null}
              </div>
            )}

            {phase === 'verifying_observer' ? (
              <div className="w-full rounded-2xl bg-surface-container-low p-6 flex flex-col items-center text-center gap-2.5">
                <span className="material-symbols-outlined text-4xl text-primary animate-pulse">
                  mark_email_read
                </span>
                <p className="text-sm font-bold text-on-surface">
                  Scanning Bank SMS &amp; Gmail Alerts...
                </p>
                <p className="text-xs text-on-surface-variant">
                  Matching ₹{payment.amountInr} credit on YouPI-PG observer. Do not close or pay twice.
                </p>
              </div>
            ) : (
              <>
                <div className="w-full grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-container-low border border-outline-variant/15">
                  <button
                    type="button"
                    aria-pressed={qrMode === 'dynamic'}
                    data-testid="qr-mode-dynamic"
                    onClick={() => setQrMode('dynamic')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      qrMode === 'dynamic'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Dynamic Order QR
                  </button>
                  <button
                    type="button"
                    aria-pressed={qrMode === 'static'}
                    data-testid="qr-mode-static"
                    onClick={() => setQrMode('static')}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      qrMode === 'static'
                        ? 'bg-primary text-on-primary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    Static Scan QR (Fallback)
                  </button>
                </div>

                {qrMode === 'static' && staticAppQr?.qrCodeUrl ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="p-3 rounded-2xl bg-[#fffaf3] shadow-lg border border-primary/25">
                      <img
                        src={staticAppQr.qrCodeUrl}
                        data-testid="static-upi-qr-image"
                        alt={`Static ${staticAppQr.label} Scan QR for Order ${payment.orderId}`}
                        className="w-48 h-48 block rounded-lg"
                      />
                    </div>
                    <span
                      data-testid="static-upi-qr-caption"
                      className="text-[10px] text-primary font-semibold text-center"
                    >
                      Static {staticAppQr.label} QR · Scan directly if deep-link is unavailable
                    </span>
                  </div>
                ) : qrDataUrl ? (
                  <div className="p-3 rounded-2xl bg-[#fffaf3] shadow-lg">
                    <img
                      src={qrDataUrl}
                      alt={`UPI QR for Order ${payment.orderId}`}
                      className="w-48 h-48 block rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="w-52 h-52 rounded-2xl bg-surface-container-low" />
                )}

                <div className="w-full rounded-xl bg-surface-container-lowest px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-outline block">
                      Pay Exact Amount to VPA
                    </span>
                    <span className="font-mono font-semibold text-on-surface truncate block">
                      {effectiveVpa}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCopyVpa()}
                      className="px-2.5 py-1 rounded-lg bg-surface-container-high text-primary text-[11px] font-semibold cursor-pointer"
                    >
                      {copiedVpa ? 'Copied' : 'Copy VPA'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopyUpiLink()}
                      className="px-2.5 py-1 rounded-lg bg-surface-container-high text-secondary text-[11px] font-semibold cursor-pointer"
                    >
                      {copiedLink ? 'Copied' : 'Copy Link'}
                    </button>
                  </div>
                </div>

                {qrValue.startsWith('upi://') && (
                  <div className="w-full space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-outline font-semibold">
                        One-Tap Pay via UPI App
                      </span>
                      <span className="text-[10px] font-mono text-on-surface-variant">
                        {getUpiAppOption(selectedApp).schemePrefix}
                      </span>
                    </div>
                    {autoLaunchOneTap && (
                      <div
                        data-testid="modal-onetap-banner"
                        className="rounded-lg bg-primary/10 border border-primary/25 px-2.5 py-1.5 text-[10px] text-primary flex items-center justify-between gap-2"
                      >
                        <span className="font-semibold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">bolt</span>
                          One-Tap {getUpiAppLabel(selectedApp)} link generated
                        </span>
                        <span className="font-mono text-[9px] truncate max-w-[160px] text-on-surface-variant">
                          {selectedOneTapUri}
                        </span>
                      </div>
                    )}
                    <div className="flex flex-col divide-y divide-outline-variant/15 rounded-xl overflow-hidden border border-outline-variant/20 bg-surface-container-low">
                      {UPI_APP_OPTIONS.map((app) => {
                        const isPreferred = selectedApp === app.id;
                        const intentHref = getOneTapUpiUri(
                          qrValue,
                          app.id,
                          undefined,
                          androidFallbackUrl
                        );
                        return (
                          <a
                            key={app.id}
                            href={intentHref}
                            data-testid={`modal-upi-app-${app.id}`}
                            data-scheme-uri={buildUpiAppIntentUri(qrValue, app.id)}
                            data-android-intent={buildAndroidUpiIntentUri(
                              qrValue,
                              app.id,
                              androidFallbackUrl
                            )}
                            onClick={() => setSelectedApp(app.id)}
                            className={`px-3 py-2 flex items-center gap-2.5 text-left transition-all ${
                              isPreferred
                                ? 'bg-primary-container/15'
                                : 'hover:bg-surface-container-high/70'
                            }`}
                          >
                            <UpiAppIcon appId={app.id} className="w-8 h-8" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-on-surface shrink-0">
                                  {app.label}
                                </span>
                                {app.androidPackage && (
                                  <span className="text-[9px] font-mono text-outline min-w-0 truncate hidden sm:inline">
                                    · {app.androidPackage}
                                  </span>
                                )}
                              </div>
                              <span className="block text-[10px] text-on-surface-variant truncate">
                                {app.tagline}
                              </span>
                            </div>
                            <span
                              className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold ${
                                isPreferred
                                  ? 'bg-primary text-on-primary'
                                  : 'bg-surface-container-high text-primary'
                              }`}
                            >
                              Pay ₹{payment.amountInr}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="w-full flex flex-wrap gap-2">
                  {qrValue.startsWith('upi://') && (
                    <a
                      href={selectedOneTapUri}
                      data-testid="modal-open-selected-upi-app"
                      data-scheme-uri={buildUpiAppIntentUri(qrValue, selectedApp)}
                      data-android-intent={buildAndroidUpiIntentUri(
                        qrValue,
                        selectedApp,
                        androidFallbackUrl
                      )}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-semibold text-center flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary">
                        open_in_new
                      </span>
                      <span>Launch {getUpiAppLabel(selectedApp)}</span>
                    </a>
                  )}
                  {payment.checkoutUrl.startsWith('http') && (
                    <a
                      href={payment.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 py-2.5 px-3 rounded-xl bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-semibold text-center flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">captive_portal</span>
                      <span>YouPI Portal</span>
                    </a>
                  )}
                </div>
              </>
            )}

            <div className="w-full flex gap-2 pt-1">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void runAction(() => onCancelSession(payment.id))}
                className="px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface-variant text-xs font-semibold cursor-pointer disabled:opacity-40"
              >
                Cancel &amp; Free Slot
              </button>
              {phase !== 'verifying_observer' && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void runAction(() => onMarkSubmitted(payment.id))}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">task_alt</span>
                  <span>I Have Paid — Verify Now</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* OBSERVED_SUCCESS State (Bank Alert Matched, Not Yet Bank Reconciled) */}
        {phase === 'observed_pending_bank' && (
          <div className="rounded-2xl bg-surface-container-low p-4 space-y-3 border border-primary/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">notifications_active</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-primary">
                  Bank Alert Matched — Awaiting Bank Verification
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  YouPI-PG observed the credit alert ({payment.verificationSources.join(' + ') || 'Observer'}, Level {payment.verificationLevel}). Final settlement completes when bank statement CSV reconciles or staff confirms the UTR.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-outline">Settlement State</span>
                <span className="font-mono font-bold text-primary">{payment.settlementState}</span>
              </div>
              {payment.utr && (
                <div className="flex justify-between">
                  <span className="text-outline">UPI Reference (UTR)</span>
                  <span className="font-mono font-bold text-on-surface">{payment.utr}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onContinueToTracking ?? onClose}
                className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer"
              >
                {continueLabel}
              </button>
            </div>
          </div>
        )}

        {/* SUCCEEDED / RECONCILED State (Swiggy-Style CSS Celebration Animation) */}
        {phase === 'succeeded' && (
          <div
            data-testid="payment-success-animation"
            role="status"
            aria-live="polite"
            className="rounded-2xl bg-tertiary-container/10 p-5 space-y-4 border border-tertiary/35 text-center overflow-hidden"
          >
            <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
              {/* Concentric expanding ripple rings */}
              <span
                aria-hidden="true"
                className="absolute inset-2 rounded-full border-2 border-tertiary/55 animate-upi-pulse-ring"
              />
              <span
                aria-hidden="true"
                className="absolute inset-2 rounded-full border border-tertiary/40 animate-upi-pulse-ring-delayed"
              />

              {/* Celebratory radial spark particles */}
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <span
                  key={angle}
                  aria-hidden="true"
                  style={{ ['--spark-angle' as string]: `${angle}deg` }}
                  className="absolute w-1.5 h-1.5 rounded-full bg-tertiary animate-upi-spark"
                />
              ))}

              {/* Animated emerald checkmark circle */}
              <div className="relative z-10 w-16 h-16 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center shadow-[0_8px_28px_rgba(81,231,123,0.35)] animate-upi-circle-pop">
                <svg
                  viewBox="0 0 32 32"
                  className="w-9 h-9"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8 16.5L13.5 22L24.5 10.5"
                    stroke="currentColor"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="animate-upi-check-draw"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-1 animate-upi-fade-up">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-tertiary/15 text-tertiary text-[10px] font-bold uppercase tracking-wider">
                <span className="material-symbols-outlined text-[13px]">verified</span>
                <span>{getUpiAppLabel(selectedApp)} Verified</span>
              </div>
              <p className="text-2xl font-extrabold text-on-surface tabular-nums pt-0.5">
                ₹{payment.amountInr} Paid
              </p>
              <p className="text-sm font-bold text-tertiary">
                Payment Successful &amp; Settled
              </p>
              <p className="text-xs text-on-surface-variant">
                Order #{payment.orderId} confirmed with the kitchen. Loyalty points awarded!
              </p>
            </div>

            {payment.utr && (
              <div className="rounded-xl bg-surface-container-lowest px-3 py-2.5 flex justify-between items-center text-xs animate-upi-fade-up border border-outline-variant/20">
                <span className="text-outline">Verified UTR</span>
                <span className="font-mono font-bold text-on-surface">{payment.utr}</span>
              </div>
            )}

            <button
              type="button"
              data-testid="payment-success-continue"
              onClick={onContinueToTracking ?? onClose}
              className="w-full py-3 rounded-xl bg-tertiary hover:brightness-105 active:scale-[0.99] text-on-tertiary text-xs font-extrabold tracking-wide shadow-md transition-all cursor-pointer animate-upi-fade-up"
            >
              Done — Track Kitchen Order
            </button>
          </div>
        )}

        {/* MANUAL_REVIEW State */}
        {phase === 'manual_review' && (
          <div className="rounded-2xl bg-error-container/20 p-4 space-y-3 border border-error/30">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-error text-[24px] shrink-0">
                gpp_maybe
              </span>
              <div>
                <p className="text-sm font-bold text-error">Held for Staff Bank Verification</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {payment.manualReviewReason ||
                    'YouPI-PG flagged this payment for manual verification before fulfillment.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onContinueToTracking ?? onClose}
              className="w-full py-2.5 rounded-xl bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer"
            >
              Close &amp; Ask Counter Staff to Verify
            </button>
          </div>
        )}

        {/* REFUNDED State */}
        {phase === 'refunded' && (
          <div className="rounded-2xl bg-surface-container-low p-4 space-y-3 border border-outline-variant/40">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-[24px] shrink-0">
                undo
              </span>
              <div>
                <p className="text-sm font-bold text-on-surface">UPI Payment Refunded</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {payment.refundReason || `Full refund of ₹${payment.amountInr} recorded for Order #${payment.orderId}.`}
                </p>
              </div>
            </div>
            {(payment.refundRef || payment.utr) && (
              <div className="rounded-xl bg-surface-container-lowest p-3 text-xs space-y-1">
                {payment.refundRef && (
                  <div className="flex justify-between">
                    <span className="text-outline">Refund Ref</span>
                    <span className="font-mono font-bold text-on-surface">{payment.refundRef}</span>
                  </div>
                )}
                {payment.utr && (
                  <div className="flex justify-between">
                    <span className="text-outline">Original UTR</span>
                    <span className="font-mono text-on-surface-variant">{payment.utr}</span>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-surface-container-high text-on-surface text-xs font-semibold cursor-pointer"
            >
              Close
            </button>
          </div>
        )}

        {/* FAILED / EXPIRED / CANCELLED State */}
        {phase === 'retryable_terminal' && (
          <div className="rounded-2xl bg-surface-container-low p-4 space-y-3 border border-outline-variant/40">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-error text-[24px] shrink-0">
                {payment.status === 'expired' ? 'timer_off' : 'cancel'}
              </span>
              <div>
                <p className="text-sm font-bold text-on-surface capitalize">
                  UPI Payment {payment.status}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {payment.failureMessage || 'Payment did not complete. Your order is saved — retry below.'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-surface-container-high text-on-surface-variant text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void runAction(onRetrySession)}
                className="flex-1 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Start Fresh UPI Attempt
              </button>
            </div>
          </div>
        )}

        {/* Local Sandbox Simulator (Dev Only when live YouPI-PG is not configured) */}
        {gatewayMode === 'youpi-sandbox-fallback' &&
          onSimulateOutcome &&
          phase !== 'succeeded' &&
          phase !== 'refunded' &&
          phase !== 'retryable_terminal' && (
            <details
              data-testid="sandbox-test-controls"
              className="rounded-xl bg-surface-container-lowest p-3 text-xs border border-outline-variant/20"
            >
              <summary className="cursor-pointer font-semibold text-outline select-none">
                Sandbox Test Controls (No Live Android Observer Needed)
              </summary>
              <p className="text-[11px] text-on-surface-variant mt-1.5 mb-2">
                Sends a real signed HMAC-SHA256 webhook to <span className="font-mono">/api/webhooks/youpi</span>.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  data-testid="sandbox-sim-observed"
                  onClick={() => void runAction(() => onSimulateOutcome(payment.id, 'OBSERVED_SUCCESS'))}
                  className="py-1.5 px-2 rounded-lg bg-primary/15 text-primary font-semibold cursor-pointer"
                >
                  Observer Match
                </button>
                <button
                  type="button"
                  data-testid="sandbox-sim-reconciled"
                  onClick={() => void runAction(() => onSimulateOutcome(payment.id, 'RECONCILED'))}
                  className="py-1.5 px-2 rounded-lg bg-tertiary/15 text-tertiary font-semibold cursor-pointer"
                >
                  Bank Reconciled
                </button>
                <button
                  type="button"
                  onClick={() => void runAction(() => onSimulateOutcome(payment.id, 'FAILED'))}
                  className="py-1.5 px-2 rounded-lg bg-error/15 text-error font-semibold cursor-pointer"
                >
                  Simulate Failed
                </button>
                <button
                  type="button"
                  onClick={() => void runAction(() => onSimulateOutcome(payment.id, 'EXPIRED'))}
                  className="py-1.5 px-2 rounded-lg bg-surface-container-high text-on-surface-variant font-semibold cursor-pointer"
                >
                  Simulate Expired
                </button>
              </div>
            </details>
          )}
      </DialogContent>
    </Dialog>
  );
};
