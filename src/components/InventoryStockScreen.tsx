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
import { InventoryIngredient, InventoryTab } from '../types/cafe';
import {
  filterInventoryItems,
  getIngredientThresholdDeficit,
  isIngredientBelowThreshold,
} from '../utils/cafeLogic';
import { CafeDataTable } from './CafeDataTable';

interface InventoryStockScreenProps {
  items: InventoryIngredient[];
  onRestockItem: (id: string) => void | Promise<void>;
  onAddIngredient: (ingredient: Omit<InventoryIngredient, 'id' | 'status' | 'fillPct'>) => void;
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
];

type AddIngredientValues = z.input<typeof addIngredientSchema>;

export const InventoryStockScreen: React.FC<InventoryStockScreenProps> = ({
  items,
  onRestockItem,
  onAddIngredient,
  onExportExcel,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('Inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortByLowFirst, setSortByLowFirst] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [restockingIds, setRestockingIds] = useState<Set<string>>(() => new Set());

  const handleRestock = async (id: string) => {
    setRestockingIds((prev) => new Set(prev).add(id));
    try {
      await onRestockItem(id);
    } finally {
      setRestockingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

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
          const busy = restockingIds.has(row.original.id);
          return (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRestock(row.original.id)}
              className="px-2.5 py-1 rounded bg-primary-container/20 text-primary text-[11px] font-bold hover:bg-primary-container/30 cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Restocking...' : 'Restock'}
            </button>
          );
        },
      },
    ],
    [restockingIds]
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
          <p className="text-xs text-on-surface-variant truncate">
            {items.length} Raw Ingredients • Live Depletion Active
          </p>
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
              onClick={() => onNotify('Barcode scanner ready — hold SKU label near camera')}
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
              <span className="text-[11px] truncate">Valuation</span>
            </div>
            <span className="text-base sm:text-lg font-bold text-on-surface tracking-tight tabular-nums">
              {valuationLabel}
            </span>
            <span className="text-[11px] text-tertiary mt-0.5 flex items-center gap-0.5 tabular-nums truncate">
              <span className="material-symbols-outlined text-[12px] shrink-0">inventory</span>
              {items.length} SKUs
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
          {activeTab !== 'Suppliers' && (
            <div className="inline-flex rounded-lg bg-surface-container-low p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-primary-container text-on-primary font-bold'
                    : 'text-on-surface-variant'
                }`}
              >
                Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-primary-container text-on-primary font-bold'
                    : 'text-on-surface-variant'
                }`}
              >
                Table
              </button>
            </div>
          )}
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
      {activeTab === 'Suppliers' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {supplierGroups.map(([supplier, vendorItems]) => (
            <div
              key={supplier}
              className="p-3.5 rounded-xl bg-surface-container-low flex flex-col justify-between gap-2.5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-on-surface">{supplier}</span>
                <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-[11px] text-primary font-semibold">
                  {vendorItems.length} SKUs
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Supplies: {vendorItems.map((v) => v.name).join(', ')}
              </p>
              <button
                type="button"
                onClick={() => onNotify(`Purchase order draft created for ${supplier}`)}
                className="w-full py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-semibold cursor-pointer"
              >
                Create Vendor PO
              </button>
            </div>
          ))}
        </div>
      ) : viewMode === 'table' ? (
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
      ) : filteredItems.length === 0 ? (
        <div className="p-8 rounded-xl bg-surface-container-low text-center space-y-2.5">
          <span className="material-symbols-outlined text-[28px] text-outline">
            {activeTab === 'Low Stock' ? 'check_circle' : 'inventory_2'}
          </span>
          <p className="text-sm font-semibold text-on-surface">
            {activeTab === 'Low Stock'
              ? 'No ingredients below minimum threshold'
              : 'No matching ingredients'}
          </p>
          <p className="text-xs text-on-surface-variant">
            {activeTab === 'Low Stock'
              ? 'All stocked ingredients meet or exceed their configured minimum levels.'
              : 'Clear your search or switch inventory tabs.'}
          </p>
          {activeTab === 'Low Stock' && (
            <button
              type="button"
              onClick={() => setActiveTab('Inventory')}
              className="px-3.5 py-1.5 rounded-lg bg-surface-container-high text-primary text-xs font-semibold hover:bg-surface-bright cursor-pointer"
            >
              Show All Inventory
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredItems.map((item) => {
            const isCritical = item.status === 'Critical';
            const isReorder = item.status === 'Reorder Soon';
            const belowMin = isIngredientBelowThreshold(item);
            const deficit = getIngredientThresholdDeficit(item);
            return (
              <div
                key={item.id}
                data-testid={`inventory-card-${item.id}`}
                data-below-threshold={belowMin ? 'true' : 'false'}
                className={`flex flex-col p-3.5 rounded-lg shadow-sm justify-between transition-colors ${
                  belowMin
                    ? 'bg-error-container/12 border border-error/50'
                    : 'bg-surface-container-low'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        belowMin || isCritical
                          ? 'bg-error-container/40 text-error'
                          : 'bg-surface-container-high text-primary'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-on-surface truncate">
                          {item.name}
                        </span>
                        {belowMin && (
                          <span
                            data-testid={`below-min-card-badge-${item.id}`}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-error text-on-error text-[10px] font-bold"
                          >
                            <span className="material-symbols-outlined text-[11px]">warning</span>
                            Below Min
                          </span>
                        )}
                        {item.status === 'Good' && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-tertiary-container text-on-tertiary-container text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-on-tertiary-container" />
                            Good
                          </span>
                        )}
                        {isReorder && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-fixed text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-on-secondary-fixed" />
                            Reorder Soon
                          </span>
                        )}
                        {isCritical && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-error-container text-on-error-container text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                            Critical
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-xs truncate ${
                          belowMin || isCritical ? 'text-error/90' : 'text-on-surface-variant'
                        }`}
                      >
                        {belowMin
                          ? `Short by ${deficit} ${item.unit} (Min: ${item.minThreshold} ${item.unit})`
                          : item.subtitle}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-lg font-bold tabular-nums ${
                        isCritical
                          ? 'text-error'
                          : isReorder
                            ? 'text-primary'
                            : 'text-on-surface'
                      }`}
                    >
                      {item.quantity}{' '}
                      <span className="text-xs font-normal text-outline">{item.unit}</span>
                    </div>
                    <button
                      type="button"
                      disabled={restockingIds.has(item.id)}
                      onClick={() => void handleRestock(item.id)}
                      className={`text-[11px] font-semibold flex items-center justify-end gap-0.5 mt-0.5 ml-auto cursor-pointer disabled:opacity-50 ${
                        isCritical
                          ? 'px-2 py-0.5 rounded bg-error-container text-on-error-container font-bold shadow-sm hover:opacity-90'
                          : 'text-primary hover:underline'
                      }`}
                    >
                      {!isCritical && (
                        <span className="material-symbols-outlined text-[14px]">
                          {restockingIds.has(item.id)
                            ? 'progress_activity'
                            : isReorder
                              ? 'local_shipping'
                              : 'add_circle'}
                        </span>
                      )}
                      <span>
                        {restockingIds.has(item.id)
                          ? 'Restocking...'
                          : isReorder
                            ? 'Order'
                            : 'Restock'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Depletion Progress Bar */}
                <div className="w-full bg-surface-container-highest rounded-full h-1.5 mt-2.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      isCritical
                        ? 'bg-error'
                        : isReorder
                          ? 'bg-secondary-container'
                          : 'bg-tertiary'
                    }`}
                    style={{ width: `${item.fillPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Operational Quick Helpers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => onNotify('Stock audit worksheet opened for evening shift')}
          className="w-full flex items-center justify-between p-3.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">tune</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                Quick Stock Adjustment
              </span>
              <span className="text-xs text-on-surface-variant">
                Audit counts, wastage &amp; batch intake
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline text-[20px] group-hover:translate-x-0.5 transition-transform">
            chevron_right
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            onNotify(`Bundled ${lowStockCount} low-stock SKU(s) into supplier PO #PO-842`)
          }
          className="w-full flex items-center justify-between p-3.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-secondary-container/20 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-on-surface group-hover:text-secondary transition-colors">
                Generate Supplier PO
              </span>
              <span className="text-xs text-on-surface-variant">
                Auto-bundle items below minimum stock
              </span>
            </div>
          </div>
          <span className="material-symbols-outlined text-outline text-[20px] group-hover:translate-x-0.5 transition-transform">
            chevron_right
          </span>
        </button>
      </div>

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
