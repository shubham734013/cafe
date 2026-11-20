import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { INITIAL_CAFE_SETTINGS } from '../data/cafeSeedData';
import { addTableSchema, tableTransferMergeSchema } from '../shared/schemas';
import { buildTableSeatOrderPath, buildTableSeatOrderUrl } from '../shared/upi';
import { resolveEffectiveTableState } from '../state/cafeStateMachines';
import { CafeOrder, CafeSettings, CafeTable, TableFloor } from '../types/cafe';
import { triggerBlobDownload } from '../utils/download';
import { QrPreviewModal } from './QrPreviewModal';

interface TableLayoutScreenProps {
  tables: CafeTable[];
  orders: CafeOrder[];
  selectedTable: string;
  readOnly?: boolean;
  cafeSettings?: CafeSettings;
  onSelectTableForPos: (tableId: string) => void;
  onCheckInTable: (tableId: string) => void | Promise<void>;
  onAddTable: (table: CafeTable) => void;
  onTransferTable?: (sourceTableId: string, targetTableId: string) => void;
  onMergeTables?: (sourceTableId: string, targetTableId: string) => void;
  onNotify: (msg: string) => void;
}

const FLOORS: TableFloor[] = ['Floor 1 (Main Hall)', 'Floor 2 (Rooftop)', 'Outdoor Patio'];

type AddTableValues = z.input<typeof addTableSchema>;
type TransferMergeValues = z.infer<typeof tableTransferMergeSchema>;

