export interface UpiUriParams {
  vpa?: string;
  payeeName: string;
  amountInr: number;
  transactionRef: string;
  note?: string;
}

export function buildUpiPaymentUri({
  vpa = 'sethsawariya@upi',
  payeeName,
  amountInr,
  transactionRef,
  note,
}: UpiUriParams): string {
  const safeAmount = Math.max(0, Number(amountInr.toFixed(2)));
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    tr: transactionRef,
    tn: note || `CafeOS Bill ${transactionRef}`,
    am: safeAmount.toFixed(2),
    cu: 'INR',
  });
  return `upi://pay?${params.toString()}`;
}

export function buildTableQrUrl(origin: string, tableId: string): string {
  const cleanOrigin = origin.replace(/\/$/, '');
  const params = new URLSearchParams({
    autostart: '1',
    screen: 'menu',
    table: tableId,
  });
  return `${cleanOrigin}/?${params.toString()}`;
}
