import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import type { CafeOrder, CafeSettings, CafeTable } from '../types/cafe';

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1f1916',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#d97706',
    paddingBottom: 10,
    marginBottom: 14,
  },
  brand: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400e',
  },
  muted: {
    fontSize: 8.5,
    color: '#57534e',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 6,
    marginTop: 10,
    color: '#451a03',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e7e5e4',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    fontWeight: 'bold',
  },
  totalsBox: {
    marginTop: 14,
    padding: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 4,
  },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#d97706',
    fontSize: 12,
    fontWeight: 'bold',
  },
  footer: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 8.5,
    color: '#78716c',
  },
});

const OrderInvoicePdf: React.FC<{ order: CafeOrder; settings: CafeSettings }> = ({
  order,
  settings,
}) => {
  const cgst = Number((order.tax / 2).toFixed(2));
  const sgst = Number((order.tax - cgst).toFixed(2));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{settings.cafeName}</Text>
            <Text style={styles.muted}>{settings.subCategory}</Text>
            <Text style={styles.muted}>{settings.address}</Text>
            <Text style={styles.muted}>GSTIN: {settings.gstin}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold' }}>TAX INVOICE</Text>
            <Text style={styles.muted}>Invoice #: {order.id}</Text>
            <Text style={styles.muted}>KOT: {order.kotNumber}</Text>
            <Text style={styles.muted}>
              Mode: {order.serviceMode.toUpperCase()}
              {order.tableNumber ? ` (${order.tableNumber})` : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Order Line Items</Text>
        <View style={styles.headerRow}>
          <Text style={{ flex: 3 }}>Item</Text>
          <Text style={{ flex: 1, textAlign: 'right' }}>Qty</Text>
          <Text style={{ flex: 1, textAlign: 'right' }}>Rate (INR)</Text>
          <Text style={{ flex: 1, textAlign: 'right' }}>Amount (INR)</Text>
        </View>
        {order.items.map((item) => (
          <View key={item.menuItemId} style={styles.row}>
            <Text style={{ flex: 3 }}>
              {item.name} ({item.station})
            </Text>
            <Text style={{ flex: 1, textAlign: 'right' }}>{item.quantity}</Text>
            <Text style={{ flex: 1, textAlign: 'right' }}>Rs. {item.price}</Text>
            <Text style={{ flex: 1, textAlign: 'right' }}>
              Rs. {item.price * item.quantity}
            </Text>
          </View>
        ))}

        <View style={styles.totalsBox}>
          <View style={styles.row}>
            <Text>Subtotal</Text>
            <Text>Rs. {order.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text>Discount</Text>
            <Text>- Rs. {order.discount.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text>CGST (2.5%)</Text>
            <Text>Rs. {cgst.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text>SGST (2.5%)</Text>
            <Text>Rs. {sgst.toFixed(2)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text>Order Total</Text>
            <Text>Rs. {order.total.toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Thank you for visiting {settings.cafeName} • {settings.phone} • {settings.email}
        </Text>
      </Page>
    </Document>
  );
};

const SalesSummaryPdf: React.FC<{
  orders: CafeOrder[];
  settings: CafeSettings;
  timeframeLabel: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
}> = ({ orders, settings, timeframeLabel, totalRevenue, totalOrders, avgOrderValue }) => (
  <Document>
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>{settings.cafeName} — Sales Report</Text>
          <Text style={styles.muted}>Period: {timeframeLabel}</Text>
          <Text style={styles.muted}>GSTIN: {settings.gstin}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 11, fontWeight: 'bold' }}>EXECUTIVE SUMMARY</Text>
          <Text style={styles.muted}>Generated: {new Date().toLocaleDateString('en-IN')}</Text>
        </View>
      </View>

      <View style={styles.totalsBox}>
        <View style={styles.row}>
          <Text>Total Gross Sales</Text>
          <Text>Rs. {totalRevenue.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.row}>
          <Text>Completed &amp; Live Orders</Text>
          <Text>{totalOrders.toLocaleString('en-IN')}</Text>
        </View>
        <View style={styles.row}>
          <Text>Average Order Value</Text>
          <Text>Rs. {avgOrderValue.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Shift Orders ({orders.length})</Text>
      <View style={styles.headerRow}>
        <Text style={{ flex: 1.2 }}>Order #</Text>
        <Text style={{ flex: 1.2 }}>Mode</Text>
        <Text style={{ flex: 1.2 }}>Status</Text>
        <Text style={{ flex: 1, textAlign: 'right' }}>Total</Text>
      </View>
      {orders.slice(0, 20).map((order) => (
        <View key={order.id} style={styles.row}>
          <Text style={{ flex: 1.2 }}>{order.id}</Text>
          <Text style={{ flex: 1.2 }}>{order.serviceMode}</Text>
          <Text style={{ flex: 1.2 }}>{order.status.toUpperCase()}</Text>
          <Text style={{ flex: 1, textAlign: 'right' }}>Rs. {order.total}</Text>
        </View>
      ))}
      <Text style={styles.footer}>{settings.cafeName} • CafeOS Analytics Export</Text>
    </Page>
  </Document>
);

export async function generateOrderInvoicePdfBlob(
  order: CafeOrder,
  settings: CafeSettings
): Promise<Blob> {
  return pdf(<OrderInvoicePdf order={order} settings={settings} />).toBlob();
}

export async function generateSalesReportPdfBlob(args: {
  orders: CafeOrder[];
  settings: CafeSettings;
  timeframeLabel: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
}): Promise<Blob> {
  return pdf(<SalesSummaryPdf {...args} />).toBlob();
}

const tableQrStyles = StyleSheet.create({
  page: {
    padding: 28,
    fontFamily: 'Helvetica',
    backgroundColor: '#fffaf3',
    color: '#1f1916',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBox: {
    width: '100%',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#d97706',
    paddingBottom: 12,
  },
  cafeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#92400e',
  },
  cafeSub: {
    fontSize: 9,
    color: '#57534e',
    marginTop: 3,
  },
  tableBadge: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
  },
  tableCode: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f1916',
  },
  tableMeta: {
    fontSize: 9.5,
    color: '#451a03',
    marginTop: 2,
    fontWeight: 'bold',
  },
  ctaTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1f1916',
    marginTop: 14,
  },
  ctaSub: {
    fontSize: 9.5,
    color: '#57534e',
    marginTop: 3,
    textAlign: 'center',
  },
  qrFrame: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#d97706',
    alignItems: 'center',
  },
  qrImage: {
    width: 185,
    height: 185,
  },
  linkBox: {
    marginTop: 12,
    width: '100%',
    padding: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    alignItems: 'center',
  },
  linkPath: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#92400e',
  },
  linkFull: {
    fontSize: 8,
    color: '#57534e',
    marginTop: 3,
    textAlign: 'center',
  },
  footerBox: {
    width: '100%',
    borderTopWidth: 0.75,
    borderTopColor: '#e7e5e4',
    paddingTop: 10,
    alignItems: 'center',
  },
  footerSteps: {
    fontSize: 8.5,
    color: '#44403c',
    textAlign: 'center',
  },
});

