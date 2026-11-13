import { DEMO_PLACEHOLDER_VPA, buildNpciUpiUri, isValidUpiVpa } from '../payments/upiUri';

export interface UpiUriParams {
  vpa?: string;
  payeeName: string;
  amountInr: number;
  transactionRef: string;
  note?: string;
}

export function buildUpiPaymentUri({
  vpa,
  payeeName,
  amountInr,
  transactionRef,
  note,
}: UpiUriParams): string {
  const effectiveVpa = vpa && isValidUpiVpa(vpa) ? vpa.trim() : DEMO_PLACEHOLDER_VPA;
  return buildNpciUpiUri({
    payeeVpa: effectiveVpa,
    payeeName,
    amountInr: Math.max(0, Number(amountInr.toFixed(2))),
    transactionRef,
    note: note || `CafeOS Bill ${transactionRef}`,
  });
}

export function buildTableSeatOrderPath(tableId: string): string {
  const cleanTable = tableId.trim().toUpperCase();
  const params = new URLSearchParams({ table: cleanTable });
  return `/?${params.toString()}`;
}

export function buildTableSeatOrderUrl(origin: string, tableId: string): string {
  const cleanOrigin = origin.replace(/\/$/, '');
  return `${cleanOrigin}${buildTableSeatOrderPath(tableId)}`;
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
