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
  Eye,
  EyeOff,
  Filter,
  Flame,
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
  onToggleMenuAvailability?: (id: string) => Promise<void>;
  onCreateCounterOrder?: (
    input: z.infer<typeof createOrderSchema>,
    paidBy?: 'cash' | 'card' | 'upi' | 'pay_later'
  ) => Promise<CafeOrder>;
  onPayCounterOrder?: (orderId: string, paymentMode?: 'cash' | 'card' | 'upi') => Promise<void>;
}

const DATE_RANGES: DateRangeKey[] = ['Today', 'Last 7 Days', 'This Month', 'Quarter to Date'];

const CATEGORIES = [
  'Beverages',
  'Snacks',
  'Meals',
  'Combos',
  'Desserts',
  'Pizza',
  'Burger',
  'Pasta',
  'Salad',
] as const;

const PRESET_IMAGES = [
  { label: 'Coffee', url: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=400&q=80' },
  { label: 'Burger', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80' },
  { label: 'Pizza', url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80' },
  { label: 'Fries', url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=400&q=80' },
  { label: 'Dessert', url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80' },
  { label: 'Mocktail', url: 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?auto=format&fit=crop&w=400&q=80' },
];

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

  // Add Product Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submittingProduct, setSubmittingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState<(typeof CATEGORIES)[number]>('Beverages');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductPrepTime, setNewProductPrepTime] = useState('10');
  const [newProductIsVeg, setNewProductIsVeg] = useState(true);
  const [newProductStation, setNewProductStation] = useState<'Barista' | 'Grill' | 'Fryer' | 'Cold Bar' | 'Kitchen'>('Kitchen');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductImageUrl, setNewProductImageUrl] = useState(PRESET_IMAGES[0].url);

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
      });
      setAddModalOpen(false);
      setNewProductName('');
      setNewProductPrice('');
      setNewProductDescription('');
    } catch {
      // Error handled by parent toast
    } finally {
      setSubmittingProduct(false);
    }
  };

  return (
    <div className="flex flex-col w-full pb-10 space-y-5">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-100 font-sans">
              Admin Console
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <span>{menuItems.length} menu products active</span>
          </p>
        </div>

        {/* Header Action Tools */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Main Tab Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
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
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium shadow-sm transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{dateRange}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
            </button>

            {dateDropdownOpen && (
              <div className="absolute right-0 mt-2 w-44 rounded-xl bg-slate-900 border border-slate-800 shadow-xl z-30 p-1.5 space-y-0.5">
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
                        ? 'text-[#FF6422] bg-[#FF6422]/10 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
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
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Executive KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 1. Total Revenue */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Revenue</span>
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 tabular-nums">
                  {formatINR(metrics.totalRevenue)}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-medium">
                  <TrendingUp className="w-3 h-3" />
                  <span>Today's Total Sales</span>
                </div>
              </div>
            </div>

            {/* 2. Total Orders */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Total Orders</span>
                <div className="w-8 h-8 rounded-lg bg-[#FF6422]/10 border border-[#FF6422]/20 flex items-center justify-center text-[#FF6422]">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 tabular-nums">
                  {metrics.totalOrders.toLocaleString('en-IN')}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-medium">
                  <TrendingUp className="w-3 h-3" />
                  <span>Total Orders Placed</span>
                </div>
              </div>
            </div>

            {/* 3. Average Order Value */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Avg. Order Value</span>
                <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 tabular-nums">
                  {formatINR(metrics.avgOrderValue)}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 font-medium">
                  <span>Target: {formatINR(320)}</span>
                </div>
              </div>
            </div>

            {/* 4. Total Customers */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Customers Served</span>
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 tabular-nums">
                  {metrics.customers.toLocaleString('en-IN')}
                </p>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-medium">
                  <TrendingUp className="w-3 h-3" />
                  <span>Total Customers</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts & Analytics Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Revenue Trend Area Chart */}
            <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">Revenue Performance</h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Last 7 days daily sales</p>
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
                    <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="#64748B"
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
            <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-[#FF6422]" />
                    <h2 className="text-sm font-semibold text-slate-100">Top Sellers</h2>
                  </div>
                  <span className="text-[11px] text-slate-400">Most Ordered</span>
                </div>

                <div className="divide-y divide-slate-800/60 mt-2">
                  {topItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No sales recorded yet.
                    </div>
                  ) : (
                    topItems.map((item, idx) => (
                      <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-bold text-slate-500 w-4">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-200 truncate">{item.name}</p>
                            <span className="text-[10px] text-slate-400">{item.category || 'Kitchen'}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-slate-100 tabular-nums">{item.quantity} sold</p>
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
                className="w-full py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
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
              className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-[#FF6422]/10 border border-[#FF6422]/20 text-[#FF6422] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="truncate">Billing Counter</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateStaff('kitchen-display-system')}
              className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <ChefHat className="w-4 h-4" />
              </div>
              <span className="truncate">Kitchen Screen</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateStaff('order-management')}
              className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Receipt className="w-4 h-4" />
              </div>
              <span className="truncate">All Orders</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateStaff('inventory-stock')}
              className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Package className="w-4 h-4" />
              </div>
              <span className="truncate">Stock &amp; Inventory</span>
            </button>
          </div>

          {/* Bottom Grid: Live Orders Stream & Low Stock Warning */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Live Operational Activity Stream (Defaults to 'orders' - No 'All Events') */}
            <div className="lg:col-span-8 p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-semibold text-slate-100">Recent Orders &amp; Activity</h2>
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
                          : 'bg-slate-800/70 text-slate-400 hover:text-slate-200'
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
                        className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 border border-amber-500/30 text-xs shrink-0"
                      >
                        <span className="font-bold text-slate-200">{unpaid.kotNumber}</span>
                        <span className="text-amber-400 font-semibold">{formatINR(unpaid.total)}</span>
                        {onPayCounterOrder && (
                          <button
                            type="button"
                            onClick={() => {
                              setSettleOrder(unpaid);
                              setSettlePaidBy('cash');
                            }}
                            className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold transition-all cursor-pointer shadow-sm"
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
                <div className="py-12 text-center text-xs text-slate-500">
                  No {activityFilter} recorded for this timeframe.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 max-h-72 overflow-y-auto pr-1">
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
                                ? 'bg-rose-500/10 text-rose-400'
                                : act.type === 'stock_updated'
                                ? 'bg-amber-500/10 text-amber-400'
                                : 'bg-sky-500/10 text-sky-400'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-200 truncate">{act.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">{act.description}</p>
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
                              className="px-2 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Paid by...
                            </button>
                          )}
                          <span className="text-[11px] text-slate-500 font-medium">
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
            <div className="lg:col-span-4 p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-semibold text-slate-100">Stock Alerts</h2>
                  </div>
                  <span className="text-[11px] text-amber-400 font-semibold">
                    {lowInventoryItems.length} low items
                  </span>
                </div>

                <div className="divide-y divide-slate-800/60 mt-2">
                  {lowInventoryItems.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      All ingredients well stocked.
                    </div>
                  ) : (
                    lowInventoryItems.slice(0, 4).map((ing) => (
                      <div key={ing.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200 truncate">{ing.name}</p>
                          <p className="text-[10px] text-rose-400">
                            {ing.quantity} {ing.unit} remaining
                          </p>
                        </div>
                        {onRestockItem && (
                          <button
                            type="button"
                            onClick={() => onRestockItem(ing.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 transition-colors shrink-0 cursor-pointer"
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
                className="w-full py-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
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
                className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-sm flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-14 h-14 rounded-xl object-cover bg-slate-800 shrink-0 border border-slate-700/50"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
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
                    <h3 className="text-xs font-bold text-slate-100 truncate mt-0.5">{item.name}</h3>
                    <p className="text-xs font-bold text-[#FF6422] tabular-nums mt-0.5">₹{item.price}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{item.station}</span>
                  </span>

                  {onToggleMenuAvailability && (
                    <button
                      type="button"
                      onClick={() => onToggleMenuAvailability(item.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
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
            ))}
          </div>
        </div>
      )}

      {/* Add Product Modal (Admin Exclusive) */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#FF6422]" />
              <span>Add New Menu Product</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Create a new dish or beverage to make it instantly available in POS and customer menu.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateProduct} className="space-y-3.5 pt-2">
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

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Photo Preset
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {PRESET_IMAGES.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setNewProductImageUrl(preset.url)}
                    className={`p-1 rounded-lg border text-[10px] font-medium transition-colors cursor-pointer ${
                      newProductImageUrl === preset.url
                        ? 'border-[#FF6422] text-[#FF6422] bg-[#FF6422]/10'
                        : 'border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
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
    </div>
  );
};