const TableQrPdf: React.FC<{
  table: CafeTable;
  orderUrl: string;
  orderPath: string;
  qrDataUrl: string;
  settings: CafeSettings;
}> = ({ table, orderUrl, orderPath, qrDataUrl, settings }) => (
  <Document>
    <Page size="A5" style={tableQrStyles.page}>
      <View style={tableQrStyles.headerBox}>
        <Text style={tableQrStyles.cafeTitle}>{settings.cafeName}</Text>
        <Text style={tableQrStyles.cafeSub}>{settings.subCategory}</Text>
        <Text style={tableQrStyles.cafeSub}>{settings.address}</Text>
      </View>

      <View style={tableQrStyles.tableBadge}>
        <Text style={tableQrStyles.tableCode}>TABLE {table.id}</Text>
        <Text style={tableQrStyles.tableMeta}>
          {table.seats}-Seater • {table.zone} • {table.floor}
        </Text>
      </View>

      <Text style={tableQrStyles.ctaTitle}>Scan to Order from Your Seat</Text>
      <Text style={tableQrStyles.ctaSub}>
        Browse the live menu and customize your brew before placing an order.
      </Text>

      <View style={tableQrStyles.qrFrame}>
        <Image src={qrDataUrl} style={tableQrStyles.qrImage} />
      </View>

      <View style={tableQrStyles.linkBox}>
        <Text style={tableQrStyles.linkPath}>Direct Seat Link: {orderPath}</Text>
        <Text style={tableQrStyles.linkFull}>{orderUrl}</Text>
      </View>

      <View style={tableQrStyles.footerBox}>
        <Text style={tableQrStyles.footerSteps}>
          1. Point phone camera at QR  •  2. Open {orderPath}  •  3. Fresh order goes straight to the Kitchen
        </Text>
      </View>
    </Page>
  </Document>
);

export async function generateTableQrPdfBlob(args: {
  table: CafeTable;
  orderUrl: string;
  orderPath: string;
  settings: CafeSettings;
}): Promise<Blob> {
  const qrDataUrl = await QRCode.toDataURL(args.orderUrl, {
    width: 360,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#17120f',
      light: '#ffffff',
    },
  });
  return pdf(<TableQrPdf {...args} qrDataUrl={qrDataUrl} />).toBlob();
}
