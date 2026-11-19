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
import { CustomerProfile, CustomerSegment } from '../types/cafe';
import { filterCustomers, formatINR } from '../utils/cafeLogic';
import { CafeDataTable } from './CafeDataTable';

interface CrmCustomersScreenProps {
  customers: CustomerProfile[];
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
            <p className="text-[11px] text-on-surface-variant tabular-nums">
              +91 {row.original.phone}
            </p>
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
              Customers (CRM)
            </h1>
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0" />
          </div>
          <p className="text-xs text-on-surface-variant truncate">
            {crmKpis.total} Total Profiles • {crmKpis.retentionPct}% Returning
          </p>
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
            onClick={() => onNotify('Showing high-retention patron profiles first')}
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
              Avg LTV
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
            <span className="text-[11px] text-on-surface-variant truncate">Repeat patrons</span>
          </div>
        </div>

        <div className="lg:col-span-4 flex items-center gap-2 p-2.5 rounded-xl bg-surface-container-lowest shadow-inner">
          <button
            type="button"
            onClick={() => onNotify(`Promo broadcast queued for ${visibleCustomers.length} patrons`)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface text-xs font-semibold transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">campaign</span>
            <span className="truncate">Broadcast</span>
          </button>
          <button
            type="button"
            onClick={onExportExcel ?? onExportCsv}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary text-xs font-semibold transition-colors shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">table_view</span>
            <span>Export Excel</span>
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
                <div
                  key={customer.id}
                  className="relative overflow-hidden flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container shadow-md transition-all space-y-2.5"
                >
                  {isVip && (
                    <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary/10 rounded-full blur-xl pointer-events-none" />
                  )}

                  <div className="flex flex-wrap items-start justify-between gap-2 relative">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        className={`relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                          isVip
                            ? 'bg-gradient-to-tr from-primary-container to-primary text-on-primary shadow-md'
                            : isLoyal
                              ? 'bg-secondary-container/20 text-secondary'
                              : 'bg-surface-container-high text-on-surface'
                        }`}
                      >
                        {customer.initials}
                        {isVip && (
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-background flex items-center justify-center">
                            <span className="material-symbols-outlined text-[11px] text-primary icon-filled">
                              star
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-on-surface font-bold truncate">
                            {customer.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase flex items-center gap-0.5 shrink-0 ${
                              isVip
                                ? 'bg-primary/20 text-primary'
                                : isLoyal
                                  ? 'bg-secondary-container/30 text-primary'
                                  : isRegular
                                    ? 'bg-tertiary-container/30 text-tertiary'
                                    : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {isVip && (
                              <span className="material-symbols-outlined text-[11px] icon-filled">
                                workspace_premium
                              </span>
                            )}
                            {customer.segment}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-on-surface-variant text-xs">
                          <span className="material-symbols-outlined text-[13px] text-outline">
                            call
                          </span>
                          <span className="tabular-nums">+91 {customer.phone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`Export DPDP PII for ${customer.name}`}
                        onClick={() =>
                          onExportCustomerPii
                            ? onExportCustomerPii(customer)
                            : onNotify(`Exported DPDP JSON for ${customer.name}`)
                        }
                        className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-transform cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Call ${customer.name}`}
                        onClick={() => onNotify(`Dialing ${customer.name} (+91 ${customer.phone})`)}
                        className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-transform cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[17px]">phone</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`WhatsApp ${customer.name}`}
                        onClick={() =>
                          onNotify(`Opened WhatsApp greeting for ${customer.name}`)
                        }
                        className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-tertiary hover:bg-surface-bright active:scale-95 transition-transform cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[17px]">chat</span>
                      </button>
                    </div>
                  </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-1.5 py-2 px-2.5 rounded-lg bg-surface-container-lowest text-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-outline">Visits</span>
                    <span className="text-xs text-on-surface font-semibold tabular-nums">
                      {customer.visits} Visits
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-outline">Total Spent</span>
                    <span className="text-xs text-primary font-semibold tabular-nums">
                      {formatINR(customer.totalSpent)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-outline">Avg Ticket</span>
                    <span className="text-xs text-on-surface font-semibold tabular-nums">
                      {formatINR(customer.avgTicket)}
                    </span>
                  </div>
                </div>

                {customer.note && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-container-high/60 text-secondary">
                    <span className="material-symbols-outlined text-[14px] shrink-0">
                      restaurant
                    </span>
                    <span className="text-[11px] truncate">{customer.note}</span>
                  </div>
                )}

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="material-symbols-outlined text-[15px] text-primary shrink-0">
                        favorite
                      </span>
                      <span className="text-xs text-on-surface-variant truncate">
                        {customer.favorites}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-outline text-[11px] shrink-0">
                      <span className="material-symbols-outlined text-[12px]">schedule</span>
                      <span>{customer.lastVisit}</span>
                    </div>
                  </div>
                </div>
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

      {/* Add Customer Dialog */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Add Customer Profile
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Store patron preferences with DPDP-compliant consent tracking.
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
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    {...form.register('phone')}
                    placeholder="Phone number"
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {form.formState.errors.phone && (
                    <p className="text-[11px] text-error mt-1">
                      {form.formState.errors.phone.message}
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
                <span>Patron consented to DPDP profile &amp; loyalty storage</span>
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