export const TableLayoutScreen: React.FC<TableLayoutScreenProps> = ({
  tables,
  orders,
  selectedTable,
  readOnly = false,
  cafeSettings,
  onSelectTableForPos,
  onCheckInTable,
  onAddTable,
  onTransferTable,
  onMergeTables,
  onNotify,
}) => {
  const [activeFloor, setActiveFloor] = useState<TableFloor>('Floor 1 (Main Hall)');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'reserved'>(
    'all'
  );
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [actionMode, setActionMode] = useState<'merge' | 'transfer' | null>(null);
  const [qrTableId, setQrTableId] = useState<string | null>(null);
  const [pendingCheckInId, setPendingCheckInId] = useState<string | null>(null);
  const [printingQrTableId, setPrintingQrTableId] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<CafeOrder | null>(null);

  const effectiveSettings = cafeSettings ?? INITIAL_CAFE_SETTINGS;

  const handleCheckIn = async (tableId: string) => {
    setPendingCheckInId(tableId);
    try {
      await onCheckInTable(tableId);
    } finally {
      setPendingCheckInId((cur) => (cur === tableId ? null : cur));
    }
  };

  const handlePrintTableQr = async (table: CafeTable) => {
    setPrintingQrTableId(table.id);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cafeos.local';
      const orderPath = buildTableSeatOrderPath(table.id);
      const orderUrl = buildTableSeatOrderUrl(origin, table.id);
      const { generateTableQrPdfBlob } = await import('./CafePdfDocuments');
      const blob = await generateTableQrPdfBlob({
        table,
        orderUrl,
        orderPath,
        settings: effectiveSettings,
      });
      triggerBlobDownload(
        `seth-sawariya-table-${table.id}-qr.pdf`,
        blob,
        'application/pdf'
      );
      onNotify(`Downloaded Table ${table.id} QR PDF (${orderPath})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Unable to generate QR PDF for ${table.id}`);
    } finally {
      setPrintingQrTableId((cur) => (cur === table.id ? null : cur));
    }
  };

  const addForm = useForm<AddTableValues>({
    resolver: zodResolver(addTableSchema),
    defaultValues: {
      id: `T${tables.length + 1}`,
      seats: 4,
      zone: 'Main Lounge',
      floor: activeFloor,
    },
  });

  const actionForm = useForm<TransferMergeValues>({
    resolver: zodResolver(tableTransferMergeSchema),
    defaultValues: {
      sourceTableId: selectedTable,
      targetTableId: tables.find((t) => t.id !== selectedTable)?.id ?? '',
    },
  });

  const counts = useMemo(() => {
    let available = 0;
    let occupied = 0;
    let reserved = 0;
    tables.forEach((t) => {
      const effective = resolveEffectiveTableState(t, orders);
      if (effective.status === 'occupied') {
        occupied++;
      } else if (effective.status === 'reserved') {
        reserved++;
      } else {
        available++;
      }
    });
    const totalSeats = tables.reduce((s, t) => s + t.seats, 0);
    return { available, occupied, reserved, totalSeats };
  }, [orders, tables]);

  const visibleTables = useMemo(() => {
    return tables
      .filter((t) => t.floor === activeFloor)
      .filter((t) => {
        if (statusFilter === 'all') return true;
        return resolveEffectiveTableState(t, orders).status === statusFilter;
      });
  }, [activeFloor, orders, statusFilter, tables]);

  const handleOpenAddModal = () => {
    addForm.reset({
      id: `T${tables.length + 1}`,
      seats: 4,
      zone: 'Main Lounge',
      floor: activeFloor,
    });
    setAddTableOpen(true);
  };

  const handleCreateTable = addForm.handleSubmit((values) => {
    const parsed = addTableSchema.parse(values);
    onAddTable({
      id: parsed.id,
      label: `Table ${parsed.id}`,
      seats: parsed.seats,
      zone: parsed.zone,
      floor: activeFloor,
      status: 'available',
    });
    setAddTableOpen(false);
  });

  const openTableAction = (mode: 'merge' | 'transfer') => {
    const fallbackTarget = tables.find((t) => t.id !== selectedTable)?.id ?? selectedTable;
    actionForm.reset({
      sourceTableId: selectedTable,
      targetTableId: fallbackTarget,
    });
    setActionMode(mode);
  };

  const handleRunTableAction = actionForm.handleSubmit((values) => {
    if (values.sourceTableId === values.targetTableId) {
      actionForm.setError('targetTableId', { message: 'Choose a different target table' });
      return;
    }
    if (actionMode === 'transfer') {
      if (onTransferTable) {
        onTransferTable(values.sourceTableId, values.targetTableId);
      } else {
        onNotify(`Transferred KOT from ${values.sourceTableId} to ${values.targetTableId}`);
      }
    } else if (actionMode === 'merge') {
      if (onMergeTables) {
        onMergeTables(values.sourceTableId, values.targetTableId);
      } else {
        onNotify(`Merged ${values.sourceTableId} onto ${values.targetTableId}`);
      }
    }
    setActionMode(null);
  });

  const qrDeepLink = useMemo(() => {
    if (!qrTableId) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cafeos.local';
    return buildTableSeatOrderUrl(origin, qrTableId);
  }, [qrTableId]);

  const qrTableObj = useMemo(
    () => (qrTableId ? tables.find((t) => t.id === qrTableId) ?? null : null),
    [qrTableId, tables]
  );

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Top Status Banner */}
      <div className="flex flex-col gap-2.5 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-container-high px-4 py-2.5 rounded-xl shadow-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">
              table_restaurant
            </span>
            <h1 className="text-lg font-bold text-on-surface">Tables (Dine-In)</h1>
          </div>
          <span className="text-xs text-on-surface-variant tabular-nums">
            Capacity: {tables.length} Tables ({counts.totalSeats} Seats)
          </span>
        </div>

        {/* Status Legend Filter Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter((s) => (s === 'available' ? 'all' : 'available'))}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer ${
              statusFilter === 'available'
                ? 'bg-tertiary text-on-tertiary ring-1 ring-tertiary'
                : 'bg-tertiary-container/20 text-tertiary'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-current shrink-0" />
            <span className="truncate tabular-nums">Available ({counts.available})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter((s) => (s === 'occupied' ? 'all' : 'occupied'))}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer ${
              statusFilter === 'occupied'
                ? 'bg-error text-on-error ring-1 ring-error'
                : 'bg-error-container/40 text-error'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-current shrink-0" />
            <span className="truncate tabular-nums">Occupied ({counts.occupied})</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter((s) => (s === 'reserved' ? 'all' : 'reserved'))}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer ${
              statusFilter === 'reserved'
                ? 'bg-primary text-on-primary ring-1 ring-primary'
                : 'bg-secondary-container/20 text-primary'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-current shrink-0" />
            <span className="truncate tabular-nums">Reserved ({counts.reserved})</span>
          </button>
        </div>

        {/* Floor Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
          {FLOORS.map((floor) => {
            const active = activeFloor === floor;
            return (
              <button
                key={floor}
                type="button"
                onClick={() => setActiveFloor(floor)}
                className={`px-4 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary-container text-on-primary font-bold shadow-sm'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface font-medium'
                }`}
              >
                {floor}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Cards Grid */}
      {visibleTables.length === 0 ? (
        <div className="p-8 rounded-xl bg-surface-container-low text-center space-y-2 border border-outline-variant/15">
          <span className="material-symbols-outlined text-[28px] text-outline">
            table_restaurant
          </span>
          <p className="text-sm font-semibold text-on-surface">
            No {statusFilter === 'all' ? '' : `${statusFilter} `}tables on {activeFloor}
          </p>
          <p className="text-xs text-on-surface-variant">
            Switch status filter or choose another floor to inspect seating.
          </p>
          {statusFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className="mt-1 px-4 py-1.5 rounded-lg bg-surface-container-high text-primary text-xs font-bold cursor-pointer"
            >
              Show All Statuses
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {visibleTables.map((table) => {
            const effective = resolveEffectiveTableState(table, orders);
          const activeOrder = effective.activeOrder;
          const isOccupied = effective.status === 'occupied';
          const isReserved = effective.status === 'reserved';
          const isSelected = selectedTable === table.id;

          const accentBarColor = isOccupied
            ? 'bg-error'
            : isReserved
              ? 'bg-primary'
              : 'bg-tertiary';

          return (
            <div
              key={table.id}
              className={`rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between shadow-md hover:shadow-lg transition-all border relative overflow-hidden space-y-3 ${
                isOccupied
                  ? 'bg-surface-container-low border-error/30'
                  : 'bg-surface-container-low border-outline-variant/15 hover:border-outline-variant/30'
              } ${isSelected ? 'ring-2 ring-primary/60' : ''}`}
            >
              <div className={`absolute top-0 left-0 w-full h-1.5 ${accentBarColor}`} />

              {/* Header: Table ID, Seats & QR/Status */}
              <div className="flex items-start justify-between gap-1.5 pt-1">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base sm:text-lg font-black text-on-surface">{table.id}</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant font-medium">{table.seats}-Seater</p>
                </div>

                <div className="flex items-center gap-1">
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Show QR for Table ${table.id}`}
                      onClick={() => setQrTableId(table.id)}
                      className="w-7 h-7 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/10"
                    >
                      <span className="material-symbols-outlined text-[15px]">qr_code_2</span>
                    </button>
                  )}
                  {isOccupied ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container/40 text-error text-[10px] font-bold tabular-nums">
                      <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                      {table.elapsedLabel || `${activeOrder?.elapsedMinutes ?? 12}m`}
                    </span>
                  ) : isReserved ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-container/20 text-primary text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {table.reservedTime || '7:30 PM'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary text-[10px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                      Free
                    </span>
                  )}
                </div>
              </div>

              {/* Middle Metrics Inset Sub-Card */}
              {isOccupied ? (
                <div className="rounded-xl bg-surface-container-lowest/80 border border-outline-variant/10 p-2.5 flex flex-col gap-1">
                  <span className="text-[11px] text-on-surface-variant font-medium truncate">
                    #{activeOrder?.id || table.activeOrderId || (readOnly ? 'Order unavailable' : 'SSCB421')}
                  </span>
                  <div className="flex items-center justify-between text-on-surface pt-0.5">
                    <span className="text-xs text-on-surface-variant font-medium">
                      {(() => {
                        const cnt = activeOrder
                          ? activeOrder.items.reduce((s, i) => s + i.quantity, 0)
                          : readOnly ? 0 : 2;
                        return `${cnt} ${cnt === 1 ? 'item' : 'items'}`;
                      })()}
                    </span>
                    <span className="text-xs font-black text-primary tabular-nums">
                      {activeOrder ? `₹${activeOrder.total}` : readOnly ? '' : '₹228'}
                    </span>
                  </div>
                </div>
              ) : isReserved ? (
                <div className="rounded-xl bg-surface-container-lowest/80 border border-outline-variant/10 p-2.5 flex flex-col">
                  <span className="text-xs text-on-surface font-bold truncate">
                    {readOnly ? 'Reserved' : table.reservedBy}
                  </span>
                  {!readOnly && (
                    <span className="text-[11px] text-on-surface-variant truncate mt-0.5">
                      Party of {table.reservedPartySize ?? 4}
                    </span>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-surface-container-lowest/80 border border-outline-variant/10 p-2.5 flex flex-col justify-center">
                  <p className="text-xs text-on-surface-variant font-medium truncate">{table.zone}</p>
                  <p className="text-[10px] text-tertiary font-bold mt-0.5">Ready for guests</p>
                </div>
              )}

              {/* Action Button */}
              <div className="flex flex-col gap-1.5 pt-0.5">
                {isOccupied ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (readOnly) {
                        if (activeOrder) setDetailOrder(activeOrder);
                      } else {
                        onSelectTableForPos(table.id);
                      }
                    }}
                    disabled={readOnly && !activeOrder}
                    className={`w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer ${
                      table.billReady
                        ? 'bg-primary text-on-primary shadow-md hover:brightness-110'
                        : 'bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {table.billReady ? 'payments' : 'receipt_long'}
                    </span>
                    <span>{readOnly ? 'View Order Details' : table.billReady ? 'Bill Ready' : 'View Order'}</span>
                  </button>
                ) : readOnly ? (
                  <p className="py-2 text-center text-xs text-on-surface-variant font-medium">
                    {isReserved ? 'Reserved table' : 'No active order'}
                  </p>
                ) : isReserved ? (
                  <button
                    type="button"
                    disabled={pendingCheckInId === table.id}
                    onClick={() => void handleCheckIn(table.id)}
                    className="w-full py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright border border-outline-variant/20 text-primary text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                    <span>{pendingCheckInId === table.id ? 'Checking in...' : 'Check-in'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelectTableForPos(table.id)}
                    className="w-full py-1.5 rounded-lg bg-surface-container-highest text-primary text-xs font-semibold flex items-center justify-center gap-1 hover:bg-surface-bright transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>Assign</span>
                  </button>
                )}
                {!readOnly && <button
                  type="button"
                  data-testid={`print-qr-btn-${table.id}`}
                  aria-label={`Print QR PDF for Table ${table.id}`}
                  disabled={printingQrTableId === table.id}
                  onClick={() => void handlePrintTableQr(table)}
                  className="w-full py-1.5 rounded-lg bg-surface-container text-on-surface-variant hover:text-primary hover:bg-surface-container-highest text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                  <span>
                    {printingQrTableId === table.id ? 'Generating PDF...' : 'Print QR'}
                  </span>
                </button>}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Operational Action Dock */}
      {!readOnly && <div className="bg-surface-container-low p-2.5 rounded-xl flex items-center justify-between gap-2 shadow-lg">
        <button
          type="button"
          onClick={() => openTableAction('merge')}
          className="flex-1 py-2.5 px-2 rounded-lg bg-surface-container-high text-on-surface flex items-center justify-center gap-1.5 hover:bg-surface-bright transition-colors active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-primary">call_merge</span>
          <span className="text-xs font-semibold truncate">Merge</span>
        </button>

        <button
          type="button"
          onClick={() => openTableAction('transfer')}
          className="flex-1 py-2.5 px-2 rounded-lg bg-surface-container-high text-on-surface flex items-center justify-center gap-1.5 hover:bg-surface-bright transition-colors active:scale-95 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-primary">swap_horiz</span>
          <span className="text-xs font-semibold truncate">Transfer</span>
        </button>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="flex-1 py-2.5 px-2 rounded-lg bg-primary-container text-on-primary flex items-center justify-center gap-1.5 hover:opacity-95 transition-opacity active:scale-95 shadow-md cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span className="text-xs font-bold truncate">Add Table</span>
        </button>
      </div>}

      {detailOrder && (
        <Dialog open onOpenChange={(open) => !open && setDetailOrder(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">
                Table {detailOrder.tableNumber} · Order #{detailOrder.id}
              </DialogTitle>
              <DialogDescription>
                {detailOrder.createdAtLabel} · {detailOrder.status}
              </DialogDescription>
            </DialogHeader>
            <ul className="divide-y divide-outline-variant/20">
              {detailOrder.items.map((item) => (
                <li key={item.menuItemId} className="py-3">
                  <p className="font-semibold">{item.quantity}× {item.name}</p>
                  {item.note && <p className="mt-1 text-xs text-on-surface-variant">{item.note}</p>}
                </li>
              ))}
            </ul>
            {detailOrder.cookingNote && (
              <p className="rounded-xl bg-surface-container-low p-3 text-sm">
                Note: {detailOrder.cookingNote}
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Add Table Dialog (shadcn + React Hook Form + Zod) */}
      <Dialog open={addTableOpen} onOpenChange={setAddTableOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Add Table to {activeFloor}
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Assign a unique floor code and seating capacity.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTable} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Table Code
                </label>
                <input
                  type="text"
                  {...addForm.register('id')}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {addForm.formState.errors.id && (
                  <p className="text-[11px] text-error mt-1">
                    {addForm.formState.errors.id.message}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Seats
                </label>
                <input
                  type="number"
                  min={1}
                  max={16}
                  {...addForm.register('seats')}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {addForm.formState.errors.seats && (
                  <p className="text-[11px] text-error mt-1">
                    {addForm.formState.errors.seats.message}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                Seating Zone Note
              </label>
              <input
                type="text"
                {...addForm.register('zone')}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {addForm.formState.errors.zone && (
                <p className="text-[11px] text-error mt-1">
                  {addForm.formState.errors.zone.message}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddTableOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-primary-container text-on-primary text-sm font-bold cursor-pointer"
              >
                Create Table
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Merge / Transfer Table Dialog */}
      <Dialog open={actionMode !== null} onOpenChange={(o) => !o && setActionMode(null)}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              {actionMode === 'merge' ? 'Merge Tables' : 'Transfer Table KOT'}
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              {actionMode === 'merge'
                ? 'Combine active orders from source table onto the target table.'
                : 'Move running KOT & party assignment from source table to a new table.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRunTableAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  From Table
                </label>
                <select
                  {...actionForm.register('sourceTableId')}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} ({t.seats}S)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  To Table
                </label>
                <select
                  {...actionForm.register('targetTableId')}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} ({t.seats}S)
                    </option>
                  ))}
                </select>
                {actionForm.formState.errors.targetTableId && (
                  <p className="text-[11px] text-error mt-1">
                    {actionForm.formState.errors.targetTableId.message}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActionMode(null)}
                className="flex-1 py-2.5 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-primary-container text-on-primary text-sm font-bold cursor-pointer"
              >
                {actionMode === 'merge' ? 'Confirm Merge' : 'Confirm Transfer'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Table Self-Ordering QR Modal */}
      <QrPreviewModal
        open={Boolean(qrTableId)}
        onOpenChange={(open) => !open && setQrTableId(null)}
        title={`Table ${qrTableId ?? ''} QR Menu`}
        subtitle="Guests scan to launch Seth Sawariya Customer Menu pre-tagged to this table."
        badgeText={`Dine-In Self Order · ${qrTableId ?? ''}`}
        value={qrDeepLink}
        downloadFileName={`seth-sawariya-${qrTableId ?? 'table'}-qr.png`}
        onDownloadPdf={qrTableObj ? () => handlePrintTableQr(qrTableObj) : undefined}
        pdfGenerating={Boolean(qrTableId && printingQrTableId === qrTableId)}
      />
    </div>
  );
};
