import React from 'react';
import type { ScreenId } from '../types/cafe';

/**
 * MenuScreenSkeleton
 * Shimmer skeleton placeholder for the Customer Menu screen.
 */
export const MenuScreenSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-20 space-y-4 animate-pulse select-none">
      {/* Category Pills Carousel Skeleton */}
      <div className="flex items-center gap-2 overflow-x-hidden pt-1 pb-2">
        {[80, 110, 95, 120, 90, 100].map((width, idx) => (
          <div
            key={idx}
            className="h-9 rounded-full bg-surface-container-high shrink-0 animate-shimmer"
            style={{ width: `${width}px` }}
          />
        ))}
      </div>

      {/* Featured Banner / Promo Header Skeleton */}
      <div className="h-28 sm:h-36 w-full rounded-2xl bg-surface-container-low border border-outline-variant/15 p-4 flex items-center justify-between relative overflow-hidden animate-shimmer">
        <div className="space-y-2 max-w-[65%]">
          <div className="h-3 w-20 rounded-full bg-surface-container-highest" />
          <div className="h-6 w-44 rounded-lg bg-surface-container-high" />
          <div className="h-3 w-36 rounded-full bg-surface-container" />
        </div>
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-surface-container-high" />
      </div>

      {/* Search & Filter Bar Skeleton */}
      <div className="h-11 w-full rounded-xl bg-surface-container-high border border-outline-variant/20 flex items-center px-3.5 gap-2 animate-shimmer">
        <div className="w-4 h-4 rounded-full bg-surface-container-highest shrink-0" />
        <div className="h-4 w-48 rounded bg-surface-container-highest" />
      </div>

      {/* Menu Items Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
        {[1, 2, 3, 4, 5, 6].map((key) => (
          <div
            key={key}
            className="rounded-xl bg-surface-container-low border border-outline-variant/15 p-3 flex gap-3 relative overflow-hidden animate-shimmer"
          >
            {/* Item Image Shimmer */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-surface-container-high shrink-0 relative overflow-hidden" />

            {/* Item Text & Price Shimmer */}
            <div className="flex flex-col justify-between flex-1 py-0.5 min-w-0">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <div className="h-3.5 w-14 rounded-full bg-primary-container/20" />
                  <div className="h-3.5 w-10 rounded-full bg-surface-container-highest" />
                </div>
                <div className="h-4 w-32 rounded bg-surface-container-high" />
                <div className="h-3 w-full rounded bg-surface-container" />
                <div className="h-3 w-3/4 rounded bg-surface-container" />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="h-5 w-16 rounded bg-surface-container-high" />
                <div className="h-8 w-20 rounded-lg bg-primary-container/30" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * CustomerHomeScreenSkeleton
 */
export const CustomerHomeScreenSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-20 space-y-5 animate-pulse select-none">
      {/* Hero Welcome Card */}
      <div className="h-44 sm:h-52 w-full rounded-2xl bg-surface-container-low border border-outline-variant/20 p-5 flex flex-col justify-between relative overflow-hidden">
        <div className="space-y-2">
          <div className="h-4 w-28 rounded-full bg-primary-container/30" />
          <div className="h-7 w-60 rounded-xl bg-surface-container-high" />
          <div className="h-4 w-44 rounded bg-surface-container" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-32 rounded-xl bg-primary-container/40" />
          <div className="h-10 w-24 rounded-xl bg-surface-container-high" />
        </div>
      </div>

      {/* Quick Category Icons */}
      <div className="grid grid-cols-4 gap-2.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface-container-low border border-outline-variant/15">
            <div className="w-12 h-12 rounded-full bg-surface-container-high" />
            <div className="h-3 w-14 rounded bg-surface-container-highest" />
          </div>
        ))}
      </div>

      {/* Popular Today Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="h-5 w-32 rounded bg-surface-container-high" />
          <div className="h-4 w-16 rounded bg-surface-container" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl bg-surface-container-low border border-outline-variant/15 p-2.5 space-y-2">
              <div className="w-full h-28 rounded-lg bg-surface-container-high" />
              <div className="h-4 w-24 rounded bg-surface-container-high" />
              <div className="flex justify-between items-center">
                <div className="h-4 w-12 rounded bg-surface-container" />
                <div className="w-7 h-7 rounded-lg bg-primary-container/30" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * CustomerCartSkeleton
 */
export const CustomerCartSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-24 space-y-4 animate-pulse select-none">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-6 w-28 rounded-lg bg-surface-container-high animate-shimmer" />
        <div className="h-4 w-16 rounded bg-surface-container" />
      </div>

      {/* Service Mode Selector Skeleton */}
      <div className="h-12 w-full rounded-xl bg-surface-container-high p-1 grid grid-cols-3 gap-1 animate-shimmer">
        <div className="rounded-lg bg-surface-container-highest" />
        <div className="rounded-lg bg-surface-container-low" />
        <div className="rounded-lg bg-surface-container-low" />
      </div>

      {/* Cart Items List */}
      <div className="space-y-2.5">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 flex items-center justify-between gap-3 animate-shimmer"
          >
            <div className="w-16 h-16 rounded-xl bg-surface-container-high shrink-0" />
            <div className="flex-1 space-y-1.5 min-w-0">
              <div className="h-4 w-32 rounded bg-surface-container-high" />
              <div className="h-3 w-16 rounded bg-surface-container" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-surface-container-high" />
          </div>
        ))}
      </div>

      {/* Bill Summary Card Skeleton */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-2.5 animate-shimmer">
        <div className="h-4 w-28 rounded bg-surface-container-high mb-3" />
        <div className="flex justify-between">
          <div className="h-3 w-20 rounded bg-surface-container" />
          <div className="h-3 w-12 rounded bg-surface-container" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-16 rounded bg-surface-container" />
          <div className="h-3 w-12 rounded bg-surface-container" />
        </div>
        <div className="flex justify-between pt-2 border-t border-outline-variant/15">
          <div className="h-5 w-24 rounded bg-surface-container-high" />
          <div className="h-5 w-16 rounded bg-surface-container-high" />
        </div>
      </div>

      {/* Big Action CTA */}
      <div className="h-12 w-full rounded-xl bg-primary-container/40 animate-shimmer" />
    </div>
  );
};

