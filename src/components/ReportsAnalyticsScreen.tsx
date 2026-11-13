import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  INVENTORY_REPORT_ITEMS,
  MENU_ITEMS,
  STAFF_PERFORMANCE_ROWS,
} from '../data/cafeSeedData';
import type { YoupiPaymentRecord } from '../payments/types';
import {
  CafeOrder,
  DailyOrderVolumePoint,
  DateRangeKey,
  ReportCategory,
} from '../types/cafe';
import {
  buildPast30DaysOrderVolumeTrend,
  computeDashboardMetrics,
  formatINR,
} from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';

interface ReportsAnalyticsScreenProps {
  orders: CafeOrder[];
  payments?: YoupiPaymentRecord[];
  onExportCsv: () => void;
  onExportExcel?: () => void;
  onDownloadReportPdf?: (args: {
    timeframeLabel: string;
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
  }) => void;
  onNotify: (msg: string) => void;
}

const TIMEFRAMES: { label: string; key: DateRangeKey }[] = [
  { label: 'Today', key: 'Today' },
  { label: 'This Week', key: 'Last 7 Days' },
  { label: 'This Month', key: 'This Month' },
  { label: 'Last 30 Days', key: 'Quarter to Date' },
];

const REPORT_TABS: { id: ReportCategory; icon: string }[] = [
  { id: 'Sales Report', icon: 'payments' },
  { id: 'Item Report', icon: 'inventory_2' },
  { id: 'Inventory Report', icon: 'kitchen' },
  { id: 'Customer Report', icon: 'group' },
  { id: 'Staff Performance', icon: 'badge' },
];

interface OrderVolumeTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyOrderVolumePoint }>;
}

const OrderVolumeTooltip: React.FC<OrderVolumeTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl bg-surface-container-highest px-3 py-2 shadow-2xl border border-outline-variant/25 space-y-0.5">
      <p className="text-[11px] font-semibold text-on-surface-variant">{point.day}</p>
      <p className="text-sm font-bold text-primary tabular-nums">
        {point.ordersCount.toLocaleString('en-IN')} orders
      </p>
      <p className="text-[11px] text-tertiary tabular-nums">{formatINR(point.revenue)}</p>
    </div>
  );
};

