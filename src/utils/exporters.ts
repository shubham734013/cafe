import ExcelJS from 'exceljs';
import type {
  CafeOrder,
  CustomerProfile,
  InventoryIngredient,
  PointLedgerEntry,
} from '../types/cafe';

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FF472A00' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFC174' },
  };
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 24;
}

export async function buildOrdersExcelBuffer(orders: CafeOrder[]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Seth Sawariya CafeOS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Orders');
  sheet.columns = [
    { header: 'Order ID', key: 'id', width: 14 },
    { header: 'KOT #', key: 'kot', width: 10 },
    { header: 'Channel', key: 'channel', width: 12 },
    { header: 'Table / Location', key: 'location', width: 16 },
    { header: 'Items Ordered', key: 'items', width: 42 },
    { header: 'KOT Status', key: 'status', width: 12 },
    { header: 'Payment Mode', key: 'paymentMode', width: 14 },
    { header: 'Payment Status', key: 'paymentStatus', width: 16 },
    { header: 'Subtotal (INR)', key: 'subtotal', width: 15 },
    { header: 'Discount (INR)', key: 'discount', width: 15 },
    { header: 'Tax (INR)', key: 'tax', width: 13 },
    { header: 'Total (INR)', key: 'total', width: 15 },
    { header: 'Refund (INR)', key: 'refund', width: 14 },
    { header: 'Refund Reason', key: 'refundReason', width: 22 },
    { header: 'Time', key: 'time', width: 14 },
  ];

  styleHeaderRow(sheet.getRow(1));

  for (const order of orders) {
    sheet.addRow({
      id: order.id,
      kot: order.kotNumber,
      channel: order.serviceMode.toUpperCase(),
      location:
        order.serviceMode === 'dine-in'
          ? `Table ${order.tableNumber || 'T1'}`
          : order.deliveryPartner || 'Takeaway',
      items: order.items.map((i) => `${i.quantity}x ${i.name}`).join('; '),
      status: order.status.toUpperCase(),
      paymentMode: (order.paymentMode || 'cash').toUpperCase(),
      paymentStatus: (order.paymentStatus || 'unpaid').toUpperCase(),
      subtotal: order.subtotal,
      discount: order.discount,
      tax: order.tax,
      total: order.total,
      refund: order.refundAmount || 0,
      refundReason: order.refundReason || '-',
      time: order.createdAtLabel,
    });
  }

  // Format currency columns only (Subtotal, Discount, Tax, Total, Refund)
  ['I', 'J', 'K', 'L', 'M'].forEach((col) => {
    sheet.getColumn(col).numFmt = '₹#,##0.00';
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function buildCustomersExcelBuffer(customers: CustomerProfile[]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Seth Sawariya CafeOS CRM';
  const sheet = workbook.addWorksheet('Customers');
  sheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Segment', key: 'segment', width: 12 },
    { header: 'Visits', key: 'visits', width: 10 },
    { header: 'Total Spent (INR)', key: 'totalSpent', width: 18 },
    { header: 'Avg Ticket (INR)', key: 'avgTicket', width: 18 },
    { header: 'Favorites', key: 'favorites', width: 28 },
    { header: 'Last Visit', key: 'lastVisit', width: 18 },
  ];
  styleHeaderRow(sheet.getRow(1));

  for (const c of customers) {
    sheet.addRow({
      name: c.name,
      phone: `+91 ${c.phone}`,
      segment: c.segment.toUpperCase(),
      visits: c.visits,
      totalSpent: c.totalSpent,
      avgTicket: c.avgTicket,
      favorites: c.favorites,
      lastVisit: c.lastVisit,
    });
  }
  sheet.getColumn('E').numFmt = '₹#,##0';
  sheet.getColumn('F').numFmt = '₹#,##0';

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function buildInventoryExcelBuffer(items: InventoryIngredient[]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Seth Sawariya CafeOS Inventory';
  const sheet = workbook.addWorksheet('Inventory');
  sheet.columns = [
    { header: 'Ingredient', key: 'name', width: 24 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Min Threshold', key: 'minThreshold', width: 15 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Supplier', key: 'supplier', width: 24 },
    { header: 'Unit Cost (INR)', key: 'unitCost', width: 16 },
  ];
  styleHeaderRow(sheet.getRow(1));

  for (const item of items) {
    sheet.addRow({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      minThreshold: item.minThreshold,
      status: item.status,
      supplier: item.supplier,
      unitCost: item.unitCost,
    });
  }
  sheet.getColumn('G').numFmt = '₹#,##0';

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export async function buildLoyaltyLedgerExcelBuffer(ledger: PointLedgerEntry[]): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Seth Sawariya CafeOS Loyalty';
  const sheet = workbook.addWorksheet('Point Ledger');
  sheet.columns = [
    { header: 'Customer', key: 'customerName', width: 24 },
    { header: 'Context', key: 'context', width: 32 },
    { header: 'Points Delta', key: 'pointsDelta', width: 14 },
    { header: 'Note', key: 'note', width: 28 },
  ];
  styleHeaderRow(sheet.getRow(1));

  for (const entry of ledger) {
    sheet.addRow(entry);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