/**
 * LiveTrackingSkeleton
 */
export const LiveTrackingSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-20 space-y-5 animate-pulse select-none">
      {/* Order Status Header Card */}
      <div className="p-5 rounded-2xl bg-surface-container-low border border-outline-variant/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-3 w-20 rounded bg-surface-container" />
            <div className="h-6 w-32 rounded-lg bg-surface-container-high" />
          </div>
          <div className="h-7 w-24 rounded-full bg-primary-container/30" />
        </div>
        <div className="h-2.5 w-full rounded-full bg-surface-container-high overflow-hidden" />
      </div>

      {/* 4 Steps Tracker */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/15 grid grid-cols-4 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 text-center">
            <div className="w-8 h-8 rounded-full bg-surface-container-high" />
            <div className="h-2.5 w-12 rounded bg-surface-container" />
          </div>
        ))}
      </div>

      {/* Order Summary */}
      <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-3">
        <div className="h-4 w-28 rounded bg-surface-container-high" />
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex justify-between items-center py-1 border-b border-outline-variant/10">
              <div className="h-3.5 w-32 rounded bg-surface-container" />
              <div className="h-3.5 w-12 rounded bg-surface-container-high" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * AdminDashboardSkeleton
 */
export const AdminDashboardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-8 space-y-4 animate-pulse select-none">
      {/* Top Bar Skeleton */}
      <div className="flex items-center justify-between pt-1">
        <div className="space-y-1.5">
          <div className="h-6 w-36 rounded-lg bg-surface-container-high animate-shimmer" />
          <div className="h-3 w-44 rounded bg-surface-container" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-surface-container-high animate-shimmer" />
      </div>

      {/* 4 KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/15 flex flex-col justify-between h-24 animate-shimmer"
          >
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 rounded bg-surface-container-highest" />
              <div className="w-6 h-6 rounded-lg bg-surface-container-high" />
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <div className="h-6 w-24 rounded bg-surface-container-high" />
              <div className="h-4 w-12 rounded-full bg-tertiary/15" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts & Top Items 2-Col Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sales Chart Skeleton */}
        <div className="lg:col-span-7 p-4 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-4 animate-shimmer">
          <div className="flex items-center justify-between">
            <div className="h-5 w-32 rounded bg-surface-container-high" />
            <div className="h-4 w-20 rounded bg-surface-container" />
          </div>
          <div className="h-48 w-full rounded-lg bg-surface-container/60 flex items-end justify-between px-4 pb-2 gap-2">
            {[45, 60, 75, 40, 85, 90, 70].map((h, i) => (
              <div
                key={i}
                className="w-full rounded-t bg-surface-container-high"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Top Items Leaderboard Skeleton */}
        <div className="lg:col-span-5 p-4 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-3 animate-shimmer">
          <div className="flex items-center justify-between">
            <div className="h-5 w-28 rounded bg-surface-container-high" />
            <div className="h-3 w-16 rounded bg-surface-container" />
          </div>
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-2.5 rounded-lg bg-surface-container flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-surface-container-highest" />
                  <div className="space-y-1">
                    <div className="h-3.5 w-24 rounded bg-surface-container-highest" />
                    <div className="h-2.5 w-16 rounded bg-surface-container-high" />
                  </div>
                </div>
                <div className="h-4 w-10 rounded bg-surface-container-highest" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * KitchenDisplaySkeleton
 */
export const KitchenDisplaySkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-8 space-y-3 animate-pulse select-none">
      {/* Filter Tabs Skeleton */}
      <div className="flex items-center gap-2 overflow-x-hidden pb-1">
        {[90, 100, 85, 110].map((w, idx) => (
          <div
            key={idx}
            className="h-8 rounded-lg bg-surface-container-high shrink-0 animate-shimmer"
            style={{ width: `${w}px` }}
          />
        ))}
      </div>

      {/* KOT Tickets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="rounded-xl bg-surface-container-low border border-outline-variant/15 p-4 flex flex-col justify-between space-y-3 animate-shimmer"
          >
            {/* Ticket Header */}
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/15">
              <div className="space-y-1">
                <div className="h-5 w-24 rounded bg-surface-container-high" />
                <div className="h-3 w-16 rounded bg-surface-container" />
              </div>
              <div className="h-6 w-16 rounded-full bg-primary-container/20" />
            </div>

            {/* Order Items Lines */}
            <div className="space-y-2 py-1">
              <div className="flex justify-between items-center">
                <div className="h-3.5 w-36 rounded bg-surface-container-high" />
                <div className="h-3.5 w-6 rounded bg-surface-container" />
              </div>
              <div className="flex justify-between items-center">
                <div className="h-3.5 w-28 rounded bg-surface-container-high" />
                <div className="h-3.5 w-6 rounded bg-surface-container" />
              </div>
            </div>

            {/* Action CTA Button */}
            <div className="h-10 w-full rounded-xl bg-primary-container/30 mt-2" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * PosTerminalSkeleton
 */
export const PosTerminalSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col lg:flex-row gap-4 w-full pb-8 animate-pulse select-none">
      {/* Left Menu / Product Grid */}
      <div className="flex-1 space-y-3">
        {/* Category bar */}
        <div className="flex gap-2 overflow-x-hidden">
          {[80, 100, 90, 110, 85].map((w, i) => (
            <div key={i} className="h-9 rounded-lg bg-surface-container-high shrink-0" style={{ width: `${w}px` }} />
          ))}
        </div>
        {/* Products Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-2">
              <div className="w-full h-24 rounded-lg bg-surface-container-high" />
              <div className="h-4 w-28 rounded bg-surface-container-high" />
              <div className="h-4 w-14 rounded bg-surface-container" />
            </div>
          ))}
        </div>
      </div>

      {/* Right Billing Ticket Panel */}
      <div className="w-full lg:w-80 rounded-2xl bg-surface-container-low border border-outline-variant/20 p-4 space-y-4">
        <div className="h-6 w-32 rounded bg-surface-container-high" />
        <div className="space-y-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between items-center py-2 border-b border-outline-variant/10">
              <div className="space-y-1">
                <div className="h-4 w-28 rounded bg-surface-container-high" />
                <div className="h-3 w-16 rounded bg-surface-container" />
              </div>
              <div className="h-4 w-12 rounded bg-surface-container-high" />
            </div>
          ))}
        </div>
        <div className="h-12 w-full rounded-xl bg-primary-container/40 mt-4" />
      </div>
    </div>
  );
};

