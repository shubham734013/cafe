import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { type ColumnDef } from '@tanstack/react-table';
import { useFieldArray, useForm } from 'react-hook-form';
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
  PurchaseOrder,
} from '../types/cafe';
import {
  filterInventoryItems,
  getIngredientThresholdDeficit,
  isIngredientBelowThreshold,
} from '../utils/cafeLogic';
import { CafeDataTable } from './CafeDataTable';

interface InventoryStockScreenProps {
  items: InventoryIngredient[];
  purchaseOrders?: PurchaseOrder[];
  onRestockItem: (id: string) => void | Promise<void>;
  onAddIngredient: (
    ingredient: Omit<InventoryIngredient, 'id' | 'status' | 'fillPct'>
  ) => Promise<void>;
  onRefresh: () => Promise<void>;
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
  'Stock In',
  'Suppliers',
  'Purchase Orders',
];

type AddIngredientValues = z.input<typeof addIngredientSchema>;
const addSupplierSchema = z.object({
  supplier: z.string().trim().min(2, 'Enter supplier name').max(80),
  ingredients: z.array(addIngredientSchema.omit({ supplier: true })).min(1),
});
type AddSupplierValues = z.input<typeof addSupplierSchema>;
type PurchaseOrderDraft = {
  supplier: string;
  lines: Array<{ ingredientId: string; quantity: string }>;
};
type ReceivePurchaseOrderDraft = {
  purchaseOrderId: string;
  ingredientId: string;
  ingredientName: string;
  maxQuantity: number;
  quantity: string;
};

