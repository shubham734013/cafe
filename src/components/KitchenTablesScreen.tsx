import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CafeOrder, CafeTable } from '../types/cafe';
import { resolveEffectiveTableState } from '../state/cafeStateMachines';

interface KitchenTablesScreenProps {
  tables: CafeTable[];
  orders: CafeOrder[];
  detailsOnly?: boolean;
  onAdvanceOrderStatus?: (orderId: string) => void | Promise<void>;
  onNotify?: (msg: string) => void;
}

export const KitchenTablesScreen: React.FC<KitchenTablesScreenProps> = ({
  tables,
  orders,
  detailsOnly = false,
  onAdvanceOrderStatus,
  onNotify,
}) => {
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string>('all');

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const selectedState = selectedTable ? resolveEffectiveTableState(selectedTable, orders) : null;

  const filteredTables = useMemo(() => {
    if (zoneFilter === 'all') return tables;
    return tables.filter((t) => t.floor?.toLowerCase().includes(zoneFilter.toLowerCase()));
  }, [tables, zoneFilter]);

  const activeTablesCount = tables.filter((t) => resolveEffectiveTableState(t, orders).status === 'occupied').length;

  const handleAdvance = async (orderId: string) => {
    if (!onAdvanceOrderStatus || advancingId === orderId) return;
    setAdvancingId(orderId);
    try {
      await onAdvanceOrderStatus(orderId);
      onNotify?.(`Table order advanced successfully!`);
    } catch {
      onNotify?.(`Failed to advance table order.`);
    } finally {
      setAdvancingId(null);
    }
  };

  return (
    <section className="flex flex-col w-full pb-8 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">
              {detailsOnly ? 'Table Details' : 'Floor & Tables'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-black inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{activeTablesCount} Active Dining</span>
            </span>
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Real-time floor layout, table tickets, and dining service states.
          </p>
        </div>

        {/* Floor filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {['all', 'Floor 1', 'Outdoor'].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setZoneFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold capitalize transition-all cursor-pointer ${
                zoneFilter === f
                  ? 'bg-[#FF6422] text-white shadow-sm'
                  : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/15'
              }`}
            >
              {f === 'all' ? 'All Floors' : f}
            </button>
          ))}
        </div>
      </div>

      {tables.length === 0 ? (
        <div className="rounded-3xl border border-outline-variant/15 bg-surface-container p-12 text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-[#FF6422]/15 text-[#FF6422] flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[24px]">table_restaurant</span>
          </div>
          <h3 className="font-bold text-on-surface text-sm sm:text-base">No Tables Setup</h3>
          <p className="text-xs text-on-surface-variant">Tables will appear once created in Floor Plan.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTables.map((table) => {
            const state = resolveEffectiveTableState(table, orders);
            const isOccupied = state.status === 'occupied';
            const isReserved = state.status === 'reserved';

            return (
              <div
                key={table.id}
                onClick={() => setSelectedTableId(table.id)}
                className={`group rounded-3xl bg-surface-container hover:bg-surface-container-high border transition-all cursor-pointer p-5 shadow-sm hover:shadow-md flex flex-col justify-between ${
                  isOccupied
                    ? 'border-[#FF6422]/30 ring-1 ring-[#FF6422]/20'
                    : isReserved
                      ? 'border-amber-500/30'
                      : 'border-outline-variant/15'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-black text-base text-on-surface group-hover:text-[#FF6422] transition-colors">
                        {table.label || table.id}
                      </h3>
                      <p className="text-xs text-on-surface-variant">
                        {table.floor} · {table.seats} Seats
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-black capitalize ${
                        isOccupied
                          ? 'bg-[#FF6422]/15 text-[#FF6422] border border-[#FF6422]/30'
                          : isReserved
                            ? 'bg-amber-500/15 text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-400'
                      }`}
                    >
                      {state.status}
                    </span>
                  </div>

                  <div className="py-2 border-t border-b border-outline-variant/10 text-xs">
                    {state.activeOrder ? (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-on-surface font-semibold">
                          <span>KOT {state.activeOrder.kotNumber}</span>
                          <span className="text-[#FF6422] font-black capitalize">
                            {state.activeOrder.status}
                          </span>
                        </div>
                        <p className="text-on-surface-variant text-[11px] truncate">
                          {state.activeOrder.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                        </p>
                      </div>
                    ) : (
                      <p className="text-on-surface-variant text-[11px] italic">
                        Table cleaned & ready for guests
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-2 flex items-center justify-between text-[11px] text-on-surface-variant">
                  <span>{table.zone || 'Main Dining Hall'}</span>
                  {state.activeOrder && onAdvanceOrderStatus && state.activeOrder.status !== 'served' && (
                    <button
                      type="button"
                      disabled={advancingId === state.activeOrder.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (state.activeOrder) handleAdvance(state.activeOrder.id);
                      }}
                      className="px-3 py-1 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-[11px] font-bold shadow-sm transition-all cursor-pointer"
                    >
                      {advancingId === state.activeOrder.id ? 'Updating...' : 'Advance KOT'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table Details Modal */}
      <Dialog
        open={selectedTable !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTableId(null);
        }}
      >
        {selectedTable && selectedState && (
          <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl border border-outline-variant/20 bg-surface-container p-6 text-on-surface sm:max-w-lg shadow-2xl">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-lg font-black text-on-surface">
                  {selectedTable.label || selectedTable.id}
                </DialogTitle>
                <span className="px-2.5 py-0.5 rounded-full bg-[#FF6422]/15 text-[#FF6422] text-xs font-black capitalize">
                  {selectedState.status}
                </span>
              </div>
              <DialogDescription className="text-xs text-on-surface-variant">
                {selectedTable.floor} · {selectedTable.zone} · {selectedTable.seats} Seats Capacity
              </DialogDescription>
            </DialogHeader>

            {selectedState.activeOrder ? (
              <div className="mt-4 space-y-3">
                <div className="p-3 rounded-2xl bg-surface border border-outline-variant/15 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-black text-on-surface">
                      KOT {selectedState.activeOrder.kotNumber} · #{selectedState.activeOrder.id}
                    </h4>
                    <p className="text-[11px] text-on-surface-variant">
                      Placed at {selectedState.activeOrder.createdAtLabel}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold capitalize">
                    {selectedState.activeOrder.status}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {selectedState.activeOrder.items.map((item) => (
                    <div
                      key={item.menuItemId}
                      className="flex items-center justify-between p-2 rounded-xl bg-surface text-xs"
                    >
                      <span className="font-semibold text-on-surface">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="text-on-surface-variant font-medium">
                        ₹{item.price * item.quantity}
                      </span>
                    </div>
                  ))}
                </div>

                {onAdvanceOrderStatus && selectedState.activeOrder.status !== 'served' && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedState.activeOrder) handleAdvance(selectedState.activeOrder.id);
                        setSelectedTableId(null);
                      }}
                      className="w-full py-3 rounded-full bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer"
                    >
                      Advance Order Status
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 text-center py-6 text-xs text-on-surface-variant">
                This table is currently available for guest check-in.
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
};
