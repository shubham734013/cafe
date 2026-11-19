import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MENU_ITEMS } from '../data/cafeSeedData';
import {
  CafeActivityLogItem,
  CafeOrder,
  CafeTable,
  CustomerProfile,
  DailyRevenuePoint,
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
  onRestockItem?: (id: string) => void;
  onNavigateStaff: (screen: StaffScreenId) => void;
  onExportCsv: () => void;
}

const DATE_RANGES: DateRangeKey[] = ['Today', 'Last 7 Days', 'This Month', 'Quarter to Date'];

interface RevenueTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyRevenuePoint }>;
}

const RevenueTooltip: React.FC<RevenueTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl bg-surface-container-highest px-3 py-2 shadow-2xl border border-outline-variant/25 space-y-0.5">
      <p className="text-[11px] font-semibold text-on-surface-variant">{point.day}</p>
      <p className="text-sm font-bold text-tertiary tabular-nums">{formatINR(point.revenue)}</p>
      <p className="text-[11px] text-primary tabular-nums">{point.ordersCount} orders</p>
    </div>
  );
};

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  orders,
  inventory,
  tables = [],
  activityLog = [],
  customers = [],
  menuItems = [],
  staffRoster = [],
  onRestockItem,
  onNavigateStaff,
  onExportCsv,
}) => {
  const [dateRange, setDateRange] = useState<DateRangeKey>('Last 7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'orders' | 'refunds' | 'stock'>('all');

  const metrics = useMemo(() => computeDashboardMetrics(orders, dateRange), [orders, dateRange]);
  const filteredActivities = useMemo(() => {
    return activityLog.filter((act) => {
      if (activityFilter === 'all') return true;
      if (activityFilter === 'orders')
        return (
          act.type === 'order_created' ||
          act.type === 'order_paid' ||
          act.type === 'order_advanced'
        );
      if (activityFilter === 'refunds') return act.type === 'order_refunded';
      if (activityFilter === 'stock') return act.type === 'stock_updated';
      return true;
    });
  }, [activityLog, activityFilter]);
  const topItems = useMemo(
    () => [...(menuItems.length > 0 ? menuItems : MENU_ITEMS)].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 4),
    [menuItems]
  );
  const sevenDayTrend = useMemo(() => buildPast7DaysRevenueTrend(orders), [orders]);
  const sevenDayTotal = useMemo(
    () => sevenDayTrend.reduce((acc, d) => acc + d.revenue, 0),
    [sevenDayTrend]
  );
  const sevenDayAverage = Math.round(sevenDayTotal / Math.max(1, sevenDayTrend.length));
  const lowInventoryItems = useMemo(() => getLowInventoryItems(inventory), [inventory]);

  const liveKotCount = useMemo(
    () => orders.filter((o) => o.status !== 'served').length,
    [orders]
  );
  const floorSyncSummary = useMemo(() => {
    const occupiedTables = tables.filter((t) => t.status === 'occupied').map((t) => t.id);
    const reservedCount = tables.filter((t) => t.status === 'reserved').length;
    if (occupiedTables.length > 0) {
      return `${occupiedTables.slice(0, 3).join(', ')}${occupiedTables.length > 3 ? ` +${occupiedTables.length - 3}` : ''} active · ${reservedCount} reserved`;
    }
    return `${tables.length > 0 ? `${tables.length} tables synced` : 'Floor synced'} · Counter Queue ready`;
  }, [tables]);

  // Build SVG polyline points cleanly from metrics.bars
  const maxAmount = Math.max(...metrics.bars.map((b) => b.amount), 1);
  const chartPoints = metrics.bars.map((b, i) => {
    const x =
      metrics.bars.length === 1
        ? 180
        : 35 + (i * (330 - 35)) / (metrics.bars.length - 1);
    const y = 112 - Math.round((b.amount / maxAmount) * 82);
    return { x, y, ...b };
  });
  const polylineStr = chartPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const polygonStr = `35,122 ${polylineStr} 330,122`;

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Top Bar: Title & Date Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-on-surface tracking-tight">Dashboard</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-black inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Sync Active</span>
            </span>
          </div>
          <p className="text-xs text-on-surface-variant flex items-center gap-2 mt-1">
            <span className="text-[#FF6422] font-bold">{liveKotCount} KOTs cooking in kitchen</span>
            <span>·</span>
            <span>{floorSyncSummary}</span>
          </p>
        </div>

        <div className="relative inline-block text-left shrink-0">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 text-on-surface hover:text-[#FF6422] active:scale-95 transition-all text-xs font-bold shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-[#FF6422]">
              calendar_month
            </span>
            <span>{dateRange}</span>
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
              expand_more
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-surface-container border border-outline-variant/20 shadow-2xl z-30 p-1.5 space-y-0.5">
              {DATE_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => {
                    setDateRange(range);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    dateRange === range
                      ? 'text-[#FF6422] font-bold bg-[#FF6422]/15'
                      : 'text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI Grid (2x2 on mobile, 4 cols on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="flex flex-col justify-between p-4 sm:p-5 rounded-3xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm transition-all min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-on-surface-variant font-bold truncate">
              Total Orders
            </span>
            <span className="w-8 h-8 rounded-full bg-[#FF6422]/15 flex items-center justify-center text-[#FF6422] shrink-0">
              <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-1">
            <span className="text-lg sm:text-2xl text-on-surface font-black tracking-tight tabular-nums">
              {metrics.totalOrders.toLocaleString('en-IN')}
            </span>
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-black shrink-0">
              <span className="material-symbols-outlined text-[12px]">north</span>{' '}
              {metrics.ordersDelta}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 sm:p-5 rounded-3xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm transition-all min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-on-surface-variant font-bold truncate">
              Order Value
            </span>
            <span className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
              <span className="material-symbols-outlined text-[18px]">payments</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-1">
            <span className="text-base sm:text-2xl text-on-surface font-black tracking-tight tabular-nums truncate">
              {formatINR(metrics.totalRevenue)}
            </span>
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-black shrink-0">
              <span className="material-symbols-outlined text-[12px]">north</span>{' '}
              {metrics.revDelta}
            </span>
          </div>
          {metrics.refundedCount > 0 && (
            <p className="text-[10px] text-red-400 font-semibold mt-1 truncate">
              {metrics.refundedCount} refund ({formatINR(metrics.refundedAmount)}) deducted
            </p>
          )}
        </div>

        <div className="flex flex-col justify-between p-4 sm:p-5 rounded-3xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm transition-all min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-on-surface-variant font-bold truncate">
              Avg. Order Value
            </span>
            <span className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <span className="material-symbols-outlined text-[18px]">receipt</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-1">
            <span className="text-lg sm:text-2xl text-on-surface font-black tracking-tight tabular-nums">
              {formatINR(metrics.avgOrderValue)}
            </span>
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-black shrink-0">
              <span className="material-symbols-outlined text-[12px]">north</span>{' '}
              {metrics.aovDelta}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-4 sm:p-5 rounded-3xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm transition-all min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-on-surface-variant font-bold truncate">
              Customers
            </span>
            <span className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400 shrink-0">
              <span className="material-symbols-outlined text-[18px]">group</span>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-1">
            <span className="text-lg sm:text-2xl text-on-surface font-black tracking-tight tabular-nums">
              {metrics.customers.toLocaleString('en-IN')}
            </span>
            <span className="flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-black shrink-0">
              <span className="material-symbols-outlined text-[12px]">north</span>{' '}
              {metrics.custDelta}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop 2-col Chart + Top Items */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Sales Overview Chart Card */}
        <div className="lg:col-span-7 p-5 rounded-3xl bg-surface-container hover:bg-surface-container-high border border-outline-variant/15 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF6422] animate-pulse shadow-[0_0_8px_rgba(255,100,34,0.8)]" />
              <h2 className="text-base text-on-surface font-black">Sales Overview</h2>
            </div>
            <div className="flex items-center gap-1.5 bg-[#FF6422]/15 px-3 py-1 rounded-full border border-[#FF6422]/20">
              <span className="text-[11px] text-[#FF6422] font-black tabular-nums">
                {metrics.peakLabel}
              </span>
            </div>
          </div>

          <div className="relative w-full h-48 select-none pt-1">
            <svg
              className="w-full h-full overflow-visible"
              preserveAspectRatio="none"
              viewBox="0 0 340 140"
            >
              <defs>
                <linearGradient id="cafeGreenGlow" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="#FF6422" stopOpacity="0.35" />
                  <stop offset="60%" stopColor="#FF6422" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#FF6422" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <g stroke="#3a3430" strokeDasharray="2 3" strokeWidth="0.75">
                <line x1="30" x2="335" y1="20" y2="20" />
                <line x1="30" x2="335" y1="60" y2="60" />
                <line x1="30" x2="335" y1="100" y2="100" />
              </g>
              <text
                fill="#a08e7a"
                fontFamily="Inter"
                fontSize="9"
                fontWeight="500"
                textAnchor="end"
                x="24"
                y="24"
              >
                {Math.round(maxAmount / 1000)}K
              </text>
              <text
                fill="#a08e7a"
                fontFamily="Inter"
                fontSize="9"
                fontWeight="500"
                textAnchor="end"
                x="24"
                y="64"
              >
                {Math.round((maxAmount * 0.66) / 1000)}K
              </text>
              <text
                fill="#a08e7a"
                fontFamily="Inter"
                fontSize="9"
                fontWeight="500"
                textAnchor="end"
                x="24"
                y="104"
              >
                {Math.round((maxAmount * 0.33) / 1000)}K
              </text>
              <text
                fill="#534434"
                fontFamily="Inter"
                fontSize="9"
                fontWeight="500"
                textAnchor="end"
                x="24"
                y="125"
              >
                0
              </text>

              <polygon fill="url(#cafeGreenGlow)" points={polygonStr} />
              <polyline
                fill="none"
                points={polylineStr}
                stroke="#FF6422"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />

              {chartPoints.map((pt, i) => (
                <circle
                  key={pt.shortLabel}
                  cx={pt.x}
                  cy={pt.y}
                  fill={i === chartPoints.length - 1 ? '#FF6422' : '#17120f'}
                  r={i === chartPoints.length - 1 ? 4.5 : 3}
                  stroke="#FF6422"
                  strokeWidth="2"
                />
              ))}
            </svg>

            <div className="flex justify-between pl-8 pr-1 mt-1 text-on-surface-variant text-[10px] select-none">
              {chartPoints.map((pt, i) => (
                <span
                  key={pt.shortLabel}
                  className={i === chartPoints.length - 1 ? 'text-tertiary font-bold' : ''}
                >
                  {pt.shortLabel}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Top Items Leaderboard */}
        <div className="lg:col-span-5 p-4 rounded-xl bg-surface-container-low shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-container text-[20px]">
                local_fire_department
              </span>
              <h2 className="text-base text-on-surface font-semibold">Top Items</h2>
            </div>
            <span className="text-[11px] text-on-surface-variant">By Units Sold</span>
          </div>

          <div className="space-y-2">
            {topItems.map((item, idx) => {
              const iconMap = ['blender', 'lunch_dining', 'coffee', 'fastfood'];
              const badgeColor = [
                'bg-primary-container/20 text-primary-container',
                'bg-secondary-container/20 text-secondary',
                'bg-primary-fixed/20 text-primary',
                'bg-tertiary-container/20 text-tertiary',
              ];
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${badgeColor[idx]}`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{iconMap[idx]}</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-on-surface font-semibold truncate">
                        {item.name}
                      </span>
                      <span className="text-xs text-on-surface-variant truncate">
                        {item.category} · {item.station}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm font-bold text-primary tabular-nums">
                      {item.unitsSold}
                    </span>
                    <span className="text-[11px] text-on-surface-variant">sold</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Daily Order Value Trend */}
      <section
        aria-label="Daily Order Value Trend"
        className="p-4 rounded-xl bg-surface-container-low shadow-md space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-tertiary/15 text-tertiary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">show_chart</span>
            </div>
            <div>
              <h2 className="text-base text-on-surface font-semibold leading-tight">
                Daily Order Value Trend
              </h2>
              <p className="text-[11px] text-on-surface-variant">
                Past 7 Days · Daily Order Totals (INR)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-2.5 py-1 rounded-lg bg-surface-container text-[11px] text-on-surface-variant">
              7d Total:{' '}
              <span className="font-bold text-on-surface tabular-nums">
                {formatINR(sevenDayTotal)}
              </span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-surface-container-high text-[11px] text-on-surface-variant">
              Avg / Day:{' '}
              <span className="font-bold text-tertiary tabular-nums">
                {formatINR(sevenDayAverage)}
              </span>
            </div>
          </div>
        </div>

        <div className="w-full h-60 min-w-0">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart
              data={sevenDayTrend}
              margin={{ top: 10, right: 14, left: 2, bottom: 4 }}
            >
              <CartesianGrid stroke="#3a3430" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="shortLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#a08e7a', fontSize: 11 }}
                dy={6}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={48}
                tick={{ fill: '#a08e7a', fontSize: 11 }}
                tickFormatter={(val: number) =>
                  val === 0 ? '₹0' : `₹${Math.round(val / 1000)}k`
                }
              />
              <Tooltip
                content={<RevenueTooltip />}
                cursor={{ stroke: '#f0b65e', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name="Order Total"
                stroke="#51e77b"
                strokeWidth={2.75}
                dot={{ r: 4, fill: '#17120f', stroke: '#51e77b', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#51e77b', stroke: '#17120f', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Low Stock Alerts Summary Card (Below Minimum Threshold) */}
      <section
        aria-label="Low Stock Alerts"
        className="p-4 rounded-xl bg-surface-container-low shadow-md space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                lowInventoryItems.length > 0
                  ? 'bg-error/15 text-error'
                  : 'bg-tertiary/15 text-tertiary'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">
                {lowInventoryItems.length > 0 ? 'warning' : 'inventory_2'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base text-on-surface font-semibold leading-tight">
                  Low Stock Alerts
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                    lowInventoryItems.length > 0
                      ? 'bg-error/15 text-error'
                      : 'bg-tertiary/15 text-tertiary'
                  }`}
                >
                  {lowInventoryItems.length > 0
                    ? `${lowInventoryItems.length} Below Min`
                    : 'All Healthy'}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Ingredients currently below minimum stock threshold
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateStaff('inventory-stock')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-semibold text-primary transition-colors cursor-pointer"
          >
            <span>Open Inventory</span>
            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
          </button>
        </div>

        {lowInventoryItems.length === 0 ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container text-xs">
            <div className="flex items-center gap-2 text-tertiary font-medium">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              <span>All {inventory.length} tracked ingredients are above minimum thresholds.</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {lowInventoryItems.map((item) => {
              const isCritical = item.status === 'Critical';
              const deficit = Number((item.minThreshold - item.quantity).toFixed(1));
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-surface-container flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isCritical
                            ? 'bg-error/15 text-error'
                            : 'bg-primary-container/20 text-primary-container'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[19px]">{item.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-on-surface truncate">
                            {item.name}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isCritical
                                ? 'bg-error/15 text-error'
                                : 'bg-primary-container/20 text-primary-container'
                            }`}
                          >
                            {item.status}
                          </span>
                          {item.reorderRequested && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">notification_important</span>
                              Kitchen Alert
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-on-surface-variant truncate">
                          {item.reorderNote ? `Note: ${item.reorderNote}` : `Supplier: ${item.supplier}`}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          isCritical ? 'text-error' : 'text-primary-container'
                        }`}
                      >
                        {item.quantity} {item.unit}
                      </p>
                      <p className="text-[11px] text-on-surface-variant tabular-nums">
                        Min: {item.minThreshold} {item.unit} (-{deficit})
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isCritical ? 'bg-error' : 'bg-primary-container'
                        }`}
                        style={{ width: `${Math.max(8, Math.min(100, item.fillPct))}%` }}
                      />
                    </div>
                    {onRestockItem && (
                      <button
                        type="button"
                        onClick={() => onRestockItem(item.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                          isCritical
                            ? 'bg-error text-on-error hover:opacity-90'
                            : 'bg-primary-container/20 text-primary hover:bg-primary-container/30'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">add_circle</span>
                        <span>Restock</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Operational Quick Actions Grid */}
      <div className="space-y-2 pt-1">
        <span className="text-base text-on-surface font-semibold block px-0.5">
          Quick Admin Actions
        </span>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => onNavigateStaff('pos-terminal')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-primary-container text-on-primary font-bold text-sm shadow-md hover:bg-primary transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-7 h-7 rounded-md bg-on-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
            </div>
            <span className="truncate">Open POS</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateStaff('kitchen-display-system')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-high text-on-surface font-semibold text-sm shadow-sm hover:bg-surface-bright transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-7 h-7 rounded-md bg-surface-variant flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[18px]">countertops</span>
            </div>
            <span className="truncate">KOT Monitor</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateStaff('order-management')}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-high text-on-surface font-semibold text-sm shadow-sm hover:bg-surface-bright transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-7 h-7 rounded-md bg-surface-variant flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            </div>
            <span className="truncate">View Orders</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-high text-on-surface font-semibold text-sm shadow-sm hover:bg-surface-bright transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="w-7 h-7 rounded-md bg-surface-variant flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[18px]">download</span>
            </div>
            <span className="truncate">Export Report</span>
          </button>
        </div>
      </div>

      {/* Live Activity & Audit Trail */}
      <section
        aria-label="Live Activity & Audit Trail"
        className="p-4 rounded-xl bg-surface-container-low shadow-md space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-tertiary/15 text-tertiary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">history</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <h2 className="text-base text-on-surface font-semibold leading-tight">
                  Live Activity &amp; Audit Trail
                </h2>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                Real-time cafe operations, order progression, refunds &amp; stock events
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'all', label: 'All Events' },
                { id: 'orders', label: 'Orders' },
                { id: 'refunds', label: 'Refunds' },
                { id: 'stock', label: 'Stock' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivityFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activityFilter === tab.id
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredActivities.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-surface-container/50 border border-outline-variant/10 text-on-surface-variant text-xs">
            <span className="material-symbols-outlined text-[28px] opacity-40 mb-1 block">
              notifications_off
            </span>
            No recent {activityFilter === 'all' ? '' : activityFilter} activities recorded.
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/15 max-h-80 overflow-y-auto pr-1">
            {filteredActivities.map((act) => {
              const iconMap: Record<string, string> = {
                order_created: 'add_shopping_cart',
                order_paid: 'payments',
                order_refunded: 'currency_exchange',
                order_advanced: 'sync_alt',
                stock_updated: 'inventory_2',
                feedback_received: 'star',
              };
              const colorMap: Record<string, string> = {
                order_created: 'text-primary bg-primary/10',
                order_paid: 'text-tertiary bg-tertiary/10',
                order_refunded: 'text-error bg-error/10',
                order_advanced: 'text-secondary bg-secondary/10',
                stock_updated: 'text-primary-container bg-primary-container/10',
                feedback_received: 'text-amber-400 bg-amber-400/10',
              };
              return (
                <div
                  key={act.id}
                  className="py-2.5 flex items-start justify-between gap-3 first:pt-1 last:pb-1"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        colorMap[act.type] || 'text-on-surface bg-surface-container'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {iconMap[act.type] || 'info'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-on-surface truncate">
                          {act.title}
                        </span>
                        {(act.actorName || (act as { staffName?: string }).staffName) && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-container-high text-on-surface-variant">
                            {act.actorName || (act as { staffName?: string }).staffName}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate">
                        {act.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {act.amount !== undefined && (
                      <span
                        className={`text-xs font-bold block tabular-nums ${
                          act.type === 'order_refunded' ? 'text-error' : 'text-tertiary'
                        }`}
                      >
                        {act.type === 'order_refunded' ? '-' : ''}
                        {formatINR(act.amount)}
                      </span>
                    )}
                    <span className="text-[10px] text-on-surface-variant/80">
                      {new Date(act.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Live Pulse Barista Operational Banner */}
      <div className="p-3.5 rounded-xl bg-surface-container-low flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-tertiary/15 flex items-center justify-center text-tertiary shrink-0">
            <span className="material-symbols-outlined text-[18px]">broadcast_on_home</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-on-surface font-semibold truncate">
              Live Kitchen &amp; Floor Sync
            </span>
            <span className="text-xs text-on-surface-variant truncate">{floorSyncSummary}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigateStaff('kitchen-display-system')}
          className="px-2.5 py-1 rounded-md bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-semibold tabular-nums shrink-0 cursor-pointer"
        >
          KOT: {liveKotCount} Live
        </button>
      </div>
    </div>
  );
};