export const InventoryStockScreen: React.FC<InventoryStockScreenProps> = ({
  items,
  purchaseOrders = [],
  onRestockItem,
  onAddIngredient,
  onRefresh,
  onCreatePurchaseOrder,
  onReceivePurchaseOrder,
  onExportExcel,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<InventoryTab>('Inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortByLowFirst, setSortByLowFirst] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [registeringSupplier, setRegisteringSupplier] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [purchaseOrderDraft, setPurchaseOrderDraft] = useState<PurchaseOrderDraft | null>(null);
  const [receivePurchaseOrderDraft, setReceivePurchaseOrderDraft] =
    useState<ReceivePurchaseOrderDraft | null>(null);

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
  const supplierForm = useForm<AddSupplierValues>({
    resolver: zodResolver(addSupplierSchema),
    defaultValues: {
      supplier: '',
      ingredients: [{ name: '', quantity: 5, unit: 'kg', minThreshold: 1, unitCost: 180 }],
    },
  });
  const supplierIngredientFields = useFieldArray({
    control: supplierForm.control,
    name: 'ingredients',
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
              className="px-2.5 py-1 rounded bg-primary-container/20 text-primary text-[11px] font-bold hover:bg-secondary-container hover:text-on-secondary-container cursor-pointer disabled:opacity-50"
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
    setRegisteringSupplier(false);
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

  const handleOpenAddSupplier = () => {
    setRegisteringSupplier(true);
    supplierForm.reset({
      supplier: '',
      ingredients: [{ name: '', quantity: 5, unit: 'kg', minThreshold: 1, unitCost: 180 }],
    });
    setAddModalOpen(true);
  };

  const ingredientPayload = (values: z.infer<typeof addIngredientSchema>) => ({
    name: values.name,
    quantity: values.quantity,
    unit: values.unit,
    minThreshold: values.minThreshold,
    maxCapacity: Math.max(values.quantity * 1.4, values.minThreshold * 2, 10),
    subtitle: `Min: ${values.minThreshold} ${values.unit} • Supplier: ${values.supplier}`,
    supplier: values.supplier,
    icon: 'inventory_2',
    unitCost: values.unitCost,
    movementType: 'in' as const,
  });

  const handleSaveNew = form.handleSubmit(async (values) => {
    const parsed = addIngredientSchema.parse(values);
    try {
      await onAddIngredient(ingredientPayload(parsed));
      setAddModalOpen(false);
    } catch {
      form.setError('root.server', { message: 'Could not save the ingredient. Please try again.' });
    }
  });

  const handleSaveSupplier = supplierForm.handleSubmit(async (values) => {
    const parsed = addSupplierSchema.parse(values);
    const results = await Promise.allSettled(
      parsed.ingredients.map((ingredient) =>
        onAddIngredient(ingredientPayload({ ...ingredient, supplier: parsed.supplier }))
      )
    );
    const failedIngredients = parsed.ingredients.filter((_, index) => results[index].status === 'rejected');
    if (failedIngredients.length > 0) {
      supplierIngredientFields.replace(failedIngredients);
      supplierForm.setError('root.server', {
        message: 'Some ingredients could not be saved. Successful items were added; review and retry the remaining rows.',
      });
      return;
    }
    setAddModalOpen(false);
    setRegisteringSupplier(false);
  });

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const openPurchaseOrderDialog = (supplier: string, item?: InventoryIngredient) => {
    if (!item) {
      onNotify('Add an ingredient before creating a purchase order.');
      return;
    }
    setPurchaseOrderDraft({
      supplier,
      lines: [{ ingredientId: item.id, quantity: '10' }],
    });
  };

  const handleCreatePurchaseOrder = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!purchaseOrderDraft) return;
    if (!purchaseOrderDraft.supplier.trim()) {
      onNotify('Enter a supplier name.');
      return;
    }
    const lines = purchaseOrderDraft.lines.map((line) => {
      const item = items.find(
        (entry) => entry.id === line.ingredientId && entry.supplier === purchaseOrderDraft.supplier
      );
      return { item, quantity: Number(line.quantity) };
    });
    if (lines.some(({ item, quantity }) => !item || !Number.isFinite(quantity) || quantity <= 0)) {
      onNotify('Choose ingredients from this supplier and enter quantities greater than zero.');
      return;
    }
    void onCreatePurchaseOrder({
      supplier: purchaseOrderDraft.supplier.trim(),
      lines: lines.flatMap(({ item, quantity }) =>
        item ? [{ ingredientId: item.id, quantity, unitCost: item.unitCost }] : []
      ),
    });
    setPurchaseOrderDraft(null);
  };

  const changePurchaseOrderSupplier = (supplier: string) => {
    const firstItem = items.find((item) => item.supplier === supplier);
    setPurchaseOrderDraft({
      supplier,
      lines: firstItem ? [{ ingredientId: firstItem.id, quantity: '10' }] : [],
    });
  };

  const addPurchaseOrderLine = () => {
    if (!purchaseOrderDraft) return;
    const item = items.find(
      (entry) =>
        entry.supplier === purchaseOrderDraft.supplier &&
        !purchaseOrderDraft.lines.some((line) => line.ingredientId === entry.id)
    );
    if (!item) {
      onNotify('All ingredients from this supplier are already included.');
      return;
    }
    setPurchaseOrderDraft((current) =>
      current
        ? { ...current, lines: [...current.lines, { ingredientId: item.id, quantity: '10' }] }
        : current
    );
  };

  const updatePurchaseOrderLine = (
    index: number,
    updates: Partial<PurchaseOrderDraft['lines'][number]>
  ) => {
    setPurchaseOrderDraft((current) =>
      current
        ? {
            ...current,
            lines: current.lines.map((line, lineIndex) =>
              lineIndex === index ? { ...line, ...updates } : line
            ),
          }
        : current
    );
  };

  const removePurchaseOrderLine = (index: number) => {
    setPurchaseOrderDraft((current) =>
      current && current.lines.length > 1
        ? { ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }
        : current
    );
  };

  const openReceivePurchaseOrderDialog = (purchaseOrder: PurchaseOrder) => {
    const line = purchaseOrder.lines.find((entry) => entry.receivedQuantity < entry.orderedQuantity);
    if (!line) {
      onNotify('This purchase order has no outstanding items to receive.');
      return;
    }
    const remaining = line.orderedQuantity - line.receivedQuantity;
    setReceivePurchaseOrderDraft({
      purchaseOrderId: purchaseOrder.id,
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
      maxQuantity: remaining,
      quantity: String(remaining),
    });
  };

  const handleReceivePurchaseOrder = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!receivePurchaseOrderDraft) return;
    const quantity = Number(receivePurchaseOrderDraft.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > receivePurchaseOrderDraft.maxQuantity) {
      onNotify(`Enter a quantity greater than zero and no more than ${receivePurchaseOrderDraft.maxQuantity}.`);
      return;
    }
    void onReceivePurchaseOrder({
      purchaseOrderId: receivePurchaseOrderDraft.purchaseOrderId,
      receivedLines: [{
        ingredientId: receivePurchaseOrderDraft.ingredientId,
        quantity,
      }],
    });
    setReceivePurchaseOrderDraft(null);
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
              className="px-3 py-2 rounded-lg bg-surface-container-high text-primary text-xs font-semibold flex items-center gap-1 hover:bg-secondary-container hover:text-on-secondary-container cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">table_view</span>
              <span className="hidden sm:inline">Excel</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenAdd}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold shadow-md hover:bg-secondary hover:text-on-secondary transition-all active:scale-95 cursor-pointer"
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
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container font-medium'
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

      {/* Search + KPI Grid */}
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
              className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-1 focus:ring-primary shadow-inner"
            />
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
                : 'bg-surface-container-low hover:bg-secondary-container/70'
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
                : 'text-on-surface-variant hover:text-on-secondary-container hover:bg-secondary-container'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">sort</span>
          </button>
          <button
            type="button"
            aria-label="Refresh Stock"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="p-2 rounded-md text-on-surface-variant hover:text-on-secondary-container hover:bg-secondary-container disabled:opacity-50 cursor-pointer transition-colors"
          >
            <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
          {activeTab === 'Suppliers' && (
            <button
              type="button"
              onClick={handleOpenAddSupplier}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-secondary hover:text-on-secondary transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Supplier
            </button>
          )}
        </div>
      </div>

      {/* Suppliers Tab View vs Ingredient Rows */}
      {activeTab === 'Purchase Orders' ? (
        <div className="space-y-3">
          {purchaseOrders.length === 0 ? (
            <p className="p-8 rounded-2xl bg-surface-container-low border border-outline-variant/15 text-sm text-on-surface-variant text-center">
              No purchase orders yet.
            </p>
          ) : purchaseOrders.map((purchaseOrder) => (
            <div key={purchaseOrder.id} className="p-4 sm:p-5 rounded-2xl bg-surface-container-low border border-outline-variant/15 hover:border-secondary/50 shadow-md space-y-3 transition-all">
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
                  onClick={() => openReceivePurchaseOrderDialog(purchaseOrder)}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary hover:bg-secondary hover:text-on-secondary text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  Receive Stock
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const item = items[0];
              if (!item) {
                onNotify('Add an ingredient before creating a purchase order.');
                return;
              }
              openPurchaseOrderDialog(item.supplier, item);
            }}
            className="w-full py-3 rounded-2xl bg-primary text-on-primary hover:bg-secondary hover:text-on-secondary text-sm font-bold shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>Create Purchase Order</span>
          </button>
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
                onClick={() => openPurchaseOrderDialog(supplier, vendorItems[0])}
                className="w-full py-2 rounded-xl liquid-glass-pill text-primary text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 hover:border-secondary/60 hover:text-secondary"
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
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              {registeringSupplier ? 'Add Supplier & Ingredients' : 'Add Raw Ingredient'}
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              {registeringSupplier
                ? 'Register a supplier and add one or more ingredients they provide.'
                : 'Add a tracked SKU with minimum threshold alert and supplier details.'}
            </DialogDescription>
          </DialogHeader>
          {registeringSupplier ? (
            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Supplier Name
                </label>
                <input
                  type="text"
                  {...supplierForm.register('supplier')}
                  placeholder="Supplier name"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {supplierForm.formState.errors.supplier && (
                  <p className="text-[11px] text-error mt-1">
                    {supplierForm.formState.errors.supplier.message}
                  </p>
                )}
              </div>

              <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                {supplierIngredientFields.fields.map((field, index) => (
                  <div key={field.id} className="p-3 rounded-xl border border-outline-variant/25 bg-surface-container-low space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-on-surface">Ingredient {index + 1}</span>
                      {supplierIngredientFields.fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => supplierIngredientFields.remove(index)}
                          className="text-xs font-semibold text-error hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                        Ingredient Name
                      </label>
                      <input
                        type="text"
                        {...supplierForm.register(`ingredients.${index}.name`)}
                        placeholder="Ingredient name"
                        className="w-full px-3 py-2.5 rounded-lg bg-surface-container text-on-surface text-sm placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      {supplierForm.formState.errors.ingredients?.[index]?.name && (
                        <p className="text-[11px] text-error mt-1">
                          {supplierForm.formState.errors.ingredients[index]?.name?.message}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                          Opening Stock
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          {...supplierForm.register(`ingredients.${index}.quantity`)}
                          className="w-full px-3 py-2.5 rounded-lg bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                          Unit
                        </label>
                        <select
                          {...supplierForm.register(`ingredients.${index}.unit`)}
                          className="w-full px-3 py-2.5 rounded-lg bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="L">L</option>
                          <option value="ml">ml</option>
                          <option value="pcs">pcs</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                          Low Alert
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          {...supplierForm.register(`ingredients.${index}.minThreshold`)}
                          className="w-full px-3 py-2.5 rounded-lg bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  supplierIngredientFields.append({
                    name: '',
                    quantity: 5,
                    unit: 'kg',
                    minThreshold: 1,
                    unitCost: 180,
                  })
                }
                className="w-full py-2.5 rounded-lg border border-dashed border-outline-variant/50 text-primary text-sm font-semibold hover:bg-secondary-container hover:text-on-secondary-container transition-colors cursor-pointer"
              >
                + Add another ingredient
              </button>

              {supplierForm.formState.errors.root?.server?.message && (
                <p role="alert" className="text-xs text-error">
                  {supplierForm.formState.errors.root.server.message}
                </p>
              )}
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddModalOpen(false);
                    setRegisteringSupplier(false);
                  }}
                  className="flex-1 py-3 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-secondary-container hover:text-on-secondary-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={supplierForm.formState.isSubmitting}
                  className="flex-1 py-3 rounded-lg bg-primary text-on-primary text-sm font-bold shadow-md hover:bg-secondary hover:text-on-secondary disabled:opacity-60 transition-colors cursor-pointer"
                >
                  {supplierForm.formState.isSubmitting ? 'Saving…' : 'Add Supplier & Ingredients'}
                </button>
              </div>
            </form>
          ) : (
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
                    Supplier Name
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
                onClick={() => {
                  setAddModalOpen(false);
                  setRegisteringSupplier(false);
                }}
                className="flex-1 py-3 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-secondary-container hover:text-on-secondary-container transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 rounded-lg bg-primary text-on-primary text-sm font-bold shadow-md hover:bg-secondary hover:text-on-secondary transition-colors cursor-pointer"
              >
                {registeringSupplier ? 'Add Supplier' : 'Save Item'}
              </button>
            </div>
          </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={purchaseOrderDraft !== null}
        onOpenChange={(open) => {
          if (!open) setPurchaseOrderDraft(null);
        }}
      >
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Create Purchase Order
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Add one or more ingredients supplied by the same vendor.
            </DialogDescription>
          </DialogHeader>
          {purchaseOrderDraft && (
            <form onSubmit={handleCreatePurchaseOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Supplier
                </label>
                <select
                  value={purchaseOrderDraft.supplier}
                  onChange={(event) => changePurchaseOrderSupplier(event.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {supplierGroups.map(([supplier]) => (
                    <option key={supplier} value={supplier}>{supplier}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                {purchaseOrderDraft.lines.map((line, index) => {
                  const supplierItems = items.filter(
                    (item) =>
                      item.supplier === purchaseOrderDraft.supplier &&
                      !purchaseOrderDraft.lines.some(
                        (otherLine, otherIndex) =>
                          otherIndex !== index && otherLine.ingredientId === item.id
                      )
                  );
                  return (
                    <div key={`${line.ingredientId}-${index}`} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] items-end gap-2 p-3 rounded-xl bg-surface-container-low">
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                          Ingredient {index + 1}
                        </label>
                        <select
                          value={line.ingredientId}
                          onChange={(event) =>
                            updatePurchaseOrderLine(index, { ingredientId: event.target.value })
                          }
                          className="w-full px-3 py-2.5 rounded-lg bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          {supplierItems.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                          Quantity
                        </label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={line.quantity}
                          onChange={(event) =>
                            updatePurchaseOrderLine(index, { quantity: event.target.value })
                          }
                          className="w-full px-3 py-2.5 rounded-lg bg-surface-container text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ingredient ${index + 1}`}
                        disabled={purchaseOrderDraft.lines.length === 1}
                        onClick={() => removePurchaseOrderLine(index)}
                        className="h-10 px-3 rounded-lg text-error hover:bg-error-container/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={
                  purchaseOrderDraft.lines.length >=
                  items.filter((item) => item.supplier === purchaseOrderDraft.supplier).length
                }
                onClick={addPurchaseOrderLine}
                className="w-full py-2.5 rounded-lg border border-dashed border-outline-variant/50 text-primary text-sm font-semibold hover:bg-secondary-container hover:text-on-secondary-container disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                + Add another ingredient
              </button>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPurchaseOrderDraft(null)}
                  className="flex-1 py-3 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-secondary-container hover:text-on-secondary-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-lg bg-primary text-on-primary text-sm font-bold shadow-md hover:bg-secondary hover:text-on-secondary transition-colors cursor-pointer"
                >
                  Create Purchase Order
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={receivePurchaseOrderDraft !== null}
        onOpenChange={(open) => {
          if (!open) setReceivePurchaseOrderDraft(null);
        }}
      >
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">Receive Stock</DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Enter the received quantity for {receivePurchaseOrderDraft?.ingredientName}.
            </DialogDescription>
          </DialogHeader>
          {receivePurchaseOrderDraft && (
            <form onSubmit={handleReceivePurchaseOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Quantity received (maximum {receivePurchaseOrderDraft.maxQuantity})
                </label>
                <input
                  autoFocus
                  type="number"
                  min="0.1"
                  max={receivePurchaseOrderDraft.maxQuantity}
                  step="0.1"
                  value={receivePurchaseOrderDraft.quantity}
                  onChange={(event) =>
                    setReceivePurchaseOrderDraft({
                      ...receivePurchaseOrderDraft,
                      quantity: event.target.value,
                    })
                  }
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReceivePurchaseOrderDraft(null)}
                  className="flex-1 py-3 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold hover:bg-secondary-container hover:text-on-secondary-container transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-lg bg-primary text-on-primary text-sm font-bold shadow-md hover:bg-secondary hover:text-on-secondary transition-colors cursor-pointer"
                >
                  Receive Stock
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
