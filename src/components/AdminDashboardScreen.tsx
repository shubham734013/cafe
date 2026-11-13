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
  CafeOrder,
  DailyRevenuePoint,
  DateRangeKey,
  InventoryIngredient,
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
  onRestockItem,
  onNavigateStaff,
  onExportCsv,
}) => {
  const [dateRange, setDateRange] = useState<DateRangeKey>('Last 7 Days');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const metrics = computeDashboardMetrics(orders, dateRange);
  const topItems = [...MENU_ITEMS].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 4);
  const sevenDayTrend = useMemo(() => buildPast7DaysRevenueTrend(orders), [orders]);
  const sevenDayTotal = useMemo(
    () => sevenDayTrend.reduce((acc, d) => acc + d.revenue, 0),
    [sevenDayTrend]
  );
  const sevenDayAverage = Math.round(sevenDayTotal / Math.max(1, sevenDayTrend.length));
  const lowInventoryItems = useMemo(() => getLowInventoryItems(inventory), [inventory]);

  const liveKotCount = orders.filter((o) => o.status !== 'served').length;

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
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl text-on-surface font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-on-surface-variant flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
            Store Overview · Live Updates
          </p>
        </div>

        <div className="relative inline-block text-left">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-bright active:scale-95 transition-all text-xs font-semibold shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-primary-container">
              calendar_month
            </span>
            <span>{dateRange}</span>
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
              expand_more
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl bg-surface-container-highest shadow-xl z-30 p-1 space-y-0.5">
              {DATE_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => {
                    setDateRange(range);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                    dateRange === range
                      ? 'text-primary font-semibold bg-surface-container-high/80'
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-low shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant font-medium">Total Orders</span>
            <span className="w-6 h-6 rounded-lg bg-primary-container/15 flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined text-[15px]">shopping_bag</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl text-on-surface font-bold tracking-tight tabular-nums">
              {metrics.totalOrders.toLocaleString('en-IN')}
            </span>
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary text-[11px] font-semibold">
              <span className="material-symbols-outlined text-[12px]">north</span>{' '}
              {metrics.ordersDelta}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-low shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant font-medium">Revenue</span>
            <span className="w-6 h-6 rounded-lg bg-tertiary/15 flex items-center justify-center text-tertiary">
              <span className="material-symbols-outlined text-[15px]">payments</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1">
            <span className="text-base sm:text-xl text-on-surface font-bold tracking-tight tabular-nums">
              {formatINR(metrics.totalRevenue)}
            </span>
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary text-[11px] font-semibold shrink-0">
              <span className="material-symbols-outlined text-[12px]">north</span>{' '}
              {metrics.revDelta}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-low shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant font-medium">
              Avg. Order Value
            </span>
            <span className="w-6 h-6 rounded-lg bg-secondary-container/20 flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[15px]">receipt</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl text-on-surface font-bold tracking-tight tabular-nums">
              {formatINR(metrics.avgOrderValue)}
            </span>
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary text-[11px] font-semibold">
              <span className="material-symbols-outlined text-[12px]">north</span>{' '}
              {metrics.aovDelta}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-low shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant font-medium">Customers</span>
            <span className="w-6 h-6 rounded-lg bg-primary-fixed-dim/20 flex items-center justify-center text-primary-fixed-dim">
              <span className="material-symbols-outlined text-[15px]">group</span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl text-on-surface font-bold tracking-tight tabular-nums">
              {metrics.customers.toLocaleString('en-IN')}
            </span>
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary text-[11px] font-semibold">
              <span className="material-symbols-outlined text-[12px]">north</span>{' '}
              {metrics.custDelta}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop 2-col Chart + Top Items */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Sales Overview Chart Card */}
        <div className="lg:col-span-7 p-4 rounded-xl bg-surface-container-low shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-tertiary animate-pulse shadow-[0_0_8px_rgba(81,231,123,0.8)]" />
              <h2 className="text-base text-on-surface font-semibold">Sales Overview</h2>
            </div>
            <div className="flex items-center gap-1.5 bg-surface-container-high px-2.5 py-0.5 rounded-full">
              <span className="text-[11px] text-tertiary font-bold tabular-nums">
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
                  <stop offset="0%" stopColor="#51e77b" stopOpacity="0.32" />
                  <stop offset="60%" stopColor="#51e77b" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#51e77b" stopOpacity="0.0" />
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
                stroke="#51e77b"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />

              {chartPoints.map((pt, i) => (
                <circle
                  key={pt.shortLabel}
                  cx={pt.x}
                  cy={pt.y}
                  fill={i === chartPoints.length - 1 ? '#51e77b' : '#17120f'}
                  r={i === chartPoints.length - 1 ? 4.5 : 3}
                  stroke="#51e77b"
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

      {/* Daily Revenue Trend (Recharts — Past 7 Days Order Totals) */}
      <section
        aria-label="Daily Revenue Trend"
        className="p-4 rounded-xl bg-surface-container-low shadow-md space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-tertiary/15 text-tertiary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">show_chart</span>
            </div>
            <div>
              <h2 className="text-base text-on-surface font-semibold leading-tight">
                Daily Revenue Trend
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
                        </div>
                        <p className="text-[11px] text-on-surface-variant truncate">
                          Supplier: {item.supplier}
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

      {/* CafeOS Management Modules */}
      <div className="space-y-2">
        <span className="text-base text-on-surface font-semibold block px-0.5">
          CafeOS Management Modules
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {[
            {
              id: 'table-layout' as StaffScreenId,
              label: 'Table Management',
              sub: '3 floors · Live status',
              icon: 'table_restaurant',
              tone: 'text-primary',
            },
            {
              id: 'inventory-stock' as StaffScreenId,
              label: 'Inventory & Stock',
              sub: 'Stock levels & vendors',
              icon: 'inventory_2',
              tone: 'text-error',
            },
            {
              id: 'crm-customers' as StaffScreenId,
              label: 'CRM & Customers',
              sub: 'VIP segments & notes',
              icon: 'groups',
              tone: 'text-tertiary',
            },
            {
              id: 'loyalty-rewards' as StaffScreenId,
              label: 'Loyalty & Rewards',
              sub: 'Points, tiers & ledger',
              icon: 'stars',
              tone: 'text-primary',
            },
            {
              id: 'offers-campaigns' as StaffScreenId,
              label: 'Offers & Campaigns',
              sub: 'Promos & broadcasts',
              icon: 'local_offer',
              tone: 'text-secondary',
            },
            {
              id: 'staff-roles' as StaffScreenId,
              label: 'Staff & Roles',
              sub: 'Shifts & access PINs',
              icon: 'badge',
              tone: 'text-tertiary',
            },
            {
              id: 'reports-analytics' as StaffScreenId,
              label: 'Reports & Analytics',
              sub: 'Revenue & staff metrics',
              icon: 'insights',
              tone: 'text-primary',
            },
            {
              id: 'settings-cafe-profile' as StaffScreenId,
              label: 'Settings & Profile',
              sub: 'GSTIN, hours & printers',
              icon: 'settings',
              tone: 'text-secondary',
            },
          ].map((mod) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => onNavigateStaff(mod.id)}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-left transition-all active:scale-[0.98] cursor-pointer"
            >
              <div
                className={`w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center shrink-0 ${mod.tone}`}
              >
                <span className="material-symbols-outlined text-[19px]">{mod.icon}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-on-surface truncate">{mod.label}</p>
                <p className="text-[11px] text-on-surface-variant truncate">{mod.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Live Pulse Barista Operational Banner */}
      <div className="p-3.5 rounded-xl bg-surface-container-low flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-tertiary/15 flex items-center justify-center text-tertiary shrink-0">
            <span className="material-symbols-outlined text-[18px]">broadcast_on_home</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-on-surface font-semibold">Peak Rush Hour Active</span>
            <span className="text-xs text-on-surface-variant">
              Table 3, 5 &amp; Counter Queue in sync
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigateStaff('kitchen-display-system')}
          className="px-2.5 py-1 rounded-md bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-semibold tabular-nums cursor-pointer"
        >
          KOT: {liveKotCount} Live
        </button>
      </div>
    </div>
  );
};
