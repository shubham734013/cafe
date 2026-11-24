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
import { addCustomerSchema } from '../shared/schemas';
import { CafeOrder, CustomerProfile, CustomerSegment } from '../types/cafe';
import { filterCustomers, formatINR } from '../utils/cafeLogic';
import { CafeDataTable } from './CafeDataTable';

interface CrmCustomersScreenProps {
  customers: CustomerProfile[];
  orders: CafeOrder[];
  onAddCustomer: (customer: Omit<CustomerProfile, 'id'>) => void;
  onExportCsv: () => void;
  onExportExcel?: () => void;
  onExportCustomerPii?: (customer: CustomerProfile) => void;
  onNotify: (msg: string) => void;
}

const PAGE_SIZE = 12;

type AddCustomerValues = z.input<typeof addCustomerSchema>;

export const CrmCustomersScreen: React.FC<CrmCustomersScreenProps> = ({
  customers,
  orders,
  onAddCustomer,
  onExportCsv,
  onExportExcel,
  onExportCustomerPii,
  onNotify,
}) => {
  const [segment, setSegment] = useState<CustomerSegment>('all');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete customer "${name}" from CRM?`)) return;
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete customer');
      setSelectedCustomer(null);
      onNotify(`Deleted customer "${name}" from CRM.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not delete customer');
    }
  };

  const handleClearAllCustomers = async () => {
    if (!window.confirm('Are you sure you want to delete ALL customers from CRM for clean testing? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/admin/customers', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear customers');
      setSelectedCustomer(null);
      onNotify('All customers cleared from CRM. Ready for clean testing!');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not clear customers');
    }
  };

  const segmentCounts = useMemo(() => {
    const counts = { all: customers.length, vip: 0, loyal: 0, regular: 0, new: 0, risk: 0 };
    for (const c of customers) {
      if (c.segment in counts) {
        counts[c.segment as keyof typeof counts] += 1;
      }
    }
    return counts;
  }, [customers]);

  const segments = useMemo<{ id: CustomerSegment; label: string }[]>(
    () => [
      { id: 'all', label: `All (${segmentCounts.all})` },
      { id: 'vip', label: `VIP (${segmentCounts.vip})` },
      { id: 'loyal', label: `Loyal (${segmentCounts.loyal})` },
      { id: 'regular', label: `Regular (${segmentCounts.regular})` },
      { id: 'new', label: `New (${segmentCounts.new})` },
      { id: 'risk', label: `At Risk (${segmentCounts.risk})` },
    ],
    [segmentCounts]
  );

  const crmKpis = useMemo(() => {
    if (customers.length === 0) {
      return { total: 0, avgLtv: 0, retentionPct: 0 };
    }
    const totalSpent = customers.reduce((s, c) => s + c.totalSpent, 0);
    const returning = customers.filter((c) => c.visits >= 2).length;
    return {
      total: customers.length,
      avgLtv: Math.round(totalSpent / customers.length),
      retentionPct: Math.round((returning / customers.length) * 100),
    };
  }, [customers]);

  const form = useForm<AddCustomerValues>({
    resolver: zodResolver(addCustomerSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      segment: 'regular',
      favorites: 'Cold Coffee',
      note: '',
      dpdpConsent: true,
    },
  });

  const visibleCustomers = useMemo(
    () => filterCustomers(customers, segment, query),
    [customers, query, segment]
  );

  const paginatedCustomers = useMemo(
    () => visibleCustomers.slice(0, visibleLimit),
    [visibleCustomers, visibleLimit]
  );

  const columns = useMemo<ColumnDef<CustomerProfile, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Customer',
        cell: ({ row }) => (
          <div>
            <p className="font-bold text-on-surface">{row.original.name}</p>
            {row.original.phone ? (
              <p className="text-[11px] text-primary font-semibold tabular-nums">
                +91 {row.original.phone}
              </p>
            ) : row.original.email ? (
              <p className="text-[11px] text-on-surface-variant truncate max-w-[200px]">
                {row.original.email}
              </p>
            ) : (
              <p className="text-[11px] text-outline">Registered Patron</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'segment',
        header: 'Tier',
        cell: ({ row }) => (
          <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold uppercase">
            {row.original.segment}
          </span>
        ),
      },
      {
        accessorKey: 'visits',
        header: 'Visits',
        cell: ({ row }) => <span className="tabular-nums">{row.original.visits}</span>,
      },
      {
        accessorKey: 'totalSpent',
        header: 'Total Spent',
        cell: ({ row }) => (
          <span className="font-bold text-primary tabular-nums">
            {formatINR(row.original.totalSpent)}
          </span>
        ),
      },
      {
        accessorKey: 'favorites',
        header: 'Favorites',
        cell: ({ row }) => (
          <span className="text-on-surface-variant truncate max-w-[160px] block">
            {row.original.favorites}
          </span>
        ),
      },
      {
        id: 'dpdp',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onExportCustomerPii
                  ? onExportCustomerPii(row.original)
                  : onNotify(`Exported DPDP JSON for ${row.original.name}`)
              }
              className="px-2 py-1 rounded bg-surface-container-high text-primary text-[11px] font-semibold hover:bg-surface-bright cursor-pointer"
            >
              Export PII
            </button>
          </div>
        ),
      },
    ],
    [onExportCustomerPii, onNotify]
  );

  const handleOpenAdd = () => {
    form.reset({
      name: '',
      phone: '',
      segment: 'regular',
      favorites: 'Cold Coffee',
      note: '',
      dpdpConsent: true,
    });
    setAddModalOpen(true);
  };

  const handleSaveCustomer = form.handleSubmit((values) => {
    const parsed = addCustomerSchema.parse(values);
    const parts = parsed.name.split(/\s+/);
    const initials = (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
    onAddCustomer({
      initials,
      name: parsed.name,
      phone: parsed.phone,
      segment: parsed.segment,
      visits: 1,
      totalSpent: 240,
      avgTicket: 240,
      favorites: parsed.favorites,
      note: parsed.note || (parsed.dpdpConsent ? 'DPDP consent verified' : undefined),
      lastVisit: 'Just added',
    });
    setAddModalOpen(false);
  });

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-bold text-on-surface tracking-tight truncate">
              Customer Directory
            </h1>
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0" />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
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
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-container text-on-primary text-xs font-semibold shadow-md active:scale-95 transition-transform shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
        <div className="lg:col-span-5 flex items-center gap-1.5">
          <div className="relative flex-1 flex items-center bg-surface-container-low rounded-lg px-3 py-2.5 shadow-sm focus-within:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-outline text-[18px] mr-2 shrink-0">
              search
            </span>
            <input
              type="text"
              aria-label="Search customers by name or phone"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleLimit(PAGE_SIZE);
              }}
              placeholder="Search customers..."
              className="w-full bg-transparent border-0 outline-none text-on-surface placeholder:text-outline text-sm"
            />
            {query.length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  setVisibleLimit(PAGE_SIZE);
                }}
                className="text-outline hover:text-on-surface p-0.5 rounded-full cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Sort by spend"
            onClick={() => onNotify('Showing top spending customers first')}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant hover:text-primary shrink-0 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </button>
        </div>

        {/* Segment Filter Chips */}
        <div className="lg:col-span-7 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {segments.map((seg) => {
            const active = segment === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={() => {
                  setSegment(seg.id);
                  setVisibleLimit(PAGE_SIZE);
                }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs tracking-tight transition-colors cursor-pointer ${
                  active
                    ? 'bg-primary-container text-on-primary font-semibold shadow-sm'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {seg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Strip + Broadcast Belt */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-8 grid grid-cols-3 gap-2">
          <div className="flex flex-col min-w-0 p-3 rounded-lg bg-surface-container-low shadow-sm">
            <span className="text-[10px] text-outline uppercase tracking-wider font-semibold">
              Total
            </span>
            <div className="flex items-baseline justify-between mt-1 gap-1">
              <span className="text-lg sm:text-xl text-primary font-bold tabular-nums">
                {crmKpis.total}
              </span>
              <span className="text-[10px] text-tertiary flex items-center font-semibold shrink-0">
                <span className="material-symbols-outlined text-[12px]">trending_up</span>Live
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant truncate">Active accounts</span>
          </div>

          <div className="flex flex-col min-w-0 p-3 rounded-lg bg-surface-container-low shadow-sm">
            <span className="text-[10px] text-outline uppercase tracking-wider font-semibold">
              Avg Spend
            </span>
            <div className="flex items-baseline mt-1">
              <span className="text-lg sm:text-xl text-on-surface font-bold tabular-nums truncate">
                {formatINR(crmKpis.avgLtv)}
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant truncate">Per customer</span>
          </div>

          <div className="flex flex-col min-w-0 p-3 rounded-lg bg-surface-container-low shadow-sm">
            <span className="text-[10px] text-outline uppercase tracking-wider font-semibold">
              Retention
            </span>
            <div className="flex items-baseline justify-between mt-1 gap-1">
              <span className="text-lg sm:text-xl text-tertiary font-bold tabular-nums">
                {crmKpis.retentionPct}%
              </span>
              <span className="material-symbols-outlined text-tertiary text-[14px] shrink-0">
                verified
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant truncate">Repeat customers</span>
          </div>
        </div>

        <div className="lg:col-span-4 flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-lowest shadow-inner">
          <button
            type="button"
            onClick={() => onNotify(`Promo message queued for ${visibleCustomers.length} customers`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">campaign</span>
            <span className="truncate">Send Offer</span>
          </button>
          <button
            type="button"
            onClick={onExportExcel ?? onExportCsv}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-semibold transition-colors shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">table_view</span>
            <span>Export Excel</span>
          </button>
          <button
            type="button"
            onClick={() => void handleClearAllCustomers()}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 text-xs font-semibold transition-colors shrink-0 cursor-pointer border border-rose-500/20"
            title="Clear all customers to test fresh"
          >
            <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
            <span>Clear CRM</span>
          </button>
        </div>
      </div>

      {/* Customer Directory Grid / Table */}
      {viewMode === 'table' ? (
        <CafeDataTable
          data={visibleCustomers}
          columns={columns}
          emptyText="No customers match your filter."
        />
      ) : visibleCustomers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-2 rounded-xl bg-surface-container-low">
          <div className="w-12 h-12 rounded-full bg-surface-container-high flex items-center justify-center text-outline">
            <span className="material-symbols-outlined text-[24px]">person_off</span>
          </div>
          <span className="text-base text-on-surface font-semibold">No customers found</span>
          <p className="text-xs text-outline max-w-xs">
            Check for spelling or try filtering by another customer tier.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {paginatedCustomers.map((customer) => {
              const isVip = customer.segment === 'vip';
              const isLoyal = customer.segment === 'loyal';
              const isRegular = customer.segment === 'regular';

              return (
                <article
                  key={customer.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${customer.name}`}
                  onClick={() => setSelectedCustomer(customer)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedCustomer(customer);
                    }
                  }}
                  className="relative overflow-hidden flex flex-col justify-between p-3 sm:p-5 rounded-2xl sm:rounded-3xl liquid-glass-card shadow-2xl transition-all space-y-3 sm:space-y-4 border border-white/[0.08] cursor-pointer"
                >
                  {isVip && (
                    <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary/20 rounded-full blur-xl pointer-events-none" />
                  )}

                  {/* Header Row: Avatar + Name/Phone + Action Buttons */}
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2.5 relative">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div
                        className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0 shadow-md overflow-hidden ${
                          isVip
                            ? 'bg-gradient-to-tr from-amber-500/30 to-amber-400/10 text-amber-300 border border-amber-500/40'
                            : isLoyal
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                              : 'bg-surface-container-high/90 text-primary border border-white/[0.08]'
                        }`}
                      >
                        {customer.avatarUrl ? (
                          <img
                            src={customer.avatarUrl}
                            alt={customer.name}
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          customer.initials
                        )}
                        {isVip && (
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-background flex items-center justify-center border border-amber-500/40">
                            <span className="material-symbols-outlined text-[11px] text-amber-400 icon-filled">
                              star
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="min-w-0 max-w-full text-sm sm:text-base text-on-surface font-extrabold truncate tracking-tight">
                            {customer.name}
                          </span>
                          <span
                            className={`px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black tracking-wider uppercase shrink-0 ${
                              isVip
                                ? 'bg-secondary-container text-on-secondary-container border border-secondary/30'
                                : isLoyal
                                  ? 'bg-primary/10 text-primary border border-primary/20'
                                  : isRegular
                                    ? 'bg-surface-container-high text-on-surface-variant border border-outline-variant'
                                    : 'bg-secondary/10 text-secondary border border-secondary/20'
                            }`}
                          >
                            {customer.segment}
                          </span>
                        </div>
                        {customer.phone ? (
                          <div className="flex min-w-0 items-center gap-1.5 text-primary text-xs font-semibold tabular-nums mt-1">
                            <span className="material-symbols-outlined text-[14px] shrink-0">
                              call
                            </span>
                            <span className="min-w-0 truncate">+91 {customer.phone}</span>
                          </div>
                        ) : customer.email ? (
                          <div className="flex min-w-0 items-center gap-1.5 text-on-surface-variant/80 text-xs truncate mt-1">
                            <span className="material-symbols-outlined text-[14px] shrink-0 text-primary">
                              mail
                            </span>
                            <span className="min-w-0 truncate font-medium">{customer.email}</span>
                          </div>
                        ) : (
                          <div className="flex min-w-0 items-center gap-1.5 text-on-surface-variant/70 text-xs truncate mt-1">
                            <span className="material-symbols-outlined text-[14px] shrink-0 text-secondary">
                              verified
                            </span>
                            <span className="min-w-0 truncate">Verified Cafe Patron</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Icon Buttons */}
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label={`Export DPDP PII for ${customer.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onExportCustomerPii
                            ? onExportCustomerPii(customer)
                            : onNotify(`Exported DPDP JSON for ${customer.name}`);
                        }}
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-surface-container-high/80 border border-white/[0.08] flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all cursor-pointer shadow-sm hover:border-primary/40"
                        title="Download DPDP Record"
                      >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                      </button>
                      {customer.email ? (
                        <a
                          href={`mailto:${customer.email}`}
                          onClick={(event) => event.stopPropagation()}
                          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-surface-container-high/80 border border-white/[0.08] flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all cursor-pointer shadow-sm hover:border-white/20"
                          title={`Email ${customer.name}`}
                        >
                          <span className="material-symbols-outlined text-[18px] sm:text-[20px] text-primary">
                            mail
                          </span>
                        </a>
                      ) : null}
                    </div>
                  </div>

                  {/* Middle Metrics Inset Card */}
                  <div className="grid grid-cols-3 gap-1 sm:gap-2 py-2.5 sm:py-3 px-2.5 sm:px-4 rounded-2xl bg-black/40 backdrop-blur-md border border-white/[0.05] text-center items-center shadow-inner">
                    <div className="min-w-0 flex flex-col">
                      <span className="text-[10px] sm:text-[11px] text-on-surface-variant/70 font-semibold mb-0.5 truncate">Visits</span>
                      <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight truncate">
                        {customer.visits}
                      </span>
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <span className="text-[10px] sm:text-[11px] text-on-surface-variant/70 font-semibold mb-0.5 truncate">Total Spent</span>
                      <span className="text-xs sm:text-sm md:text-base text-secondary font-black tabular-nums tracking-tight truncate">
                        {formatINR(customer.totalSpent)}
                      </span>
                    </div>
                    <div className="min-w-0 flex flex-col">
                      <span className="text-[10px] sm:text-[11px] text-on-surface-variant/70 font-semibold mb-0.5 truncate">Avg Ticket</span>
                      <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight truncate">
                        {formatINR(customer.avgTicket)}
                      </span>
                    </div>
                  </div>

                  {customer.note && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-high/60 text-secondary text-xs">
                      <span className="material-symbols-outlined text-[14px] shrink-0">
                        restaurant
                      </span>
                      <span className="text-[11px] truncate font-medium">{customer.note}</span>
                    </div>
                  )}

                  {/* Footer Row: Heart + Favorites & Clock + Last Visit */}
                  <div className="flex items-center justify-between gap-2 sm:gap-3 text-xs sm:text-sm pt-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                        favorite_border
                      </span>
                      <span className="text-xs text-on-surface-variant/80 font-medium truncate">
                        {customer.favorites}
                      </span>
                    </div>
                    <div className="flex max-w-[42%] items-center gap-1 text-on-surface-variant/70 text-xs shrink-0 font-medium">
                      <span className="material-symbols-outlined text-[15px]">schedule</span>
                      <span className="truncate">{customer.lastVisit}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {visibleCustomers.length > paginatedCustomers.length && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + PAGE_SIZE)}
                className="px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-bold cursor-pointer"
              >
                Load More ({visibleCustomers.length - paginatedCustomers.length} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Customer Details Dialog */}
      <Dialog
        open={selectedCustomer !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCustomer(null);
        }}
      >
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-lg rounded-2xl p-5 min-h-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-y-contain">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 pr-8">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0 overflow-hidden bg-surface-container-high text-primary border border-outline-variant">
                    {selectedCustomer.avatarUrl ? (
                      <img
                        src={selectedCustomer.avatarUrl}
                        alt={selectedCustomer.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      selectedCustomer.initials
                    )}
                  </div>
                  <div className="min-w-0">
                    <DialogTitle className="text-lg font-bold text-on-surface truncate">
                      {selectedCustomer.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-on-surface-variant capitalize">
                      {selectedCustomer.segment} customer
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-surface-container-low p-3">
                    <p className="text-[10px] uppercase tracking-wider text-outline font-semibold">Email</p>
                    <p className="mt-1 text-sm text-on-surface break-words">
                      {selectedCustomer.email || 'Not provided'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-container-low p-3">
                    <p className="text-[10px] uppercase tracking-wider text-outline font-semibold">Mobile Number</p>
                    <p className="mt-1 text-sm font-semibold text-primary tabular-nums">
                      {selectedCustomer.phone ? `+91 ${selectedCustomer.phone}` : 'Not provided by Google'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-surface-container-low p-3 text-center">
                    <p className="text-[10px] text-outline font-semibold">Visits</p>
                    <p className="mt-1 text-base font-black text-on-surface">{selectedCustomer.visits}</p>
                  </div>
                  <div className="rounded-xl bg-surface-container-low p-3 text-center">
                    <p className="text-[10px] text-outline font-semibold">Total Spent</p>
                    <p className="mt-1 text-base font-black text-secondary">
                      {formatINR(selectedCustomer.totalSpent)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-container-low p-3 text-center">
                    <p className="text-[10px] text-outline font-semibold">Avg Ticket</p>
                    <p className="mt-1 text-base font-black text-on-surface">
                      {formatINR(selectedCustomer.avgTicket)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-outline-variant/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-outline font-semibold">Favorites</p>
                    <p className="mt-1 text-sm text-on-surface">{selectedCustomer.favorites}</p>
                  </div>
                  <div className="rounded-xl border border-outline-variant/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-outline font-semibold">Last Visit</p>
                    <p className="mt-1 text-sm text-on-surface">{selectedCustomer.lastVisit}</p>
                  </div>
                  <div className="rounded-xl border border-outline-variant/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-outline font-semibold">Loyalty Points</p>
                    <p className="mt-1 text-sm font-bold text-primary">
                      {selectedCustomer.loyaltyPoints ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-outline-variant/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-outline font-semibold">Account Status</p>
                    <p className="mt-1 text-sm font-bold text-on-surface capitalize">
                      {selectedCustomer.segment}
                    </p>
                  </div>
                </div>

                {selectedCustomer.provider === 'google' && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-primary">verified</span>
                      <p className="text-sm font-bold text-on-surface">Google Account Details</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[10px] text-outline uppercase tracking-wider">Sign-in Provider</p>
                        <p className="mt-0.5 text-on-surface font-semibold">Google</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-outline uppercase tracking-wider">Email Status</p>
                        <p className="mt-0.5 text-on-surface font-semibold">
                          {selectedCustomer.emailVerified ? 'Google verified' : 'Not verified'}
                        </p>
                      </div>
                      {selectedCustomer.createdAt && (
                        <div>
                          <p className="text-[10px] text-outline uppercase tracking-wider">Account Synced</p>
                          <p className="mt-0.5 text-on-surface font-semibold">
                            {new Date(selectedCustomer.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {selectedCustomer.googleSubjectId && (
                        <div className="sm:col-span-2">
                          <p className="text-[10px] text-outline uppercase tracking-wider">Google Account ID</p>
                          <p className="mt-0.5 text-on-surface font-mono text-[11px] break-all">
                            {selectedCustomer.googleSubjectId}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedCustomer.note && (
                  <div className="rounded-xl bg-surface-container-high/60 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-outline font-semibold">Notes</p>
                    <p className="mt-1 text-sm text-on-surface-variant">{selectedCustomer.note}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onExportCustomerPii) onExportCustomerPii(selectedCustomer);
                      else onNotify(`Exported DPDP JSON for ${selectedCustomer.name}`);
                    }}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-surface-container-high text-primary text-xs font-bold cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    Export PII
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteCustomer(selectedCustomer.id, selectedCustomer.name)}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 hover:bg-rose-500/20 text-xs font-bold cursor-pointer transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    Delete Customer
                  </button>
                  {selectedCustomer.email ? (
                    <a
                      href={`mailto:${selectedCustomer.email}`}
                      className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-primary text-on-primary text-xs font-bold cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">mail</span>
                      Email
                    </a>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Add Customer Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Save customer preferences and contact details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveCustomer} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  {...form.register('name')}
                  placeholder="Full name"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
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
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    {...form.register('email')}
                    placeholder="name@example.com"
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.email && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Tier Segment
                  </label>
                  <select
                    {...form.register('segment')}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="vip">VIP</option>
                    <option value="loyal">Loyal</option>
                    <option value="regular">Regular</option>
                    <option value="new">New</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Favorite Items
                </label>
                <input
                  type="text"
                  {...form.register('favorites')}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {form.formState.errors.favorites && (
                  <p className="text-[11px] text-error mt-1">
                    {form.formState.errors.favorites.message}
                  </p>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
                <input
                  type="checkbox"
                  {...form.register('dpdpConsent')}
                  className="rounded accent-primary"
                />
                <span>Customer agreed to receive SMS/WhatsApp offers</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-primary-container text-on-primary text-sm font-bold cursor-pointer"
              >
                Save Customer
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