/**
 * TableLayoutSkeleton
 */
export const TableLayoutSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-8 space-y-4 animate-pulse select-none">
      <div className="flex justify-between items-center">
        <div className="h-6 w-36 rounded bg-surface-container-high" />
        <div className="h-9 w-28 rounded-lg bg-surface-container-high" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <div key={i} className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/15 flex flex-col items-center justify-between h-32">
            <div className="w-10 h-10 rounded-full bg-surface-container-high" />
            <div className="h-4 w-16 rounded bg-surface-container-high" />
            <div className="h-3 w-12 rounded-full bg-surface-container" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * InventoryStockSkeleton
 */
export const InventoryStockSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col w-full pb-8 space-y-4 animate-pulse select-none">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/15 space-y-2">
            <div className="h-3 w-24 rounded bg-surface-container" />
            <div className="h-6 w-20 rounded bg-surface-container-high" />
          </div>
        ))}
      </div>
      {/* Table rows */}
      <div className="rounded-xl bg-surface-container-low border border-outline-variant/15 p-4 space-y-3">
        <div className="h-9 w-full rounded-lg bg-surface-container-high" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex justify-between items-center py-2 border-b border-outline-variant/10">
            <div className="h-4 w-36 rounded bg-surface-container-high" />
            <div className="h-4 w-16 rounded bg-surface-container" />
            <div className="h-4 w-20 rounded bg-surface-container-high" />
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Universal ScreenSkeleton Resolver
 * Returns the best-fit skeleton component for any screen.
 */
export const ScreenSkeleton: React.FC<{ screen?: ScreenId }> = ({ screen }) => {
  switch (screen) {
    case 'home':
      return <CustomerHomeScreenSkeleton />;
    case 'menu':
      return <MenuScreenSkeleton />;
    case 'cart':
      return <CustomerCartSkeleton />;
    case 'tracking':
      return <LiveTrackingSkeleton />;
    case 'admin-dashboard':
    case 'reports-analytics':
      return <AdminDashboardSkeleton />;
    case 'kitchen-display-system':
    case 'pos-orders':
      return <KitchenDisplaySkeleton />;
    case 'pos-terminal':
      return <PosTerminalSkeleton />;
    case 'table-layout':
    case 'kitchen-tables':
      return <TableLayoutSkeleton />;
    case 'inventory-stock':
      return <InventoryStockSkeleton />;
    default:
      return <MenuScreenSkeleton />;
  }
};
