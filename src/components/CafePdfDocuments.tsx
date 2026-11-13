import React from 'react';
import { Document, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { CafeOrder, CafeSettings } from '../types/cafe';

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
            <Text>Grand Total ({order.paymentMode.toUpperCase()})</Text>
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
        <Text style={{ flex: 1 }}>Payment</Text>
        <Text style={{ flex: 1, textAlign: 'right' }}>Total</Text>
      </View>
      {orders.slice(0, 20).map((order) => (
        <View key={order.id} style={styles.row}>
          <Text style={{ flex: 1.2 }}>{order.id}</Text>
          <Text style={{ flex: 1.2 }}>{order.serviceMode}</Text>
          <Text style={{ flex: 1.2 }}>{order.status.toUpperCase()}</Text>
          <Text style={{ flex: 1 }}>{order.paymentMode.toUpperCase()}</Text>
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
