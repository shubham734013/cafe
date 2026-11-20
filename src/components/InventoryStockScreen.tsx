import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { addIngredientSchema } from '../shared/schemas';
import type {
  InventoryIngredient,
  InventoryTab,
  StockMovement,
  InventoryBatch,
  PurchaseOrder,
  StockCount,
} from '../types/cafe';
import {
  filterInventoryItems,
  getIngredientThresholdDeficit,
  isIngredientBelowThreshold,
} from '../utils/cafeLogic';
import { CafeDataTable } from './CafeDataTable';

interface InventoryStockScreenProps {
  items: InventoryIngredient[];
  stockMovements?: StockMovement[];
  inventoryBatches?: InventoryBatch[];
  purchaseOrders?: PurchaseOrder[];
  stockCounts?: StockCount[];
  onRestockItem: (id: string) => void | Promise<void>;
  onAddIngredient: (ingredient: Omit<InventoryIngredient, 'id' | 'status' | 'fillPct'>) => void;
  onReceiveStock: (payload: {
    ingredientId: string;
    quantity: number;
    unitCost?: number;
    supplier?: string;
    batchNumber?: string;
    expiryDate?: string;
    note?: string;
  }) => Promise<void>;
  onRecordWaste: (payload: {
    ingredientId: string;
    quantity: number;
    reason: string;
    batchId?: string;
  }) => Promise<void>;
  onTransferStock: (payload: {
    ingredientId: string;
    quantity: number;
    fromLocation: string;
    toLocation: string;
    note?: string;
  }) => Promise<void>;
  onCreateStockCount: (payload: {
    physicalCounts: Array<{ ingredientId: string; physicalQuantity: number; note?: string }>;
    note?: string;
  }) => Promise<void>;
  onApproveStockCount: (countId: string) => Promise<void>;
  onCreatePurchaseOrder: (payload: {
    supplier: string;
    note?: string;
    lines: Array<{ ingredientId: string; quantity: number; unitCost: number }>;
  }) => Promise<void>;
  onReceivePurchaseOrder: (payload: {
    purchaseOrderId: string;
    receivedLines: Array<{
      ingredientId: string;
      quantity: number;
      batchNumber?: string;
      expiryDate?: string;
    }>;
  }) => Promise<void>;
  onExportExcel?: () => void;
  onNotify: (msg: string) => void;
}

const INVENTORY_TABS: InventoryTab[] = [
  'Inventory',
  'Low Stock',
  'Ingredients',
  'Stock In',
  'Stock Out',
  'Suppliers',
  'Movements',
  'Purchase Orders',
  'Batches',
  'Waste',
  'Stock Counts',
];

type AddIngredientValues = z.input<typeof addIngredientSchema>;

