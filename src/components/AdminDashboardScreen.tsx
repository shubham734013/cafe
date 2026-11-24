import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Calendar,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  Clock,
  Coffee,
  Coins,
  CreditCard,
  DollarSign,
  Download,
  Edit,
  Eye,
  EyeOff,
  Filter,
  Flame,
  Image as ImageIcon,
  LayoutDashboard,
  Minus,
  Package,
  Plus,
  QrCode,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CafeImage } from './CafeImage';
import { MenuItemStockControlModal } from './MenuItemStockControlModal';
import type { z } from 'zod';
import type { addMenuItemSchema, createOrderSchema } from '../shared/schemas';
import {
  CafeActivityLogItem,
  CafeOrder,
  CafeTable,
  CustomerProfile,
  DateRangeKey,
  InventoryIngredient,
  MenuItem,
  StaffMember,
  StaffScreenId,
} from '../types/cafe';
import {
  buildPast7DaysRevenueTrend,
  computeDashboardMetrics,
  formatINR,
  getLowInventoryItems,
} from '../utils/cafeLogic';

interface AdminDashboardScreenProps {
  orders: CafeOrder[];
  inventory: InventoryIngredient[];
  tables?: CafeTable[];
  activityLog?: CafeActivityLogItem[];
  customers?: CustomerProfile[];
  menuItems?: MenuItem[];
  staffRoster?: StaffMember[];
  isConnected?: boolean;
  onRestockItem?: (id: string) => void;
  onNavigateStaff: (screen: StaffScreenId) => void;
  onExportCsv: () => void;
  onAddMenuItem?: (input: z.infer<typeof addMenuItemSchema>) => Promise<void>;
  onUpdateMenuItem?: (id: string, updates: Partial<MenuItem>) => Promise<void>;
  onToggleMenuAvailability?: (id: string) => Promise<void>;
  onCreateCounterOrder?: (
    input: z.infer<typeof createOrderSchema>,
    paidBy?: 'cash' | 'card' | 'upi'
  ) => Promise<CafeOrder>;
  onPayCounterOrder?: (orderId: string, paymentMode?: 'cash' | 'card' | 'upi') => Promise<void>;
}

const DATE_RANGES: DateRangeKey[] = ['Today', 'Last 7 Days', 'This Month', 'Quarter to Date'];