export const ReportsAnalyticsScreen: React.FC<ReportsAnalyticsScreenProps> = ({
  orders,
  payments = [],
  onExportCsv,
  onExportExcel,
  onDownloadReportPdf,
  onNotify,
}) => {
  const [timeframeIdx, setTimeframeIdx] = useState(1);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportCategory>('Sales Report');
  const [selectedDay, setSelectedDay] = useState<{ day: string; amount: number } | null>(null);

  const currentTimeframe = TIMEFRAMES[timeframeIdx];
  const metrics = useMemo(
    () => computeDashboardMetrics(orders, currentTimeframe.key),
    [orders, currentTimeframe.key]
  );

  const thirtyDayOrderTrend = useMemo(() => buildPast30DaysOrderVolumeTrend(orders), [orders]);
  const { total30dOrders, avgDaily30dOrders, peak30dDay } = useMemo(() => {
    const sum = thirtyDayOrderTrend.reduce((acc, p) => acc + p.ordersCount, 0);
    const avg = Math.round(sum / Math.max(1, thirtyDayOrderTrend.length));
    const peak =
      thirtyDayOrderTrend.find((p) => p.isPeak) ??
      thirtyDayOrderTrend[thirtyDayOrderTrend.length - 1];
    return { total30dOrders: sum, avgDaily30dOrders: avg, peak30dDay: peak };
  }, [thirtyDayOrderTrend]);

  const peakBar = metrics.bars.find((b) => b.isPeak) || metrics.bars[metrics.bars.length - 1];
  const inspected = selectedDay || { day: peakBar.day, amount: peakBar.amount };

  const {
    upiLive,
    cashLive,
    cardLive,
    upiPct,
    cashPct,
    cardPct,
    pendingSettlementCount,
    youpiReconciledCount,
    channelStats,
    leadingChannelLabel,
    topMenuItem,
  } = useMemo(() => {
    const total = Math.max(1, orders.reduce((s, o) => s + o.total, 0));
    const upi = orders.filter((o) => o.paymentMode === 'upi').reduce((s, o) => s + o.total, 0);
    const cash = orders.filter((o) => o.paymentMode === 'cash').reduce((s, o) => s + o.total, 0);
    const card = orders.filter((o) => o.paymentMode === 'card').reduce((s, o) => s + o.total, 0);
    const uPct = Math.round((upi / total) * 100);
    const cPct = Math.round((cash / total) * 100);
    const dPct = Math.max(0, 100 - uPct - cPct);

    const dineInCount = orders.filter((o) => o.serviceMode === 'dine-in').length;
    const takeawayCount = orders.filter((o) => o.serviceMode === 'takeaway').length;
    const deliveryCount = orders.filter((o) => o.serviceMode === 'delivery').length;
    const totalCount = Math.max(1, orders.length);
    const dineInPct = orders.length === 0 ? 0 : Math.round((dineInCount / totalCount) * 100);
    const takeawayPct = orders.length === 0 ? 0 : Math.round((takeawayCount / totalCount) * 100);
    const deliveryPct = orders.length === 0 ? 0 : Math.max(0, 100 - dineInPct - takeawayPct);

    const channels = [
      { label: `Dine-In (${dineInCount} orders)`, pct: dineInPct, color: 'bg-primary-container', name: 'Dine-In' },
      { label: `Takeaway (${takeawayCount} orders)`, pct: takeawayPct, color: 'bg-secondary-container', name: 'Takeaway' },
      { label: `Online Delivery (${deliveryCount} orders)`, pct: deliveryPct, color: 'bg-outline', name: 'Delivery' },
    ];
    const leader = [...channels].sort((a, b) => b.pct - a.pct)[0];

    const bestItem = [...MENU_ITEMS].sort((a, b) => b.unitsSold - a.unitsSold)[0];

    return {
      upiLive: upi,
      cashLive: cash,
      cardLive: card,
      upiPct: uPct,
      cashPct: cPct,
      cardPct: dPct,
      pendingSettlementCount: orders.filter(
        (o) =>
          o.paymentStatus === 'pending' ||
          o.paymentStatus === 'observed' ||
          o.paymentStatus === 'manual_review'
      ).length,
      youpiReconciledCount: payments.filter((p) => p.status === 'reconciled').length,
      channelStats: channels,
      leadingChannelLabel: orders.length === 0 ? 'No orders yet' : `${leader.name} Leader`,
      topMenuItem: bestItem,
    };
  }, [orders, payments]);

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Screen Header & Timeframe Selector */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary-container">
            <span className="material-symbols-outlined text-[20px]">analytics</span>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-on-surface tracking-tight leading-none">
              Reports &amp; Analytics
            </h1>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Performance insights &amp; revenues
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-semibold shadow-sm active:scale-95 transition-transform cursor-pointer"
          >
            <span className="material-symbols-outlined text-primary-container text-[18px]">
              calendar_today
            </span>
            <span>{currentTimeframe.label}</span>
            <span className="material-symbols-outlined text-outline text-[16px]">
              expand_more
            </span>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-36 bg-surface-container-highest rounded-lg shadow-xl py-1 z-30 flex flex-col">
              {TIMEFRAMES.map((tf, idx) => (
                <button
                  key={tf.label}
                  type="button"
                  onClick={() => {
                    setTimeframeIdx(idx);
                    setSelectedDay(null);
                    setDropdownOpen(false);
                    onNotify(`Timeframe changed to ${tf.label}`);
                  }}
                  className={`px-3 py-1.5 text-left text-xs cursor-pointer ${
                    timeframeIdx === idx
                      ? 'text-primary-container font-bold bg-surface-container-high'
                      : 'text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Horizontal Scrollable Report Categories */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {REPORT_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-primary-container text-on-primary-container font-bold shadow-md'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              <span>{tab.id}</span>
            </button>
          );
        })}
      </div>

      {/* Core Metric Highlights Banner */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3.5 rounded-lg bg-surface-container-low flex flex-col justify-between shadow-sm min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-medium truncate">
              Gross Sales
            </span>
            <span className="flex items-center text-tertiary text-[11px] font-bold shrink-0">
              <span className="material-symbols-outlined text-[14px]">trending_up</span> +
              {metrics.revDelta}
            </span>
          </div>
          <div className="mt-2">
            <span className="text-xl sm:text-2xl text-on-surface font-bold tabular-nums">
              {formatINR(metrics.totalRevenue)}
            </span>
            <p className="text-[11px] text-on-surface-variant mt-0.5 tabular-nums">
              {metrics.totalOrders.toLocaleString('en-IN')} orders completed
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-surface-container-low flex flex-col justify-between shadow-sm min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-medium truncate">
              Avg Order Value
            </span>
            <span className="flex items-center text-tertiary text-[11px] font-bold shrink-0">
              <span className="material-symbols-outlined text-[14px]">arrow_upward</span> +
              {metrics.aovDelta}
            </span>
          </div>
          <div className="mt-2">
            <span className="text-xl sm:text-2xl text-primary-fixed-dim font-bold tabular-nums">
              {formatINR(metrics.avgOrderValue)}
            </span>
            <p className="text-[11px] text-on-surface-variant mt-0.5">
              Highest on evening rush
            </p>
          </div>
        </div>
      </div>

      {/* Conditional Report View */}
      {activeTab === 'Sales Report' && (
        <>
          {/* Daily Sales Interactive Bar Chart */}
          <div className="p-4 rounded-xl bg-surface-container shadow-md flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary-container" />
                  <h2 className="text-base text-on-surface font-bold">Daily Sales</h2>
                </div>
                <span className="text-xs text-on-surface-variant">
                  {currentTimeframe.label} · Interactive breakdown
                </span>
              </div>
              <div className="text-right">
                <span className="text-lg text-primary font-bold tabular-nums">
                  {formatINR(metrics.totalRevenue)}
                </span>
                <span className="block text-[10px] text-tertiary font-medium">
                  Peak: {peakBar.shortLabel}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between bg-surface-container-highest px-3 py-1.5 rounded-md">
              <span className="text-xs text-on-surface-variant">{inspected.day}</span>
              <span className="text-xs text-primary font-bold tabular-nums">
                {formatINR(inspected.amount)}
              </span>
            </div>

            <div className="w-full h-52 min-w-0">
              <ResponsiveContainer width="100%" height={208}>
                <BarChart
                  data={metrics.bars}
                  margin={{ top: 10, right: 8, left: -12, bottom: 2 }}
                  onClick={(state) => {
                    const idx = typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1;
                    if (idx >= 0 && metrics.bars[idx]) {
                      setSelectedDay({ day: metrics.bars[idx].day, amount: metrics.bars[idx].amount });
                    }
                  }}
                >
                  <CartesianGrid stroke="#3a3430" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#d8c3ad', fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#a08e7a', fontSize: 10 }}
                    tickFormatter={(v: number) => (v === 0 ? '0' : `${Math.round(v / 1000)}K`)}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255, 193, 116, 0.08)' }}
                    contentStyle={{
                      backgroundColor: '#2c2521',
                      border: '1px solid rgba(255,193,116,0.25)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: '#ebe0db',
                    }}
                    formatter={(value: unknown) => [formatINR(Number(value ?? 0)), 'Sales']}
                  />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {metrics.bars.map((bar) => (
                      <Cell
                        key={bar.day}
                        fill={bar.isPeak ? '#f59e0b' : '#2bca62'}
                        fillOpacity={inspected.day === bar.day ? 1 : 0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 30-Day Order Volume Trend (Recharts Line Graph) */}
          <section
            aria-label="Daily Order Volume (Past 30 Days)"
            data-testid="order-volume-30d-card"
            className="p-4 rounded-xl bg-surface-container shadow-md flex flex-col space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">show_chart</span>
                </div>
                <div>
                  <h2 className="text-base text-on-surface font-bold leading-tight">
                    Daily Order Volume (30 Days)
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Past 30 Days · Daily Completed Orders
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="px-2.5 py-1 rounded-lg bg-surface-container-low text-[11px] text-on-surface-variant">
                  30d Total:{' '}
                  <span
                    data-testid="order-volume-30d-total"
                    className="font-bold text-on-surface tabular-nums"
                  >
                    {total30dOrders.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="px-2.5 py-1 rounded-lg bg-surface-container-low text-[11px] text-on-surface-variant">
                  Avg / Day:{' '}
                  <span className="font-bold text-primary tabular-nums">
                    {avgDaily30dOrders}
                  </span>
                </div>
                {peak30dDay && (
                  <div className="px-2.5 py-1 rounded-lg bg-surface-container-highest text-[11px] text-tertiary font-semibold tabular-nums">
                    Peak: {peak30dDay.shortLabel} ({peak30dDay.ordersCount})
                  </div>
                )}
              </div>
            </div>

            <div className="w-full h-56 min-w-0">
              <ResponsiveContainer width="100%" height={224}>
                <LineChart
                  data={thirtyDayOrderTrend}
                  margin={{ top: 10, right: 12, left: -8, bottom: 4 }}
                >
                  <CartesianGrid stroke="#3a3430" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    minTickGap={24}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#a08e7a', fontSize: 11 }}
                    dy={6}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    tick={{ fill: '#a08e7a', fontSize: 11 }}
                  />
                  <Tooltip
                    content={<OrderVolumeTooltip />}
                    cursor={{ stroke: '#f0b65e', strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ordersCount"
                    name="Daily Orders"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ r: 2.5, fill: '#17120f', stroke: '#f59e0b', strokeWidth: 1.5 }}
                    activeDot={{ r: 5.5, fill: '#f59e0b', stroke: '#17120f', strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Payment Split & Order Channels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-surface-container-low shadow-sm flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-container text-[20px]">
                    account_balance_wallet
                  </span>
                  <h2 className="text-base text-on-surface font-semibold">
                    Live Payment Split &amp; Reconciliation
                  </h2>
                </div>
                <span className="text-[11px] text-tertiary font-semibold">
                  {pendingSettlementCount === 0
                    ? '100% Settled'
                    : `${pendingSettlementCount} Pending · ${youpiReconciledCount} UPI Reconciled`}
                </span>
              </div>
              <div className="w-full h-3.5 bg-surface-container-highest rounded-full overflow-hidden flex">
                <div className="h-full bg-primary-container" style={{ width: `${upiPct}%` }} />
                <div className="h-full bg-tertiary-container" style={{ width: `${cashPct}%` }} />
                <div className="h-full bg-secondary" style={{ width: `${cardPct}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="text-[11px] text-on-surface flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary-container" /> UPI &amp; Apps
                  </span>
                  <span className="text-sm font-bold text-on-surface block mt-0.5">{upiPct}%</span>
                  <span className="text-[11px] text-on-surface-variant tabular-nums">
                    {formatINR(upiLive)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-on-surface flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-tertiary-container" /> Cash
                  </span>
                  <span className="text-sm font-bold text-on-surface block mt-0.5">{cashPct}%</span>
                  <span className="text-[11px] text-on-surface-variant tabular-nums">
                    {formatINR(cashLive)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-on-surface flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-secondary" /> Card (EDC/Web)
                  </span>
                  <span className="text-sm font-bold text-on-surface block mt-0.5">{cardPct}%</span>
                  <span className="text-[11px] text-on-surface-variant tabular-nums">
                    {formatINR(cardLive)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-surface-container shadow-sm flex flex-col justify-between space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary text-[18px]">
                    room_service
                  </span>
                  <span className="text-base text-on-surface font-semibold">Order Channels</span>
                </div>
                <span className="text-[11px] text-tertiary">{leadingChannelLabel}</span>
              </div>
              <div className="space-y-2">
                {channelStats.map((ch) => (
                  <div key={ch.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-on-surface">{ch.label}</span>
                      <span className="text-primary font-bold tabular-nums">{ch.pct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
                      <div className={`h-full rounded-full ${ch.color}`} style={{ width: `${ch.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'Item Report' && (
        <div className="p-4 rounded-xl bg-surface-container space-y-2.5">
          <h2 className="text-base font-bold text-on-surface">Top Selling Menu Items</h2>
          {MENU_ITEMS.slice(0, 6).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container-low"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden">
                  <CafeImage src={item.imageUrl} alt={item.name} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-on-surface">{item.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {item.category} · {item.unitsSold} units
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold text-primary tabular-nums">
                {formatINR(item.unitsSold * item.price)}
              </span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'Inventory Report' && (
        <div className="p-4 rounded-xl bg-surface-container space-y-2.5">
          <h2 className="text-base font-bold text-on-surface">Roastery &amp; Kitchen Stock</h2>
          {INVENTORY_REPORT_ITEMS.map((inv) => (
            <div key={inv.id} className="p-3 rounded-lg bg-surface-container-low space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-on-surface">{inv.name}</span>
                <span
                  className={`text-xs font-bold ${
                    inv.status === 'Low Stock' ? 'text-error' : 'text-tertiary'
                  }`}
                >
                  {inv.stock} ({inv.status})
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    inv.status === 'Low Stock' ? 'bg-error' : 'bg-tertiary-container'
                  }`}
                  style={{ width: `${inv.fillPct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'Customer Report' && (
        <div className="p-4 rounded-xl bg-surface-container grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-surface-container-low">
            <span className="text-xs text-on-surface-variant">Repeat Guests</span>
            <p className="text-2xl font-bold text-primary mt-1 tabular-nums">64%</p>
            <span className="text-[11px] text-tertiary">+9% this month</span>
          </div>
          <div className="p-3 rounded-lg bg-surface-container-low">
            <span className="text-xs text-on-surface-variant">Loyalty Members</span>
            <p className="text-2xl font-bold text-on-surface mt-1 tabular-nums">418</p>
            <span className="text-[11px] text-primary">Gold Roaster active</span>
          </div>
        </div>
      )}

      {activeTab === 'Staff Performance' && (
        <div className="p-4 rounded-xl bg-surface-container space-y-2.5">
          <h2 className="text-base font-bold text-on-surface">Shift Leaders &amp; Prep Pace</h2>
          {STAFF_PERFORMANCE_ROWS.map((st) => (
            <div
              key={st.id}
              className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low"
            >
              <div>
                <p className="text-sm font-bold text-on-surface">{st.name}</p>
                <p className="text-xs text-on-surface-variant">{st.role}</p>
              </div>
              <div className="text-right text-xs">
                <span className="text-primary font-bold block tabular-nums">
                  {st.ordersHandled} orders
                </span>
                <span className="text-tertiary">Avg {st.avgPrep}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Best Performing Item Snapshot */}
      {topMenuItem && (
        <div className="p-3.5 rounded-xl bg-surface-container-low shadow-sm flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-surface-container-highest overflow-hidden shrink-0">
              <CafeImage src={topMenuItem.imageUrl} alt={topMenuItem.name} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-bold text-on-surface truncate">
                  {topMenuItem.name}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-primary-container/20 text-primary-container text-[10px] font-bold uppercase shrink-0">
                  #1 Sold
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                {topMenuItem.unitsSold} units served ·{' '}
                {formatINR(topMenuItem.unitsSold * topMenuItem.price)} revenue
              </p>
            </div>
          </div>
          <span className="text-xs text-tertiary font-bold shrink-0">{topMenuItem.category}</span>
        </div>
      )}

      {/* Report Export & Download Actions */}
      <div className="pt-1 flex flex-col space-y-2">
        <button
          type="button"
          onClick={() => {
            if (onDownloadReportPdf) {
              onDownloadReportPdf({
                timeframeLabel: currentTimeframe.label,
                totalRevenue: metrics.totalRevenue,
                totalOrders: metrics.totalOrders,
                avgOrderValue: metrics.avgOrderValue,
              });
            } else {
              onNotify(`Generated ${currentTimeframe.label} PDF Summary Report`);
            }
          }}
          className="w-full py-3 px-4 rounded-xl bg-primary-container hover:bg-primary text-on-primary-container text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary-container/20 active:scale-[0.98] transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
          <span>Download PDF Report</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExportCsv}
            className="py-2.5 px-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">table_view</span>
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onExportExcel ?? onExportCsv}
            className="py-2.5 px-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">file_download</span>
            <span>Export Excel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