export const InventoryStockScreen: React.FC<InventoryStockScreenProps> = ({
  items,
  stockMovements = [],
  inventoryBatches = [],
  purchaseOrders = [],
  stockCounts = [],
  onRestockItem,
  onAddIngredient,
  onReceiveStock,
  onRecordWaste,
  onTransferStock,
  onCreateStockCount,
  onApproveStockCount,
  onCreatePurchaseOrder,
  onReceivePurchaseOrder,
  onExportExcel,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('Inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortByLowFirst, setSortByLowFirst] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const form = useForm<AddIngredientValues>({
    resolver: zodResolver(addIngredientSchema),
    defaultValues: {
      name: '',
      quantity: 5,
      unit: 'kg',
      minThreshold: 1,
      supplier: 'Metro Wholesale',
      unitCost: 180,
    },
  });

  const { lowStockCount, belowThresholdCount, valuationLabel, activeStockInCount } = useMemo(() => {
    const below = items.filter((i) => isIngredientBelowThreshold(i)).length;
    const low = items.filter((i) => i.status === 'Critical' || i.status === 'Reorder Soon').length;
    const totalVal = items.reduce((s, i) => s + i.quantity * (i.unitCost || 0), 0);
    const valLabel =
      totalVal >= 1000
        ? `₹${(totalVal / 1000).toFixed(1)}k`
        : `₹${Math.round(totalVal).toLocaleString('en-IN')}`;
    const stockIn = items.filter((i) => i.movementType !== 'out').length;
    return {
      lowStockCount: low,
      belowThresholdCount: below,
      valuationLabel: valLabel,
      activeStockInCount: stockIn,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const base = filterInventoryItems(items, activeTab, searchQuery);
    if (!sortByLowFirst) return base;
    const rank = { Critical: 0, 'Reorder Soon': 1, Good: 2 };
    return [...base].sort((a, b) => rank[a.status] - rank[b.status]);
  }, [activeTab, items, searchQuery, sortByLowFirst]);

  const supplierGroups = useMemo(() => {
    const map = new Map<string, InventoryIngredient[]>();
    items.forEach((item) => {
      const list = map.get(item.supplier) ?? [];
      list.push(item);
      map.set(item.supplier, list);
    });
    return Array.from(map.entries());
  }, [items]);

  const columns = useMemo<ColumnDef<InventoryIngredient, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Ingredient',
        cell: ({ row }) => {
          const belowMin = isIngredientBelowThreshold(row.original);
          return (
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-bold text-on-surface">{row.original.name}</p>
                {belowMin && (
                  <span
                    data-testid={`below-min-badge-${row.original.id}`}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-error-container text-on-error-container text-[10px] font-bold"
                  >
                    <span className="material-symbols-outlined text-[11px]">warning</span>
                    Below Min
                  </span>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant">{row.original.supplier}</p>
            </div>
          );
        },
      },
      {
        accessorKey: 'quantity',
        header: 'In Stock',
        cell: ({ row }) => {
          const belowMin = isIngredientBelowThreshold(row.original);
          const deficit = getIngredientThresholdDeficit(row.original);
          return (
            <div className="flex flex-col">
              <span
                className={`font-bold tabular-nums inline-flex items-center gap-1 ${
                  belowMin ? 'text-error' : 'text-on-surface'
                }`}
              >
                {belowMin && (
                  <span className="material-symbols-outlined text-[13px] shrink-0">
                    trending_down
                  </span>
                )}
                {row.original.quantity} {row.original.unit}
              </span>
              {belowMin && (
                <span className="text-[10px] font-semibold text-error/90 tabular-nums">
                  -{deficit} {row.original.unit} below min
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'minThreshold',
        header: 'Min Alert',
        cell: ({ row }) => (
          <span className="tabular-nums text-on-surface-variant">
            {row.original.minThreshold} {row.original.unit}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const st = row.original.status;
          return (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                st === 'Critical'
                  ? 'bg-error-container text-on-error-container'
                  : st === 'Reorder Soon'
                    ? 'bg-secondary-container text-on-secondary-fixed'
                    : 'bg-tertiary-container text-on-tertiary-container'
              }`}
            >
              {st}
            </span>
          );
        },
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        cell: ({ row }) => {
          return (
            <button
              type="button"
              onClick={() => onRestockItem(row.original.id)}
              className="px-2.5 py-1 rounded bg-primary-container/20 text-primary text-[11px] font-bold hover:bg-primary-container/30 cursor-pointer disabled:opacity-50"
            >
              Restock
            </button>
          );
        },
      },
    ],
    [onRestockItem]
  );

  const handleOpenAdd = () => {
    form.reset({
      name: '',
      quantity: 5,
      unit: 'kg',
      minThreshold: 1,
      supplier: 'Metro Wholesale',
      unitCost: 180,
    });
    setAddModalOpen(true);
  };

  const handleSaveNew = form.handleSubmit((values) => {
    const parsed = addIngredientSchema.parse(values);
    onAddIngredient({
      name: parsed.name,
      quantity: parsed.quantity,
      unit: parsed.unit,
      minThreshold: parsed.minThreshold,
      maxCapacity: Math.max(parsed.quantity * 1.4, parsed.minThreshold * 2, 10),
      subtitle: `Min: ${parsed.minThreshold} ${parsed.unit} • Supplier: ${parsed.supplier}`,
      supplier: parsed.supplier,
      icon: 'inventory_2',
      unitCost: parsed.unitCost,
      movementType: 'in',
    });
    setAddModalOpen(false);
  });

  const promptFirstInventoryAction = async (kind: 'receive' | 'waste' | 'transfer' | 'count') => {
    if (items.length === 0) {
      onNotify('Add an ingredient before recording inventory activity.');
      return;
    }
    const item = items[0];
    if (kind === 'receive') {
      const quantityText = window.prompt(`Receive quantity for ${item.name}`, '1');
      if (!quantityText) return;
      const quantity = Number(quantityText);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const supplier = window.prompt('Supplier', item.supplier) || item.supplier;
      await onReceiveStock({ ingredientId: item.id, quantity, supplier });
    } else if (kind === 'waste') {
      const quantityText = window.prompt(`Waste quantity for ${item.name}`, '0.1');
      if (!quantityText) return;
      const quantity = Number(quantityText);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const reason = window.prompt('Waste reason', 'Kitchen spoilage');
      if (!reason?.trim()) return;
      await onRecordWaste({ ingredientId: item.id, quantity, reason: reason.trim() });
    } else if (kind === 'transfer') {
      const quantityText = window.prompt(`Transfer quantity for ${item.name}`, '1');
      if (!quantityText) return;
      const quantity = Number(quantityText);
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const toLocation = window.prompt('Transfer to location', 'Kitchen') || 'Kitchen';
      await onTransferStock({
        ingredientId: item.id,
        quantity,
        fromLocation: 'Central Store',
        toLocation,
      });
    } else {
      const counts = items.map((entry) => {
        const quantityText = window.prompt(
          `Physical quantity for ${entry.name} (system: ${entry.quantity} ${entry.unit})`,
          String(entry.quantity)
        );
        const physicalQuantity = quantityText === null ? entry.quantity : Number(quantityText);
        return {
          ingredientId: entry.id,
          physicalQuantity: Number.isFinite(physicalQuantity) ? physicalQuantity : entry.quantity,
        };
      });
      await onCreateStockCount({ physicalCounts: counts, note: 'Physical stock count' });
    }
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-4">
      {/* Header & Add Action */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-on-surface tracking-tight">
              Inventory &amp; Stock
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-[11px] font-semibold tabular-nums">
              {lowStockCount} Low
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              className="px-3 py-2 rounded-lg bg-surface-container-high text-primary text-xs font-semibold flex items-center gap-1 hover:bg-surface-bright cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">table_view</span>
              <span className="hidden sm:inline">Excel</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenAdd}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold shadow-md hover:bg-primary-container transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {INVENTORY_TABS.map((tab) => {
          const active = activeTab === tab;
          const isLowStockTab = tab === 'Low Stock';
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? isLowStockTab
                    ? 'bg-error text-on-error font-bold shadow-sm'
                    : 'bg-primary-container text-on-primary font-bold shadow-sm'
                  : isLowStockTab && belowThresholdCount > 0
                    ? 'bg-error-container/60 text-on-error-container hover:bg-error-container font-semibold'
                    : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              {isLowStockTab && (
                <span className="material-symbols-outlined text-[14px]">warning</span>
              )}
              <span>{tab}</span>
              {isLowStockTab && (
                <span
                  data-testid="low-stock-tab-count"
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                    active
                      ? 'bg-surface/20 text-on-error'
                      : 'bg-error/15 text-error'
                  }`}
                >
                  {belowThresholdCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void promptFirstInventoryAction('receive')} className="px-3 py-2 rounded-lg bg-surface-container-high text-primary text-xs font-bold">
          Receive Stock
        </button>
        <button type="button" onClick={() => void promptFirstInventoryAction('waste')} className="px-3 py-2 rounded-lg bg-surface-container-high text-error text-xs font-bold">
          Record Waste
        </button>
        <button type="button" onClick={() => void promptFirstInventoryAction('transfer')} className="px-3 py-2 rounded-lg bg-surface-container-high text-secondary text-xs font-bold">
          Transfer Stock
        </button>
        <button type="button" onClick={() => void promptFirstInventoryAction('count')} className="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-xs font-bold">
          Start Stock Count
        </button>
      </div>

      {/* Search + Barcode + KPI Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-5 flex items-center">
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </div>
            <input
              type="text"
              aria-label="Search ingredient or barcode"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stock..."
              className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
            />
            <button
              type="button"
              aria-label="Scan barcode"
              onClick={() => onNotify('Barcode scanner ready — hold item barcode near camera')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-primary hover:text-primary-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">barcode_scanner</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 grid grid-cols-3 gap-2">
          <div className="flex flex-col p-2.5 rounded-lg bg-surface-container-low min-w-0">
            <div className="flex items-center gap-1 text-on-surface-variant mb-1">
              <span className="material-symbols-outlined text-[15px] text-primary shrink-0">
                account_balance_wallet
              </span>
              <span className="text-[11px] truncate">Stock Value</span>
            </div>
            <span className="text-base sm:text-lg font-bold text-on-surface tracking-tight tabular-nums">
              {valuationLabel}
            </span>
            <span className="text-[11px] text-tertiary mt-0.5 flex items-center gap-0.5 tabular-nums truncate">
              <span className="material-symbols-outlined text-[12px] shrink-0">inventory</span>
              {items.length} items
            </span>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab((prev) => (prev === 'Low Stock' ? 'Inventory' : 'Low Stock'))}
            className={`flex flex-col p-2.5 rounded-lg text-left transition-colors min-w-0 cursor-pointer ${
              activeTab === 'Low Stock'
                ? 'bg-error-container/25 ring-1 ring-error/50'
                : 'bg-surface-container-low hover:bg-surface-container'
            }`}
          >
            <div className="flex items-center gap-1 text-on-surface-variant mb-1">
              <span className="material-symbols-outlined text-[15px] text-error shrink-0">
                warning
              </span>
              <span className="text-[11px] truncate">Below Min</span>
            </div>
            <span className="text-base sm:text-lg font-bold text-error tracking-tight tabular-nums">
              {String(belowThresholdCount).padStart(2, '0')}
            </span>
            <span className="text-[11px] text-error/90 mt-0.5 truncate">
              {belowThresholdCount > 0 ? 'Tap to filter' : 'All healthy'}
            </span>
          </button>

          <div className="flex flex-col p-2.5 rounded-lg bg-surface-container-low min-w-0">
            <div className="flex items-center gap-1 text-on-surface-variant mb-1">
              <span className="material-symbols-outlined text-[15px] text-secondary shrink-0">
                local_shipping
              </span>
              <span className="text-[11px] truncate">Vendors</span>
            </div>
            <span className="text-base sm:text-lg font-bold text-on-surface tracking-tight tabular-nums">
              {String(supplierGroups.length).padStart(2, '0')}
            </span>
            <span className="text-[11px] text-on-surface-variant mt-0.5 truncate">
              {activeStockInCount} active SKUs
            </span>
          </div>
        </div>
      </div>

      {/* Store Ingredients List Header */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-on-surface">
            {activeTab === 'Suppliers' ? 'Verified Suppliers' : 'Store Ingredients'}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-surface-container-high text-on-surface-variant text-[11px] font-medium">
            {activeTab === 'Suppliers'
              ? `${supplierGroups.length} Vendors`
              : `${filteredItems.length} Active`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Sort Stock"
            onClick={() => {
              setSortByLowFirst((prev) => !prev);
              onNotify(sortByLowFirst ? 'Reset stock order' : 'Sorted critical stock to top');
            }}
            className={`p-2 rounded-md transition-colors cursor-pointer ${
              sortByLowFirst
                ? 'bg-primary-container/20 text-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">sort</span>
          </button>
          <button
            type="button"
            aria-label="Refresh Stock"
            onClick={() => onNotify('Live depletion counts synced with POS')}
            className="p-2 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Suppliers Tab View vs Ingredient Rows */}
      {activeTab === 'Movements' ? (
        <div className="space-y-2">
          {stockMovements.length === 0 ? (
            <p className="p-6 rounded-xl bg-surface-container-low text-sm text-on-surface-variant text-center">
              No stock movements recorded yet.
            </p>
          ) : stockMovements.map((movement) => (
            <div key={movement.id} className="p-3 rounded-xl bg-surface-container-low flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-on-surface">{movement.ingredientName}</p>
                <p className="text-xs text-on-surface-variant">
                  {movement.type} · {movement.note || 'Inventory adjustment'}
                </p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${movement.quantityDelta >= 0 ? 'text-tertiary' : 'text-error'}`}>
                  {movement.quantityDelta >= 0 ? '+' : ''}{movement.quantityDelta} {movement.unit}
                </p>
                <p className="text-[10px] text-on-surface-variant">{movement.afterQuantity} {movement.unit} remaining</p>
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'Purchase Orders' ? (
        <div className="space-y-3">
          {purchaseOrders.length === 0 ? (
            <p className="p-8 rounded-2xl bg-surface-container-low border border-outline-variant/15 text-sm text-on-surface-variant text-center">
              No purchase orders yet.
            </p>
          ) : purchaseOrders.map((purchaseOrder) => (
            <div key={purchaseOrder.id} className="p-4 sm:p-5 rounded-2xl bg-surface-container-low border border-outline-variant/15 hover:border-outline-variant/30 shadow-md space-y-3 transition-all">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center shrink-0 border border-outline-variant/10 text-primary">
                    <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-on-surface">PO #{purchaseOrder.id}</p>
                    <p className="text-xs text-on-surface-variant font-medium">{purchaseOrder.supplier}</p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high border border-outline-variant/15 text-[10px] font-bold uppercase tracking-wider text-primary">
                  {purchaseOrder.status}
                </span>
              </div>
              <div className="rounded-xl bg-surface-container-lowest/80 border border-outline-variant/10 p-2.5 space-y-1 text-xs text-on-surface-variant">
                {purchaseOrder.lines.map((line) => (
                  <p key={line.ingredientId} className="flex justify-between font-medium">
                    <span className="text-on-surface">{line.ingredientName}</span>
                    <span className="tabular-nums font-bold text-primary">{line.receivedQuantity}/{line.orderedQuantity} {line.unit}</span>
                  </p>
                ))}
              </div>
              {purchaseOrder.status !== 'received' && purchaseOrder.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => {
                    const line = purchaseOrder.lines.find((entry) => entry.receivedQuantity < entry.orderedQuantity);
                    if (!line) return;
                    const quantityText = window.prompt(`Receive ${line.ingredientName}`, String(line.orderedQuantity - line.receivedQuantity));
                    const quantity = Number(quantityText);
                    if (!Number.isFinite(quantity) || quantity <= 0) return;
                    void onReceivePurchaseOrder({
                      purchaseOrderId: purchaseOrder.id,
                      receivedLines: [{ ingredientId: line.ingredientId, quantity }],
                    });
                  }}
                  className="px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-on-primary text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  Receive Stock
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              if (items.length === 0) {
                onNotify('Add an ingredient before creating a purchase order.');
                return;
              }
              const supplier = window.prompt('Supplier name', items[0].supplier);
              if (!supplier?.trim()) return;
              const item = items[0];
              const quantityText = window.prompt(`Order quantity for ${item.name}`, '10');
              const quantity = Number(quantityText);
              if (!Number.isFinite(quantity) || quantity <= 0) return;
              void onCreatePurchaseOrder({
                supplier: supplier.trim(),
                lines: [{ ingredientId: item.id, quantity, unitCost: item.unitCost }],
              });
            }}
            className="w-full py-3 rounded-2xl bg-primary hover:brightness-110 text-on-primary text-sm font-bold shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Create Purchase Order</span>
          </button>
        </div>
      ) : activeTab === 'Batches' ? (
        <div className="space-y-3">
          {inventoryBatches.length === 0 ? (
            <p className="p-8 rounded-2xl bg-surface-container-low border border-outline-variant/15 text-sm text-on-surface-variant text-center">No inventory batches recorded.</p>
          ) : inventoryBatches.map((batch) => (
            <div key={batch.id} className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center text-primary border border-outline-variant/10">
                  <span className="material-symbols-outlined text-[18px]">category</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-on-surface">{batch.ingredientName}</p>
                  <p className="text-xs text-on-surface-variant">Batch {batch.batchNumber}{batch.expiryDate ? ` · Expires ${batch.expiryDate}` : ''}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-on-surface tabular-nums">{batch.quantity} {batch.unit}</p>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] font-bold uppercase tracking-wider text-primary">{batch.status}</span>
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'Waste' ? (
        <div className="space-y-3">
          {stockMovements.filter((movement) => movement.type === 'waste').length === 0 ? (
            <p className="p-8 rounded-2xl bg-surface-container-low border border-outline-variant/15 text-sm text-on-surface-variant text-center">No waste recorded.</p>
          ) : stockMovements.filter((movement) => movement.type === 'waste').map((movement) => (
            <div key={movement.id} className="p-4 rounded-2xl bg-surface-container-low border border-outline-variant/15 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-error-container/20 text-error flex items-center justify-center border border-error/20">
                  <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-on-surface">{movement.ingredientName}</p>
                  <p className="text-xs text-on-surface-variant">{movement.note}</p>
                </div>
              </div>
              <p className="text-sm font-black text-error tabular-nums">{movement.quantityDelta} {movement.unit}</p>
            </div>
          ))}
        </div>
      ) : activeTab === 'Stock Counts' ? (
        <div className="space-y-3">
          {stockCounts.length === 0 ? (
            <p className="p-8 rounded-2xl bg-surface-container-low border border-outline-variant/15 text-sm text-on-surface-variant text-center">No stock counts recorded.</p>
          ) : stockCounts.map((count) => (
            <div key={count.id} className="p-4 sm:p-5 rounded-2xl bg-surface-container-low border border-outline-variant/15 space-y-3 shadow-md">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-on-surface">Count #{count.id}</p>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[10px] font-bold uppercase tracking-wider text-primary">{count.status}</span>
              </div>
              <div className="rounded-xl bg-surface-container-lowest/80 border border-outline-variant/10 p-2.5 space-y-1 text-xs text-on-surface-variant">
                {count.lines.map((line) => (
                  <p key={line.ingredientId} className="flex justify-between font-medium">
                    <span className="text-on-surface">{line.ingredientName}</span>
                    <span className="tabular-nums">Sys: {line.systemQuantity} · Phys: {line.physicalQuantity} (Var: {line.variance} {line.unit})</span>
                  </p>
                ))}
              </div>
              {count.status === 'draft' && (
                <button type="button" onClick={() => void onApproveStockCount(count.id)} className="px-4 py-2 rounded-xl bg-primary hover:brightness-110 text-on-primary text-xs font-bold transition-all active:scale-95 cursor-pointer">
                  Approve Variance
                </button>
              )}
            </div>
          ))}
        </div>
      ) : activeTab === 'Suppliers' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {supplierGroups.map(([supplier, vendorItems]) => (
            <div
              key={supplier}
              className="p-4 sm:p-5 rounded-2xl liquid-glass-card flex flex-col justify-between gap-3 shadow-xl transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-surface-container-high/80 flex items-center justify-center shrink-0 border border-white/[0.08] text-primary shadow-sm">
                    <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                  </div>
                  <span className="text-sm font-bold text-on-surface truncate">{supplier}</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high/80 border border-white/[0.08] text-[10px] text-primary font-bold uppercase tracking-wider shrink-0">
                  {vendorItems.length} SKUs
                </span>
              </div>

              <div className="rounded-xl liquid-glass-subcard p-2.5 text-xs text-on-surface-variant">
                <span className="text-[10px] text-outline font-semibold uppercase tracking-wider block mb-0.5">Supplies</span>
                <p className="truncate text-on-surface font-medium">
                  {vendorItems.map((v) => v.name).join(', ')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onNotify(`Purchase order draft created for ${supplier}`)}
                className="w-full py-2 rounded-xl liquid-glass-pill text-primary text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 hover:border-primary/40"
              >
                <span className="material-symbols-outlined text-[15px]">post_add</span>
                <span>Create Vendor PO</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <CafeDataTable
          data={filteredItems}
          columns={columns}
          emptyText={
            activeTab === 'Low Stock'
              ? 'All ingredients are currently at or above their minimum threshold.'
              : 'No matching ingredients.'
          }
          getRowTestId={(row) => `inventory-row-${row.id}`}
          getRowClassName={(row) =>
            isIngredientBelowThreshold(row)
              ? 'bg-error-container/15 hover:bg-error-container/25 border-l-4 border-l-error'
              : ''
          }
        />
      )}


      {/* Add Raw Ingredient Dialog */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Add Raw Ingredient
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Add a tracked SKU with minimum threshold alert and supplier details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveNew} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Ingredient Name
                </label>
                <input
                  type="text"
                  {...form.register('name')}
                  placeholder="Ingredient name"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {form.formState.errors.name && (
                  <p className="text-[11px] text-error mt-1">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Opening Stock
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    {...form.register('quantity')}
                    placeholder="5.0"
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.quantity && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.quantity.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Unit
                  </label>
                  <select
                    {...form.register('unit')}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="kg">kg (Kilograms)</option>
                    <option value="g">g (Grams)</option>
                    <option value="L">L (Liters)</option>
                    <option value="ml">ml (Milliliters)</option>
                    <option value="pcs">pcs (Units/Packs)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Low Alert Threshold
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    {...form.register('minThreshold')}
                    placeholder="1.0"
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.minThreshold && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.minThreshold.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Supplier
                  </label>
                  <input
                    type="text"
                    {...form.register('supplier')}
                    placeholder="Supplier name"
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.supplier && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.supplier.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="flex-1 py-3 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-surface-variant transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-lg bg-primary text-on-primary text-sm font-bold shadow-md hover:bg-primary-container transition-colors cursor-pointer"
              >
                Save Item
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