const CATEGORIES = [
  'Burgers',
  'Pizza',
  'Maggi',
  'Sandwiches',
  'Special Bread Pizza',
  'Fries & Momos',
  'Cold Coffee',
  'Shakes',
  'Hot Beverages',
  'Combos',
  'Beverages',
  'Snacks',
  'Meals',
  'Desserts',
] as const;

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  orders,
  inventory,
  activityLog = [],
  customers = [],
  menuItems = [],
  isConnected = false,
  onRestockItem,
  onNavigateStaff,
  onExportCsv,
  onAddMenuItem,
  onUpdateMenuItem,
  onToggleMenuAvailability,
  onCreateCounterOrder,
  onPayCounterOrder,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'menu'>('overview');
  const [dateRange, setDateRange] = useState<DateRangeKey>('Last 7 Days');
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  // Default is 'orders' (All Events removed as requested)
  const [activityFilter, setActivityFilter] = useState<'orders' | 'refunds' | 'stock'>('orders');

  // Menu Search & Filter
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockControlOpen, setStockControlOpen] = useState(false);

  const outOfStockCount = useMemo(
    () => menuItems.filter((i) => i.isAvailable === false).length,
    [menuItems]
  );

  // Add Product Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<(typeof CATEGORIES)[number]>('Burgers');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductPrepTime, setNewProductPrepTime] = useState('10');
  const [newProductIsVeg, setNewProductIsVeg] = useState(true);
  const [newProductStation, setNewProductStation] = useState<'Barista' | 'Grill' | 'Fryer' | 'Cold Bar' | 'Kitchen'>('Kitchen');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductImageUrl, setNewProductImageUrl] = useState('');
  const [uploadingAddPhoto, setUploadingAddPhoto] = useState(false);
  const [newProductRecipe, setNewProductRecipe] = useState<
    Array<{ ingredientId: string; amount: number; amountUnit?: 'g' | 'kg' | 'ml' | 'L' | 'pcs' }>
  >([]);

  // Edit Product Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string>('Burgers');
  const [editPrice, setEditPrice] = useState('');
  const [editStation, setEditStation] = useState<'Barista' | 'Grill' | 'Fryer' | 'Cold Bar' | 'Kitchen'>('Kitchen');
  const [editIsVeg, setEditIsVeg] = useState(true);
  const [editIsAvailable, setEditIsAvailable] = useState(true);
  const [editIsBestSeller, setEditIsBestSeller] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editDefaultNote, setEditDefaultNote] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [uploadingEditPhoto, setUploadingEditPhoto] = useState(false);
  const [editVariants, setEditVariants] = useState<Array<{ size: string; price: number }>>([]);

  const handlePhotoUpload = async (
    file: File,
    onSuccess: (url: string) => void,
    setLoading: (l: boolean) => void
  ) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        try {
          const res = await fetch('/api/menu/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64, fileName: file.name }),
          });
          if (res.ok) {
            const data = await res.json();
            onSuccess(data.imageUrl);
          } else {
            onSuccess(base64);
          }
        } catch {
          onSuccess(base64);
        } finally {
          setLoading(false);
        }
      };
      reader.onerror = () => {
        setLoading(false);
        alert('Failed to read image file.');
      };
      reader.readAsDataURL(file);
    } catch {
      setLoading(false);
    }
  };

  const handleOpenEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditPrice(String(item.price));
    setEditStation(item.station || 'Kitchen');
    setEditIsVeg(item.isVeg !== false);
    setEditIsAvailable(item.isAvailable !== false);
    setEditIsBestSeller(Boolean(item.isBestSeller));
    setEditDescription(item.description || '');
    setEditDefaultNote(item.defaultNote || '');
    setEditImageUrl(item.imageUrl || '');
    setEditVariants(item.variants ? item.variants.map((v) => ({ ...v })) : []);
    setEditModalOpen(true);
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editName.trim() || !editPrice) return;
    setSubmittingEdit(true);
    try {
      const validVariants = editVariants
        .filter((v) => v.size.trim().length > 0 && Number(v.price) > 0)
        .map((v) => ({ size: v.size.trim(), price: Number(v.price) }));

      await onUpdateMenuItem?.(editingItem.id, {
        name: editName.trim(),
        category: editCategory as any,
        price: Number(editPrice),
        station: editStation,
        isVeg: editIsVeg,
        isAvailable: editIsAvailable,
        isBestSeller: editIsBestSeller,
        description: editDescription.trim(),
        defaultNote: editDefaultNote.trim(),
        imageUrl: editImageUrl.trim(),
        variants: validVariants,
      });
      setEditModalOpen(false);
      setEditingItem(null);
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Settle Payment Modal State (for unpaid counter orders)
  const [settleOrder, setSettleOrder] = useState<CafeOrder | null>(null);
  const [settlePaidBy, setSettlePaidBy] = useState<'cash' | 'upi' | 'card'>('cash');
  const [submittingSettle, setSubmittingSettle] = useState(false);

  const unpaidCounterOrders = useMemo(() => {
    return orders.filter((o) => o.paymentStatus === 'unpaid' && o.status !== 'cancelled');
  }, [orders]);

  const handleSettleSubmit = async () => {
    if (!settleOrder || !onPayCounterOrder) return;
    setSubmittingSettle(true);
    try {
      await onPayCounterOrder(settleOrder.id, settlePaidBy);
      setSettleOrder(null);
    } catch {
      // Handled by toast
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Computed metrics
  const metrics = useMemo(() => computeDashboardMetrics(orders, dateRange), [orders, dateRange]);

  const filteredActivities = useMemo(() => {
    return activityLog.filter((act) => {
      if (activityFilter === 'orders') {
        return (
          act.type === 'order_created' ||
          act.type === 'order_paid' ||
          act.type === 'order_advanced'
        );
      }
      if (activityFilter === 'refunds') return act.type === 'order_refunded';
      if (activityFilter === 'stock') return act.type === 'stock_updated';
      return true;
    });
  }, [activityLog, activityFilter]);

  const topItems = useMemo(() => {
    const sales = new Map<string, { name: string; quantity: number; category?: string; revenue: number }>();
    for (const order of orders) {
      if (
        order.status === 'cancelled' ||
        order.paymentStatus === 'cancelled' ||
        order.paymentStatus === 'refunded'
      ) continue;
      for (const line of order.items) {
        const existing = sales.get(line.menuItemId);
        sales.set(line.menuItemId, {
          name: line.name,
          quantity: (existing?.quantity ?? 0) + line.quantity,
          category: menuItems.find((item) => item.id === line.menuItemId)?.category,
          revenue: (existing?.revenue ?? 0) + line.price * line.quantity,
        });
      }
    }
    return [...sales.entries()]
      .map(([id, item]) => ({ id, ...item }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [menuItems, orders]);

  const sevenDayTrend = useMemo(() => buildPast7DaysRevenueTrend(orders), [orders]);
  const lowInventoryItems = useMemo(() => getLowInventoryItems(inventory), [inventory]);
  // Filtered menu items for Menu tab
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesSearch =
        menuSearch.trim() === '' ||
        item.name.toLowerCase().includes(menuSearch.toLowerCase().trim()) ||
        item.category.toLowerCase().includes(menuSearch.toLowerCase().trim());
      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [menuItems, menuSearch, selectedCategory]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim() || !newProductPrice) return;
    if (inventory.length > 0 && newProductRecipe.length === 0) {
      return;
    }
    if (newProductRecipe.some((line) => line.amount <= 0 || !line.ingredientId)) {
      return;
    }
    setSubmittingProduct(true);
    try {
      await onAddMenuItem?.({
        name: newProductName.trim(),
        category: newProductCategory,
        price: Number(newProductPrice),
        isVeg: newProductIsVeg,
        isBestSeller: false,
        station: newProductStation,
        description: newProductDescription.trim(),
        imageUrl: newProductImageUrl.trim(),
        defaultNote: 'Freshly prepared',
        recipe: newProductRecipe.map((line) => {
          const ing = inventory.find((item) => item.id === line.ingredientId);
          const resolvedUnit =
            line.amountUnit ||
            (ing?.unit === 'kg' ? 'g' : ing?.unit === 'L' ? 'ml' : (ing?.unit as any) || 'pcs');
          return {
            ingredientId: line.ingredientId,
            amount: Number(line.amount),
            amountUnit: resolvedUnit,
          };
        }),
      });
      setAddModalOpen(false);
      setNewProductName('');
      setNewProductPrice('');
      setNewProductDescription('');
      setNewProductRecipe([]);
    } catch {
      // Error handled by parent toast
    } finally {
      setSubmittingProduct(false);
    }
  };

  return (
    <div className="admin-dashboard-theme flex flex-col w-full pb-10 space-y-5">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-[#D4AF37]/60 shadow-md shrink-0 bg-black p-0.5">
            <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface font-sans">
              The Sawariya Cafe
            </h1>
            <p className="text-xs text-on-surface-variant flex items-center gap-2">
              <span className="text-[#FF6422] font-semibold">Admin Console</span>
              <span>•</span>
              <span>{menuItems.length} menu products active</span>
            </p>
          </div>
        </div>

        {/* Header Action Tools */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Main Tab Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-surface-container-high border border-outline-variant text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Overview</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('menu')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'menu'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>Menu &amp; Products</span>
            </button>
          </div>

          {/* Order on Counter Button (opens Billing Counter POS) */}
          <button
            type="button"
            onClick={() => onNavigateStaff('pos-terminal')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Order on Counter</span>
          </button>

          {/* 86 / Stock Control Quick Button */}
          {onToggleMenuAvailability && (
            <button
              type="button"
              onClick={() => setStockControlOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <EyeOff className="w-4 h-4 text-rose-400" />
              <span>86 / Stock Control</span>
              {outOfStockCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                  {outOfStockCount}
                </span>
              )}
            </button>
          )}

          {/* Add Product Button */}
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>

          {/* Date Range Selector */}
          <div className="relative inline-block text-left">
            <button
              type="button"
              onClick={() => setDateDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface text-xs font-medium shadow-sm transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-on-surface-variant" />
              <span>{dateRange}</span>
              <ChevronDown className="w-3.5 h-3.5 text-on-surface-variant ml-0.5" />
            </button>

            {dateDropdownOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-xl bg-surface-container-low border border-outline-variant shadow-xl z-30 p-1.5 space-y-0.5">
                {DATE_RANGES.map((range) => (
                  <button
                    key={range}
                    type="button"
                    onClick={() => {
                      setDateRange(range);
                      setDateDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      dateRange === range
                        ? 'text-primary bg-primary/10 font-semibold'
                        : 'text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {range}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export Report */}
          <button
            type="button"
            onClick={onExportCsv}
            title="Download CSV"
            className="p-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Executive KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* 1. Net Sales / Total Revenue */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface-variant">Net Revenue (Sales)</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface tabular-nums">
                  {formatINR(metrics.totalRevenue)}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-medium">
                  <TrendingUp className="w-3 h-3" />
                  <span>After Refunds ({formatINR(metrics.grossSales)} Gross)</span>
                </div>
              </div>
            </div>

            {/* 2. Total Refunds (DEDICATED REFUND CARD) */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-rose-500/30 shadow-sm liquid-glass-card flex flex-col justify-between space-y-3 bg-gradient-to-br from-rose-950/30 via-slate-900/90 to-slate-900/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400">Total Refunds</span>
                <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <RotateCcw className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-rose-300 tabular-nums">
                  {formatINR(metrics.refundedAmount)}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-rose-400 font-medium">
                  <span>{metrics.refundedCount} {metrics.refundedCount === 1 ? 'Order' : 'Orders'} Refunded</span>
                </div>
              </div>
            </div>

            {/* 3. Total Orders */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface-variant">Active Paid Orders</span>
                <div className="w-8 h-8 rounded-lg bg-[#FF6422]/10 border border-[#FF6422]/20 flex items-center justify-center text-[#FF6422]">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface tabular-nums">
                  {metrics.totalOrders.toLocaleString('en-IN')}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-medium">
                  <TrendingUp className="w-3 h-3" />
                  <span>Settled & Delivered</span>
                </div>
              </div>
            </div>

            {/* 4. Average Order Value */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface-variant">Avg. Order Value</span>
                <div className="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface tabular-nums">
                  {formatINR(metrics.avgOrderValue)}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-on-surface-variant font-medium">
                  <span>Target: {formatINR(320)}</span>
                </div>
              </div>
            </div>

            {/* 5. Total Customers */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface-variant">Customers Served</span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-on-surface tabular-nums">
                  {metrics.customers.toLocaleString('en-IN')}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-medium">
                  <TrendingUp className="w-3 h-3" />
                  <span>Unique Customers</span>
                </div>
              </div>
            </div>
          </div>

          {/* Refund Notice Banner if any orders were refunded */}
          {metrics.refundedCount > 0 && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-950/50 via-slate-900 to-slate-900 border border-rose-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <RotateCcw className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-rose-200">
                    Refunds Deducted: {formatINR(metrics.refundedAmount)} across {metrics.refundedCount} {metrics.refundedCount === 1 ? 'order' : 'orders'}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Live revenue display reflects Net Sales ({formatINR(metrics.totalRevenue)}) after deducting all customer refund claims.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivityFilter('refunds')}
                className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-bold shrink-0 transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-center"
              >
                <span>View Refund Audit</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Charts & Analytics Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Revenue Trend Area Chart */}
            <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-on-surface">Revenue Performance</h2>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">Last 7 days daily sales</p>
                </div>
                <span className="text-xs font-bold text-[#FF6422] bg-[#FF6422]/10 px-2.5 py-1 rounded-full border border-[#FF6422]/20">
                  {metrics.peakLabel}
                </span>
              </div>

              <div className="h-60 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sevenDayTrend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6422" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#FF6422" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="var(--color-outline-variant)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke="var(--color-on-surface-variant)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="var(--color-on-surface-variant)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 shadow-xl space-y-1">
                            <p className="text-[11px] font-medium text-slate-400">{data.day}</p>
                            <p className="text-sm font-bold text-slate-100 tabular-nums">{formatINR(data.revenue)}</p>
                            <p className="text-[11px] text-[#FF6422]">{data.ordersCount} orders</p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#FF6422"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#revenueGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Selling Dishes */}
            <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-[#FF6422]" />
                    <h2 className="text-sm font-semibold text-on-surface">Top Sellers</h2>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">Most Ordered</span>
                </div>

                <div className="divide-y divide-outline-variant/60 mt-2">
                  {topItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-on-surface-variant">
                      No sales recorded yet.
                    </div>
                  ) : (
                    topItems.map((item, idx) => (
                      <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-bold text-on-surface-variant w-4">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-on-surface truncate">{item.name}</p>
                            <span className="text-[10px] text-on-surface-variant">{item.category || 'Kitchen'}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-on-surface tabular-nums">{item.quantity} sold</p>
                          <p className="text-[10px] text-emerald-400 font-medium tabular-nums">{formatINR(item.revenue)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('menu')}
                className="w-full py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium border border-outline-variant transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>View Full Menu</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Operations Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigateStaff('pos-terminal')}
              className="p-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="truncate">Billing Counter</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateStaff('kitchen-display-system')}
              className="p-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 text-secondary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ChefHat className="w-4 h-4" />
              </div>
              <span className="truncate">Kitchen Screen</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateStaff('order-management')}
              className="p-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Receipt className="w-4 h-4" />
              </div>
              <span className="truncate">All Orders</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateStaff('inventory-stock')}
              className="p-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant text-on-surface text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 text-secondary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Package className="w-4 h-4" />
              </div>
              <span className="truncate">Stock &amp; Inventory</span>
            </button>
          </div>

          {/* Bottom Grid: Live Orders Stream & Low Stock Warning */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Live Operational Activity Stream (Defaults to 'orders' - No 'All Events') */}
            <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-outline-variant">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-on-surface-variant" />
                  <h2 className="text-sm font-semibold text-on-surface">Recent Orders &amp; Activity</h2>
                </div>

                {/* Filter buttons: 'orders' by default, plus 'refunds' and 'stock' */}
                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'orders', label: 'Orders' },
                      { id: 'refunds', label: 'Refunds' },
                      { id: 'stock', label: 'Stock' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActivityFilter(tab.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        activityFilter === tab.id
                          ? 'bg-[#FF6422] text-white font-semibold'
                          : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Unsettled Counter Bills Banner */}
              {unpaidCounterOrders.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-200">
                        {unpaidCounterOrders.length} Pending Counter {unpaidCounterOrders.length === 1 ? 'Bill' : 'Bills'}
                      </p>
                      <p className="text-[11px] text-amber-400/80">
                        Total: {formatINR(unpaidCounterOrders.reduce((s, o) => s + o.total, 0))}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {unpaidCounterOrders.slice(0, 3).map((unpaid) => (
                      <div
                        key={unpaid.id}
                        className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-surface-container-high border border-secondary/30 text-xs shrink-0"
                      >
                        <span className="font-bold text-on-surface">{unpaid.kotNumber}</span>
                        <span className="text-secondary font-semibold">{formatINR(unpaid.total)}</span>
                        {onPayCounterOrder && (
                          <button
                            type="button"
                            onClick={() => {
                              setSettleOrder(unpaid);
                              setSettlePaidBy('cash');
                            }}
                            className="px-2 py-0.5 rounded bg-primary hover:bg-primary/90 text-on-primary text-[10px] font-bold transition-all cursor-pointer shadow-sm"
                          >
                            Paid by...
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filteredActivities.length === 0 ? (
                <div className="py-12 text-center text-xs text-on-surface-variant">
                  No {activityFilter} recorded for this timeframe.
                </div>
              ) : (
                <div className="divide-y divide-outline-variant/60 max-h-72 overflow-y-auto pr-1">
                  {filteredActivities.slice(0, 15).map((act) => {
                    const matchedUnpaid = act.orderId
                      ? unpaidCounterOrders.find((u) => u.id === act.orderId)
                      : undefined;
                    return (
                      <div key={act.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              act.type === 'order_paid'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : act.type === 'order_refunded'
                                ? 'bg-rose-500/10 text-error'
                                : act.type === 'stock_updated'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-sky-500/10 text-secondary'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-on-surface truncate">{act.title}</p>
                            <p className="text-[11px] text-on-surface-variant truncate">{act.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {matchedUnpaid && onPayCounterOrder && (
                            <button
                              type="button"
                              onClick={() => {
                                setSettleOrder(matchedUnpaid);
                                setSettlePaidBy('cash');
                              }}
                              className="px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/15 text-primary border border-primary/20 text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Paid by...
                            </button>
                          )}
                          <span className="text-[11px] text-on-surface-variant font-medium">
                            {act.timestamp
                              ? new Date(act.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Just now'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Low Stock Warning Card */}
            <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-semibold text-on-surface">Stock Alerts</h2>
                  </div>
                  <span className="text-[11px] text-amber-400 font-semibold">
                    {lowInventoryItems.length} low items
                  </span>
                </div>

                <div className="divide-y divide-outline-variant/60 mt-2">
                  {lowInventoryItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-on-surface-variant">
                      All ingredients well stocked.
                    </div>
                  ) : (
                    lowInventoryItems.slice(0, 4).map((ing) => (
                      <div key={ing.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-on-surface truncate">{ing.name}</p>
                          <p className="text-[10px] text-error">
                            {ing.quantity} {ing.unit} remaining
                          </p>
                        </div>
                        {onRestockItem && (
                          <button
                            type="button"
                            onClick={() => onRestockItem(ing.id)}
                            className="px-2.5 py-1 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-[11px] font-semibold text-on-surface transition-colors shrink-0 cursor-pointer"
                          >
                            Restock
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateStaff('inventory-stock')}
                className="w-full py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-medium border border-outline-variant transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Manage Inventory</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      ) : (
        /* Menu & Products Management Tab (New Products feature!) */
        <div className="space-y-4">
          {/* Menu Catalog Controls */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-1 max-w-md">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Search menu..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#FF6422]"
                />
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {['All', ...CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#FF6422] text-white font-semibold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredMenuItems.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm liquid-glass-card flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start gap-3">
                  <CafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    productId={item.id}
                    className="w-14 h-14 rounded-xl object-cover bg-slate-800 shrink-0 border border-slate-700/50"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                        {item.category}
                      </span>
                      <span
                        className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[8px] font-bold ${
                          item.isVeg
                            ? 'border-emerald-500 text-emerald-500'
                            : 'border-rose-500 text-rose-500'
                        }`}
                      >
                        ●
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-on-surface truncate mt-0.5">{item.name}</h3>
                    <p className="text-xs font-bold text-[#FF6422] tabular-nums mt-0.5">₹{item.price}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-on-surface-variant flex items-center gap-1 text-[10px]">
                      <Clock className="w-3 h-3" />
                      <span>{item.station}</span>
                    </span>
                    {item.isBestSeller && (
                      <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1 py-0.2 rounded">
                        ★ Best
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(item)}
                      title="Edit Product Details & Photo"
                      className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Edit className="w-3 h-3 text-[#FF6422]" />
                      <span>Edit</span>
                    </button>

                    {onToggleMenuAvailability && (
                      <button
                        type="button"
                        onClick={() => onToggleMenuAvailability(item.id)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                          item.isAvailable !== false
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {item.isAvailable !== false ? (
                          <>
                            <Eye className="w-3 h-3" />
                            <span>In Stock</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" />
                            <span>86'd Out</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Product Modal (Admin Exclusive) */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#FF6422]" />
              <span>Add New Menu Product</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Set product details and ingredient quantities for 1 piece. Stock will automatically deduct according to order quantity.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateProduct} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Product Name
              </label>
              <input
                type="text"
                required
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g. Hazelnut Cold Brew"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FF6422]"
              />
            </div>

            {/* Category & Price */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Category
                </label>
                <select
                  value={newProductCategory}
                  onChange={(e) => setNewProductCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-[#FF6422]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Price (₹)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={newProductPrice}
                  onChange={(e) => setNewProductPrice(e.target.value)}
                  placeholder="199"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FF6422]"
                />
              </div>
            </div>

            {/* Recipe Ingredients & Quantity in Gms for 1 Pc */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-200 block">
                    Recipe Ingredients (Quantity for 1 Pc)
                  </label>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Order quantity ke according stock auto deduct hoga.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const first = inventory[0];
                    setNewProductRecipe((current) => [
                      ...current,
                      {
                        ingredientId: first?.id || '',
                        amount: first?.unit === 'kg' ? 20 : first?.unit === 'L' ? 200 : 1,
                        amountUnit: first?.unit === 'kg' ? 'g' : first?.unit === 'L' ? 'ml' : (first?.unit as any) || 'pcs',
                      },
                    ]);
                  }}
                  disabled={inventory.length === 0}
                  className="px-2.5 py-1 rounded-lg bg-[#FF6422]/15 border border-[#FF6422]/30 text-[11px] font-bold text-[#FF6422] hover:bg-[#FF6422]/25 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  + Add Ingredient
                </button>
              </div>

              {inventory.length === 0 ? (
                <p className="p-2.5 rounded-xl border border-slate-800/80 bg-slate-900/60 text-[11px] text-slate-400">
                  Add inventory ingredients first to define this product&apos;s recipe.
                </p>
              ) : newProductRecipe.length === 0 ? (
                <p className="p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-[11px] text-amber-300">
                  ⚠️ Add at least one ingredient so stock auto-deducts when customer orders.
                </p>
              ) : (
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {newProductRecipe.map((line, index) => {
                    const ingredient = inventory.find((item) => item.id === line.ingredientId);
                    const unitBadge =
                      ingredient?.unit === 'kg'
                        ? 'gms / 1 pc'
                        : ingredient?.unit === 'L'
                        ? 'ml / 1 pc'
                        : `${ingredient?.unit || 'pcs'} / 1 pc`;

                    // Sample calculation for 5 orders
                    const sampleQty = 5;
                    const sampleBurn =
                      ingredient?.unit === 'kg'
                        ? `${line.amount * sampleQty >= 1000 ? `${(line.amount * sampleQty / 1000).toFixed(2)} kg` : `${line.amount * sampleQty} g`}`
                        : ingredient?.unit === 'L'
                        ? `${line.amount * sampleQty >= 1000 ? `${(line.amount * sampleQty / 1000).toFixed(2)} L` : `${line.amount * sampleQty} ml`}`
                        : `${line.amount * sampleQty} ${ingredient?.unit || 'pcs'}`;

                    return (
                      <div key={`${line.ingredientId}-${index}`} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                        <div className="grid grid-cols-[1fr_125px_30px] gap-2 items-center">
                          <select
                            value={line.ingredientId}
                            onChange={(event) => {
                              const newId = event.target.value;
                              const matched = inventory.find((i) => i.id === newId);
                              setNewProductRecipe((current) =>
                                current.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        ingredientId: newId,
                                        amount: matched?.unit === 'kg' ? 20 : matched?.unit === 'L' ? 200 : 1,
                                        amountUnit: matched?.unit === 'kg' ? 'g' : matched?.unit === 'L' ? 'ml' : (matched?.unit as any) || 'pcs',
                                      }
                                    : entry
                                )
                              );
                            }}
                            className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-medium focus:outline-none focus:border-[#FF6422]"
                          >
                            {inventory.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ({item.quantity} {item.unit} in stock)
                              </option>
                            ))}
                          </select>

                          <div className="relative">
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              required
                              value={line.amount}
                              onChange={(event) => {
                                const val = Number(event.target.value);
                                setNewProductRecipe((current) =>
                                  current.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? { ...entry, amount: val }
                                      : entry
                                  )
                                );
                              }}
                              className="w-full pl-2 pr-14 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 font-bold tabular-nums focus:outline-none focus:border-[#FF6422]"
                            />
                            <span className="absolute right-2 top-2 text-[10px] font-semibold text-[#FF6422] pointer-events-none">
                              {unitBadge}
                            </span>
                          </div>

                          <button
                            type="button"
                            aria-label="Remove ingredient"
                            onClick={() =>
                              setNewProductRecipe((current) =>
                                current.filter((_, entryIndex) => entryIndex !== index)
                              )
                            }
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                          <span>
                            1 pc: <strong className="text-slate-200">{line.amount} {unitBadge.split('/')[0].trim()}</strong>
                          </span>
                          <span className="text-emerald-400 font-medium">
                            ⚡ 5 pcs order burns {sampleBurn}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Dietary
                </label>
                <button
                  type="button"
                  onClick={() => setNewProductIsVeg((v) => !v)}
                  className={`w-full py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    newProductIsVeg
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {newProductIsVeg ? 'Pure Veg' : 'Non-Veg'}
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Prep Time
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={newProductPrepTime}
                  onChange={(e) => setNewProductPrepTime(e.target.value)}
                  placeholder="10 min"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-[#FF6422]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Station
                </label>
                <select
                  value={newProductStation}
                  onChange={(e) => setNewProductStation(e.target.value as any)}
                  className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-[#FF6422]"
                >
                  <option value="Barista">Barista</option>
                  <option value="Kitchen">Kitchen</option>
                  <option value="Grill">Grill</option>
                  <option value="Fryer">Fryer</option>
                  <option value="Cold Bar">Cold Bar</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={newProductDescription}
                onChange={(e) => setNewProductDescription(e.target.value)}
                placeholder="Freshly roasted beans with rich hazelnut flavor..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FF6422]"
              />
            </div>

            {/* Product Photo Upload - Real File Upload (No Presets!) */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Product Photo
              </label>
              {newProductImageUrl ? (
                <div className="relative group rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 p-2 flex items-center gap-3">
                  <img
                    src={newProductImageUrl}
                    alt="New product preview"
                    className="w-16 h-16 rounded-xl object-cover bg-slate-800 shrink-0 border border-slate-700"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-bold text-slate-200 truncate">Photo attached</p>
                    <p className="text-[10px] text-slate-400">Custom photo will be saved with product</p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 cursor-pointer transition-colors">
                        <Upload className="w-3 h-3 text-[#FF6422]" />
                        <span>Change Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(file, setNewProductImageUrl, setUploadingAddPhoto);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewProductImageUrl('')}
                        className="px-2 py-1 rounded-lg text-[11px] font-medium text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {uploadingAddPhoto && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center gap-2 text-xs font-semibold text-slate-200">
                      <span className="w-4 h-4 border-2 border-[#FF6422] border-t-transparent rounded-full animate-spin" />
                      <span>Uploading photo...</span>
                    </div>
                  )}
                </div>
              ) : (
                <label className="relative border-2 border-dashed border-slate-700 hover:border-[#FF6422] bg-slate-950/60 rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file, setNewProductImageUrl, setUploadingAddPhoto);
                    }}
                  />
                  <div className="w-10 h-10 rounded-full bg-slate-800 group-hover:bg-[#FF6422]/15 flex items-center justify-center text-slate-400 group-hover:text-[#FF6422] transition-colors mb-2">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-200">Upload Product Photo</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Choose file from device gallery or camera (PNG, JPG, WebP)</p>
                  {uploadingAddPhoto && (
                    <div className="absolute inset-0 bg-slate-950/90 rounded-2xl flex items-center justify-center gap-2 text-xs font-semibold text-slate-200">
                      <span className="w-4 h-4 border-2 border-[#FF6422] border-t-transparent rounded-full animate-spin" />
                      <span>Uploading photo...</span>
                    </div>
                  )}
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingProduct}
                className="px-5 py-2 rounded-xl bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {submittingProduct ? 'Adding...' : 'Add Product'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Product Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#FF6422]/15 border border-[#FF6422]/30 text-[#FF6422] flex items-center justify-center">
                <Edit className="w-4 h-4" />
              </div>
              <span>Edit Product: {editingItem?.name}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Update pricing, category, station, stock, veg/non-veg status, and upload new product photo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEditProduct} className="space-y-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Product Name *
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Product name"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FF6422]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Category *
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-[#FF6422]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Selling Price (₹) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="e.g. 149"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FF6422]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Dietary
                </label>
                <button
                  type="button"
                  onClick={() => setEditIsVeg((v) => !v)}
                  className={`w-full py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    editIsVeg
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  {editIsVeg ? 'Pure Veg' : 'Non-Veg'}
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Stock Status
                </label>
                <button
                  type="button"
                  onClick={() => setEditIsAvailable((a) => !a)}
                  className={`w-full py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    editIsAvailable
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {editIsAvailable ? 'In Stock' : "86'd Out"}
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Station
                </label>
                <select
                  value={editStation}
                  onChange={(e) => setEditStation(e.target.value as any)}
                  className="w-full px-2 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-[#FF6422]"
                >
                  <option value="Barista">Barista</option>
                  <option value="Kitchen">Kitchen</option>
                  <option value="Grill">Grill</option>
                  <option value="Fryer">Fryer</option>
                  <option value="Cold Bar">Cold Bar</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={editIsBestSeller}
                  onChange={(e) => setEditIsBestSeller(e.target.checked)}
                  className="rounded border-slate-700 text-[#FF6422] focus:ring-[#FF6422]"
                />
                <span>Mark as Bestseller / Chef's Special</span>
              </label>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Description (Optional)
              </label>
              <textarea
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Delicious details about this dish..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FF6422]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Default Kitchen Note (Optional)
              </label>
              <input
                type="text"
                value={editDefaultNote}
                onChange={(e) => setEditDefaultNote(e.target.value)}
                placeholder="e.g. Medium spicy, Extra dip"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FF6422]"
              />
            </div>

            {/* Custom Sizes & Pricing (Variants) */}
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-slate-200 block">
                    Custom Sizes &amp; Prices (Optional)
                  </label>
                  <p className="text-[10px] text-slate-400">
                    Define custom sizes (e.g. Regular, Large, Half, Full) with specific prices.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditVariants((prev) => [
                      ...prev,
                      { size: prev.length === 0 ? 'Regular' : prev.length === 1 ? 'Large' : 'Extra Large', price: Number(editPrice) || 99 },
                    ])
                  }
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 text-[#FF6422] text-xs font-bold transition-colors cursor-pointer"
                >
                  + Add Size
                </button>
              </div>

              {editVariants.length > 0 && (
                <div className="space-y-2 pt-1">
                  {editVariants.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={v.size}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditVariants((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, size: val } : item))
                          );
                        }}
                        placeholder="Size name (e.g. Regular)"
                        className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#FF6422]"
                      />
                      <div className="relative w-28">
                        <span className="absolute left-2.5 top-1.5 text-xs text-slate-400">₹</span>
                        <input
                          type="number"
                          min={1}
                          value={v.price}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditVariants((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, price: val } : item))
                            );
                          }}
                          placeholder="Price"
                          className="w-full pl-6 pr-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono focus:outline-none focus:border-[#FF6422]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditVariants((prev) => prev.filter((_, i) => i !== idx))}
                        className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Product Photo Upload - Real File Upload (No Presets!) */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Product Photo
              </label>
              {editImageUrl ? (
                <div className="relative group rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 p-2 flex items-center gap-3">
                  <img
                    src={editImageUrl}
                    alt="Edit product preview"
                    className="w-16 h-16 rounded-xl object-cover bg-slate-800 shrink-0 border border-slate-700"
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-bold text-slate-200 truncate">Photo attached</p>
                    <p className="text-[10px] text-slate-400">Custom photo uploaded for this item</p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 cursor-pointer transition-colors">
                        <Upload className="w-3 h-3 text-[#FF6422]" />
                        <span>Change Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(file, setEditImageUrl, setUploadingEditPhoto);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setEditImageUrl('')}
                        className="px-2 py-1 rounded-lg text-[11px] font-medium text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  {uploadingEditPhoto && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center gap-2 text-xs font-semibold text-slate-200">
                      <span className="w-4 h-4 border-2 border-[#FF6422] border-t-transparent rounded-full animate-spin" />
                      <span>Uploading photo...</span>
                    </div>
                  )}
                </div>
              ) : (
                <label className="relative border-2 border-dashed border-slate-700 hover:border-[#FF6422] bg-slate-950/60 rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file, setEditImageUrl, setUploadingEditPhoto);
                    }}
                  />
                  <div className="w-10 h-10 rounded-full bg-slate-800 group-hover:bg-[#FF6422]/15 flex items-center justify-center text-slate-400 group-hover:text-[#FF6422] transition-colors mb-2">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-200">Upload Product Photo</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Choose file from device gallery or camera (PNG, JPG, WebP)</p>
                  {uploadingEditPhoto && (
                    <div className="absolute inset-0 bg-slate-950/90 rounded-2xl flex items-center justify-center gap-2 text-xs font-semibold text-slate-200">
                      <span className="w-4 h-4 border-2 border-[#FF6422] border-t-transparent rounded-full animate-spin" />
                      <span>Uploading photo...</span>
                    </div>
                  )}
                </label>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingEdit || uploadingEditPhoto}
                className="px-5 py-2 rounded-xl bg-[#FF6422] hover:bg-[#E55518] text-white text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {submittingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Settle Payment Modal for Unpaid Counter Orders */}
      <Dialog open={Boolean(settleOrder)} onOpenChange={(open) => !open && setSettleOrder(null)}>
        <DialogContent className="max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <Banknote className="w-4 h-4" />
              </div>
              <span>Record Counter Payment</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Select how the customer paid for Order #{settleOrder?.kotNumber}.
            </DialogDescription>
          </DialogHeader>

          {settleOrder && (
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Order Slip:</span>
                <span className="font-bold text-slate-200">{settleOrder.kotNumber}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Service:</span>
                <span className="font-semibold text-slate-300">
                  {settleOrder.tableNumber ? `Table ${settleOrder.tableNumber}` : 'Takeaway'}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-slate-800">
                <span className="text-slate-200">Amount Due:</span>
                <span className="text-emerald-400 tabular-nums">
                  {formatINR(settleOrder.total)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Paid By:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSettlePaidBy('cash')}
                className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  settlePaidBy === 'cash'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Banknote className="w-4 h-4 text-emerald-400" />
                <span>Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setSettlePaidBy('upi')}
                className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  settlePaidBy === 'upi'
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300 ring-1 ring-sky-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <QrCode className="w-4 h-4 text-sky-400" />
                <span>UPI QR</span>
              </button>

              <button
                type="button"
                onClick={() => setSettlePaidBy('card')}
                className={`py-2 px-1 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  settlePaidBy === 'card'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300 ring-1 ring-purple-500/40'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <CreditCard className="w-4 h-4 text-purple-400" />
                <span>Card</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSettleOrder(null)}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submittingSettle}
              onClick={handleSettleSubmit}
              className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {submittingSettle ? 'Saving...' : 'Mark Paid'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Menu Item Stock Control (86 / In Stock) Dialog */}
      {onToggleMenuAvailability && (
        <MenuItemStockControlModal
          open={stockControlOpen}
          onOpenChange={setStockControlOpen}
          menuItems={menuItems}
          onToggleAvailability={onToggleMenuAvailability}
          onEditItem={handleOpenEditModal}
          roleLabel="Admin"
        />
      )}
    </div>
  );
};
