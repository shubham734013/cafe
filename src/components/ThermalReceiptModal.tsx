import React, { useState } from 'react';
import type { CafeOrder, CafeSettings } from '../types/cafe';
import { formatINR } from '../utils/cafeLogic';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ThermalReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: CafeOrder | null;
  settings?: Partial<CafeSettings>;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  open,
  onOpenChange,
  order,
  settings,
}) => {
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');

  if (!order) return null;

  const cafeName = settings?.cafeName || 'Seth Sawariya Cafe';
  const address = settings?.address || '12 Civil Lines, Near Clock Tower, Jaipur, RJ 302001';
  const phone = settings?.phone || '+91 98765 43210';
  const gstin = settings?.gstin || '08AABCS1429B1ZB';
  const fssai = '10021011000123';

  const isTakeaway = order.serviceMode === 'takeaway';
  const isDelivery = order.serviceMode === 'delivery';
  const isDineIn = !isTakeaway && !isDelivery;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-surface-container-low border border-outline-variant/30 text-on-surface p-0 overflow-hidden sm:rounded-2xl">
        {/* Modal Controls Header (Screen only) */}
        <div className="print:hidden p-4 border-b border-outline-variant/20 flex flex-col gap-3 bg-surface-container">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  receipt_long
                </span>
                Thermal Receipt Printer
              </DialogTitle>
              <DialogDescription className="text-xs text-on-surface-variant">
                ESC/POS thermal print preview · Order #{order.id}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="font-semibold">Paper Roll:</span>
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                  paperWidth === '80mm'
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container-high'
                }`}
              >
                80mm (Standard)
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                  paperWidth === '58mm'
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container-high'
                }`}
              >
                58mm (Mobile POS)
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-on-primary text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Print Slip</span>
            </button>
          </div>
        </div>

        {/* Thermal Paper Roll Scroll Container */}
        <div className="max-h-[65vh] overflow-y-auto p-4 flex justify-center bg-neutral-900/40">
          <div
            id="printable-thermal-receipt"
            className={`bg-white text-neutral-950 font-mono shadow-2xl p-4 transition-all duration-200 select-text ${
              paperWidth === '80mm' ? 'w-[320px]' : 'w-[240px]'
            } rounded-sm border border-neutral-300 text-[11px] leading-tight`}
          >
            {
              /* CUSTOMER TAX INVOICE */
              <div className="flex flex-col gap-2">
                {/* Header */}
                <div className="text-center flex flex-col items-center">
                  <h1 className="text-base font-extrabold uppercase tracking-wider">{cafeName}</h1>
                  <p className="text-[10px] text-neutral-600 mt-0.5 max-w-[90%]">{address}</p>
                  <p className="text-[10px] text-neutral-700">Phone: {phone}</p>
                  <p className="text-[10px] text-neutral-700 font-bold">GSTIN: {gstin}</p>
                  <p className="text-[9px] text-neutral-500">FSSAI Lic No: {fssai}</p>
                  <div className="border-b-2 border-dashed border-neutral-400 w-full my-2" />
                  <p className="text-xs font-black uppercase tracking-widest bg-neutral-100 px-3 py-0.5 rounded">
                    TAX INVOICE
                  </p>
                </div>

                {/* Metadata */}
                <div className="flex flex-col gap-0.5 text-[10px] text-neutral-800">
                  <div className="flex justify-between">
                    <span>Invoice #: <strong className="font-bold">{order.id}</strong></span>
                    <span>KOT: <strong className="font-bold">{order.kotNumber}</strong></span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date: {order.createdAtLabel || 'Today'}</span>
                    <span>Type: <strong className="font-bold uppercase">{order.serviceMode}</strong></span>
                  </div>
                  {isDineIn && order.tableNumber && (
                    <div className="flex justify-between bg-neutral-100 px-1 py-0.5 rounded font-bold">
                      <span>Table: {order.tableNumber}</span>
                      <span>Server: {order.serverName || 'Staff'}</span>
                    </div>
                  )}
                  {isTakeaway && (
                    <div className="text-center font-bold bg-neutral-100 py-0.5 rounded">
                      *** TAKEAWAY COUNTER PICKUP ***
                    </div>
                  )}
                  {isDelivery && (
                    <div className="text-center font-bold bg-neutral-100 py-0.5 rounded">
                      *** DELIVERY ({order.deliveryPartner || 'Direct'}) ***
                    </div>
                  )}
                </div>

                <div className="border-b border-neutral-300 w-full my-1" />

                {/* Line Items Table */}
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-neutral-300 text-left font-bold text-neutral-700">
                      <th className="py-1">Item</th>
                      <th className="py-1 text-center w-8">Qty</th>
                      <th className="py-1 text-right w-12">Rate</th>
                      <th className="py-1 text-right w-12">Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.menuItemId} className="border-b border-neutral-100">
                        <td className="py-1 pr-1 font-semibold">
                          <div>{item.name}</div>
                          {item.note && (
                            <div className="text-[9px] text-neutral-500 italic">└ {item.note}</div>
                          )}
                        </td>
                        <td className="py-1 text-center align-top font-bold">{item.quantity}</td>
                        <td className="py-1 text-right align-top">{item.price}</td>
                        <td className="py-1 text-right align-top font-bold">
                          {item.price * item.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals */}
                <div className="flex flex-col gap-1 text-[10px] pt-1">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-bold">{formatINR(order.subtotal)}</span>
                  </div>
                  {order.discount > 0 && (
                    <div className="flex justify-between text-neutral-700">
                      <span>Discount (Promo):</span>
                      <span className="font-bold">- {formatINR(order.discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-neutral-600 text-[9px]">
                    <span>CGST (2.5%):</span>
                    <span>{formatINR(Math.round(order.tax / 2))}</span>
                  </div>
                  <div className="flex justify-between text-neutral-600 text-[9px]">
                    <span>SGST (2.5%):</span>
                    <span>{formatINR(Math.round(order.tax / 2))}</span>
                  </div>
                  <div className="border-b-2 border-neutral-800 my-0.5" />
                  <div className="flex justify-between text-xs font-black">
                    <span>GRAND TOTAL:</span>
                    <span className="text-sm">{formatINR(order.total)}</span>
                  </div>
                  <div className="border-b-2 border-dashed border-neutral-400 my-0.5" />
                </div>

                {/* Payment Breakdown */}
                <div className="bg-neutral-100 p-2 rounded text-[10px] flex flex-col gap-0.5">
                  <div className="flex justify-between">
                    <span>Payment Mode:</span>
                    <strong className="font-bold uppercase">
                      {order.paymentMode === 'cash' ? 'CASH' : order.paymentMode === 'card' ? 'CARD / EDC' : 'UPI'}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Payment Status:</span>
                    <strong className="font-bold text-emerald-800 uppercase">
                      {order.paymentStatus === 'paid' ? 'PAID / SETTLED' : 'UNPAID / COUNTER'}
                    </strong>
                  </div>
                  {order.paymentRef && (
                    <div className="text-[9px] text-neutral-600 truncate">
                      Ref: {order.paymentRef}
                    </div>
                  )}
                  {order.loyaltyPointsAwarded ? (
                    <div className="text-[9px] text-neutral-700 font-bold text-center mt-1 pt-1 border-t border-neutral-200">
                      ⭐ Earned +{order.loyaltyPointsAwarded} Loyalty Points!
                    </div>
                  ) : null}
                </div>

                {/* Footer and barcode */}
                <div className="text-center flex flex-col items-center gap-1 pt-2 text-[9px] text-neutral-600">
                  <p className="font-bold">Thank you for dining with us! ✨</p>
                  <p>Free WiFi: {cafeName.replace(/\s+/g, '')}_5G | Pass: CoffeeTime</p>
                  <div className="font-mono text-xs tracking-widest select-none py-1 font-bold">
                    ||| | ||||| || |||| ||| |||| |
                  </div>
                  <p className="text-[8px] text-neutral-400">Powered by CafeOS Point-of-Sale</p>
                </div>
              </div>
            }
          </div>
        </div>

        {/* Global Print Style Hook for this modal */}
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * {
                visibility: hidden !important;
              }
              #printable-thermal-receipt, #printable-thermal-receipt * {
                visibility: visible !important;
              }
              #printable-thermal-receipt {
                position: fixed !important;
                left: 0 !important;
                top: 0 !important;
                width: ${paperWidth === '80mm' ? '80mm' : '58mm'} !important;
                padding: 4mm !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
              }
              @page {
                size: ${paperWidth === '80mm' ? '80mm' : '58mm'} auto;
                margin: 0;
              }
            }
          `
        }} />
      </DialogContent>
    </Dialog>
  );
};