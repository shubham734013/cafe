import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CafeOrder } from '../types/cafe';
import { CafeImage } from './CafeImage';

interface LiveTrackingScreenProps {
  activeOrder: CafeOrder;
  allOrders: CafeOrder[];
  onSelectOrder: (orderId: string) => void;
  onDownloadInvoicePdf?: (order: CafeOrder) => void;
  onNotify: (msg: string) => void;
  onBackToMenu: () => void;
}

const STEPS: { key: CafeOrder['status']; label: string; icon: string }[] = [
  { key: 'placed', label: 'Placed', icon: 'check' },
  { key: 'preparing', label: 'Preparing', icon: 'skillet' },
  { key: 'ready', label: 'Ready', icon: 'notifications_active' },
  { key: 'served', label: 'Served', icon: 'table_restaurant' },
];

export const LiveTrackingScreen: React.FC<LiveTrackingScreenProps> = ({
  activeOrder,
  allOrders,
  onSelectOrder,
  onDownloadInvoicePdf,
  onNotify,
  onBackToMenu,
}) => {
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const currentIdx = STEPS.findIndex((s) => s.key === activeOrder.status);
  const progressPercent = currentIdx === 0 ? 12 : currentIdx === 1 ? 38 : currentIdx === 2 ? 72 : 100;

  const statusMessage =
    activeOrder.status === 'placed'
      ? 'Order received at counter'
      : activeOrder.status === 'preparing'
        ? 'Your order is being prepared'
        : activeOrder.status === 'ready'
          ? 'Your order is ready for pickup / serving!'
          : 'Served — Enjoy your Seth Sawariya brew!';

  return (
    <div className="flex flex-col w-full pb-8 gap-4">
      {/* Recent Orders Selector Strip (when multiple orders exist) */}
      {allOrders.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
          {allOrders.slice(0, 5).map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => onSelectOrder(order.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                order.id === activeOrder.id
                  ? 'bg-primary text-on-primary font-bold shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              #{order.id} · {order.status.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Header Order Status Card */}
      <div className="w-full bg-surface-container-low rounded-xl p-4 flex flex-col gap-1.5 relative overflow-hidden shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-2 h-2 rounded-full bg-tertiary animate-pulse" />
            <span className="text-xs text-tertiary font-semibold tracking-wide uppercase">
              Live Order Tracking
            </span>
          </div>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-surface-container-highest text-secondary font-medium">
            {activeOrder.serviceMode === 'dine-in'
              ? `Dine-In · Table ${activeOrder.tableNumber?.replace('T', '') || '3'}`
              : activeOrder.serviceMode === 'takeaway'
                ? 'Takeaway'
                : `Delivery · ${activeOrder.deliveryPartner || 'Express'}`}
          </span>
        </div>

        <div className="flex items-baseline justify-between mt-1">
          <div className="flex flex-col">
            <h1 className="text-[26px] text-primary font-bold tracking-tight">
              Order #{activeOrder.id}
            </h1>
            <p className="text-xs text-on-surface-variant flex items-center gap-1 mt-0.5">
              <span className="material-symbols-outlined text-[14px]">schedule</span>
              Placed today at {activeOrder.createdAtLabel}
            </p>
          </div>
          <div className="text-right">
            <span className="text-xl text-on-surface font-bold tabular-nums">
              ₹{activeOrder.total}
            </span>
            <span className="block text-[11px] text-tertiary">
              Paid via {activeOrder.paymentMode.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop 2-col split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-6 flex flex-col gap-4">
          {/* Progress Milestone Stepper Tracker */}
          <div className="w-full bg-surface-container rounded-xl p-4 shadow-md flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-on-surface">Order Timeline</span>
              <span className="text-[11px] text-primary font-medium flex items-center gap-1 capitalize">
                <span
                  className={`material-symbols-outlined text-[14px] ${
                    activeOrder.status !== 'served' ? 'animate-spin' : ''
                  }`}
                >
                  {activeOrder.status === 'served' ? 'check_circle' : 'sync'}
                </span>
                {activeOrder.status}
              </span>
            </div>

            <div className="relative py-3 flex items-center justify-between w-full px-2">
              <div className="absolute left-6 right-6 top-1/2 -translate-y-4 h-1 bg-surface-container-highest rounded-full z-0">
                <div
                  className="h-full bg-gradient-to-r from-tertiary to-primary rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {STEPS.map((step, idx) => {
                const isDone = idx < currentIdx || activeOrder.status === 'served';
                const isActive = idx === currentIdx && activeOrder.status !== 'served';
                return (
                  <div
                    key={step.key}
                    className={`relative z-10 flex flex-col items-center gap-1 ${
                      !isDone && !isActive ? 'opacity-60' : ''
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        isDone
                          ? 'bg-tertiary text-on-tertiary shadow-lg shadow-tertiary/20'
                          : isActive
                            ? 'w-10 h-10 bg-primary-container text-on-primary-container shadow-lg shadow-primary/40 ring-4 ring-primary/20'
                            : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-[18px] ${
                          isDone ? 'icon-filled' : isActive ? 'animate-pulse text-[20px]' : ''
                        }`}
                      >
                        {isDone ? 'check' : step.icon}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        isActive
                          ? 'text-primary font-bold'
                          : isDone
                            ? 'text-on-surface'
                            : 'text-on-surface-variant'
                      }`}
                    >
                      {step.label}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">
                      {idx === 0
                        ? activeOrder.createdAtLabel
                        : isActive
                          ? 'Est. 8-10m'
                          : isDone
                            ? 'Done'
                            : '--:--'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Steaming Cup Preparation Banner */}
          <div className="w-full bg-surface-container-high rounded-xl p-4 shadow-md flex items-center gap-4 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
            <div className="relative w-16 h-16 rounded-xl bg-surface-container-low shrink-0 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-primary"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path d="M17 8h1a4 4 0 0 1 0 8h-1" />
                <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                <line x1="6" x2="6" y1="2" y2="4">
                  <animate
                    attributeName="opacity"
                    dur="2s"
                    repeatCount="indefinite"
                    values="0.3;1;0.3"
                  />
                </line>
                <line x1="10" x2="10" y1="1" y2="4">
                  <animate
                    attributeName="opacity"
                    dur="2.4s"
                    repeatCount="indefinite"
                    values="0.8;0.2;0.8"
                  />
                </line>
                <line x1="14" x2="14" y1="2" y2="4">
                  <animate
                    attributeName="opacity"
                    dur="1.8s"
                    repeatCount="indefinite"
                    values="0.4;0.9;0.4"
                  />
                </line>
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-base text-on-surface font-bold leading-snug">
                {statusMessage}
              </span>
              <p className="text-xs text-on-surface-variant mt-0.5 leading-normal">
                Our baristas are brewing with care. Status updates live from Kitchen KOT.
              </p>
            </div>
          </div>

          {/* Cafe Assistance Banner */}
          <div className="w-full bg-surface-container-low rounded-xl p-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-[20px]">room_service</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-on-surface font-semibold truncate">
                  Server Assigned: {activeOrder.serverName || 'Neha V.'}
                </span>
                <span className="text-[11px] text-on-surface-variant truncate">
                  {activeOrder.tableNumber ? `Table ${activeOrder.tableNumber}` : 'Counter Pickup'} ·
                  Kitchen KOT {activeOrder.kotNumber}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onNotify(`Notified server ${activeOrder.serverName || 'Neha V.'} for assistance`)
              }
              className="px-3 py-2 bg-surface-container-highest hover:bg-surface-bright text-primary text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">ring_volume</span>
              <span>Call Server</span>
            </button>
          </div>
        </div>

        {/* Ordered Items Summary & Bill Breakdown */}
        <div className="lg:col-span-6 flex flex-col gap-4">
          <div className="w-full bg-surface-container rounded-xl p-4 shadow-md flex flex-col gap-2.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-primary text-[20px]">
                  restaurant_menu
                </span>
                <h2 className="text-base font-semibold text-on-surface">
                  Items Ordered ({activeOrder.items.length})
                </h2>
              </div>
              <span className="text-[11px] text-on-surface-variant">
                KOT Ticket: {activeOrder.kotNumber}
              </span>
            </div>

            {activeOrder.items.map((item) => (
              <div
                key={item.menuItemId}
                className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-surface-container-high transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-lg bg-surface-container-lowest overflow-hidden shrink-0">
                    <CafeImage src={item.imageUrl} alt={item.name} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block w-2 h-2 rounded-full bg-tertiary shrink-0" />
                      <span className="text-sm text-on-surface truncate font-semibold">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-xs text-on-surface-variant truncate">
                      Qty: {item.quantity} · {item.note}
                    </span>
                  </div>
                </div>
                <span className="text-sm text-primary font-bold shrink-0 tabular-nums">
                  ₹{item.price * item.quantity}
                </span>
              </div>
            ))}

            <div className="mt-1 bg-surface-container-low rounded-lg p-3 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-on-surface-variant">
                <span>Item Total</span>
                <span className="tabular-nums">₹{activeOrder.subtotal}</span>
              </div>
              <div className="flex justify-between text-xs text-on-surface-variant">
                <span>Taxes &amp; Cafe Cess</span>
                <span className="tabular-nums">₹{activeOrder.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-tertiary">
                <span>Sawariya Member Discount</span>
                <span className="tabular-nums">- ₹{activeOrder.discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-on-surface font-bold pt-1">
                <span>Grand Total</span>
                <span className="text-primary font-bold text-lg tabular-nums">
                  ₹{activeOrder.total}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Action Buttons */}
          <div className="w-full flex items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                onNotify('Cafe Captain alerted — someone will be with you right away')
              }
              className="flex-1 h-12 bg-surface-container-high hover:bg-surface-bright text-on-surface text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">support_agent</span>
              <span>Need Help?</span>
            </button>
            <button
              type="button"
              onClick={() => setInvoiceOpen(true)}
              className="flex-1 h-12 bg-primary hover:bg-primary-fixed-dim text-on-primary text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
              <span>Invoice</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onBackToMenu}
            className="w-full h-11 rounded-lg bg-surface-container-low hover:bg-surface-container text-primary text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add_circle</span>
            <span>Order More Items</span>
          </button>
        </div>
      </div>

      {/* GST Invoice Dialog */}
      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="bg-surface-container-low border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-primary">Seth Sawariya Cafe</DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Tax Invoice · #{activeOrder.id}
            </DialogDescription>
          </DialogHeader>
          <div className="bg-surface-container-lowest rounded-xl p-3.5 space-y-2 text-xs">
            {activeOrder.items.map((item) => (
              <div key={item.menuItemId} className="flex justify-between">
                <span className="text-on-surface">
                  {item.quantity} × {item.name}
                </span>
                <span className="text-on-surface-variant tabular-nums">
                  ₹{item.price * item.quantity}
                </span>
              </div>
            ))}
            <div className="h-px bg-surface-variant my-1" />
            <div className="flex justify-between font-bold text-sm text-primary">
              <span>Total Paid ({activeOrder.paymentMode.toUpperCase()})</span>
              <span className="tabular-nums">₹{activeOrder.total}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {onDownloadInvoicePdf && (
              <button
                type="button"
                onClick={() => onDownloadInvoicePdf(activeOrder)}
                className="flex-1 h-11 rounded-xl bg-surface-container-high text-primary font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer hover:bg-surface-bright"
              >
                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                <span>Download PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setInvoiceOpen(false);
                onNotify(`Invoice #${activeOrder.id} saved`);
              }}
              className="flex-1 h-11 rounded-xl bg-primary-container text-on-primary-container font-bold text-sm cursor-pointer"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
