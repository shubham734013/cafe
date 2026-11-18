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
