import React, { useState } from 'react';
import { CAFE_ASSETS, MENU_ITEMS } from '../data/cafeSeedData';
import { CafeTable, MenuItem, ServiceMode } from '../types/cafe';
import { CafeImage } from './CafeImage';

interface CustomerHomeScreenProps {
  serviceMode: ServiceMode;
  selectedTable: string;
  tables: CafeTable[];
  cartCount: number;
  onSelectServiceAndTable: (mode: ServiceMode, table: string) => void;
  onNavigateMenu: (category?: 'All' | 'Best Sellers' | 'Beverages' | 'Snacks' | 'Meals' | 'Combos' | 'Desserts') => void;
  onNavigateCart: () => void;
  onNavigateRewards: () => void;
  onAddToCart: (item: MenuItem) => void;
  onNotify: (msg: string) => void;
}

export const CustomerHomeScreen: React.FC<CustomerHomeScreenProps> = ({
  serviceMode,
  selectedTable,
  tables,
  cartCount,
  onSelectServiceAndTable,
  onNavigateMenu,
  onNavigateCart,
  onNavigateRewards,
  onAddToCart,
  onNotify,
}) => {
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingGuests, setBookingGuests] = useState('2 Guests');
  const [bookingTime, setBookingTime] = useState('7:30 PM');

  const specialCombo = MENU_ITEMS.find((i) => i.id === 'special-combo')!;
  const favorites = MENU_ITEMS.filter((i) => i.id === 'cold-coffee' || i.id === 'protein-shake');

  const modeLabel =
    serviceMode === 'dine-in'
      ? `Dine-In (Table ${selectedTable.replace('T', '')})`
      : serviceMode === 'takeaway'
        ? 'Takeaway Pickup'
        : 'Express Delivery';

  return (
    <div className="flex flex-col w-full pb-6">
      {/* Dynamic Table Presence & Mode Ribbon */}
      <div className="pt-1 pb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setTableModalOpen(true)}
          className="inline-flex items-center gap-1.5 bg-surface-container-high hover:bg-surface-variant px-3.5 py-2 rounded-full shadow-sm transition-colors cursor-pointer"
        >
          <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
          <span className="material-symbols-outlined text-[16px] text-primary">
            {serviceMode === 'dine-in'
              ? 'table_restaurant'
              : serviceMode === 'takeaway'
                ? 'takeout_dining'
                : 'moped'}
          </span>
          <span className="text-xs text-on-surface font-semibold tracking-wide whitespace-nowrap">
            {modeLabel}
          </span>
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
            expand_more
          </span>
        </button>

        <button
          type="button"
          onClick={onNavigateCart}
          className="relative flex items-center gap-1.5 bg-surface-container hover:bg-surface-container-high px-3.5 py-2 rounded-full text-on-surface transition-colors shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px] text-primary">shopping_bag</span>
          <span className="text-xs font-semibold text-primary tabular-nums">{cartCount} items</span>
          {cartCount > 0 && (
            <span className="w-4 h-4 bg-primary-container text-on-primary text-[10px] flex items-center justify-center rounded-full font-bold tabular-nums">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Hero Banner Section */}
      <div className="pb-5">
        <div className="relative w-full rounded-xl overflow-hidden shadow-xl bg-surface-container-lowest min-h-[260px] flex items-end">
          <img
            src={CAFE_ASSETS.heroInterior}
            alt="Seth Sawariya Cafe warm ambient interior"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/75 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-surface-container-lowest/90 via-surface-container-lowest/60 to-transparent" />

          <div className="relative z-10 p-6 w-full flex flex-col justify-end pt-12">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary-container/20 flex items-center justify-center backdrop-blur-md shadow-[0_0_20px_rgba(245,158,11,0.45)]">
                <span className="material-symbols-outlined icon-filled text-primary text-[22px]">
                  local_cafe
                </span>
              </div>
              <span className="bg-primary/15 text-primary text-[11px] font-medium uppercase tracking-wider px-2.5 py-0.5 rounded-full backdrop-blur-sm">
                Artisanal Roastery
              </span>
            </div>

            <h1 className="text-[26px] sm:text-[32px] text-on-surface font-bold tracking-tight leading-tight">
              Welcome to <br />
              <span className="text-primary drop-shadow-[0_2px_12px_rgba(245,158,11,0.3)]">
                Seth Sawariya Cafe
              </span>
            </h1>

            <p className="text-sm text-on-surface-variant mt-1.5 flex flex-wrap items-center gap-1.5">
              <span>Great Coffee</span>
              <span className="text-primary text-[10px]">●</span>
              <span>Delicious Food</span>
              <span className="text-primary text-[10px]">●</span>
              <span>Cozy Vibes</span>
            </p>

            <div className="mt-5 grid grid-cols-2 sm:max-w-sm gap-2.5">
              <button
                type="button"
                onClick={() => onNavigateMenu('Beverages')}
                className="h-12 bg-primary hover:bg-primary-fixed-dim text-on-primary text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(245,158,11,0.35)] active:scale-[0.98] transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined icon-filled text-[20px]">bolt</span>
                <span>Order Now</span>
              </button>
              <button
                type="button"
                onClick={() => setBookingModalOpen(true)}
                className="h-12 bg-surface-container/85 hover:bg-surface-container-high text-primary text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 backdrop-blur-md shadow-sm active:scale-[0.98] transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">calendar_today</span>
                <span>Book a Table</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Access Service Matrix (4-Grid) */}
      <div className="pb-5">
        <div className="grid grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => {
              onSelectServiceAndTable('dine-in', selectedTable);
              onNavigateMenu('Beverages');
            }}
            className="group flex flex-col items-center text-center p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors shadow-sm cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-surface-container-high group-hover:bg-primary/20 flex items-center justify-center transition-colors mb-1.5">
              <span className="material-symbols-outlined text-primary text-[22px]">coffee</span>
            </div>
            <span className="text-[11px] font-semibold text-on-surface">Dine-In</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectServiceAndTable('takeaway', selectedTable);
              onNavigateMenu('Beverages');
            }}
            className="group flex flex-col items-center text-center p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors shadow-sm cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-surface-container-high group-hover:bg-primary/20 flex items-center justify-center transition-colors mb-1.5">
              <span className="material-symbols-outlined text-secondary text-[22px]">
                shopping_bag
              </span>
            </div>
            <span className="text-[11px] font-semibold text-on-surface">Takeaway</span>
          </button>

          <button
            type="button"
            onClick={onNavigateRewards}
            className="group flex flex-col items-center text-center p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors shadow-sm cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-surface-container-high group-hover:bg-primary/20 flex items-center justify-center transition-colors mb-1.5">
              <span className="material-symbols-outlined icon-filled text-tertiary text-[22px]">
                loyalty
              </span>
            </div>
            <span className="text-[11px] font-semibold text-on-surface">Rewards</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigateMenu('Combos')}
            className="group flex flex-col items-center text-center p-2.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors shadow-sm cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-surface-container-high group-hover:bg-primary/20 flex items-center justify-center transition-colors mb-1.5">
              <span className="material-symbols-outlined text-primary text-[22px]">percent</span>
            </div>
            <span className="text-[11px] font-semibold text-on-surface">Offers</span>
          </button>
        </div>
      </div>

      {/* Responsive Desktop 2-Column Split: Special Combo + Favorites */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pb-5">
        {/* Today's Special Combo Showcase */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="relative w-full rounded-xl bg-gradient-to-br from-surface-container to-surface-container-low p-4 shadow-lg overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-36 h-36 bg-primary-container/15 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-primary-container text-on-primary text-[11px] font-bold uppercase tracking-wider">
                  Chef&apos;s Pick
                </span>
                <span className="text-xs text-primary font-medium">Daily Special Combo</span>
              </div>
              <div className="flex items-center gap-1 text-tertiary text-[11px] font-semibold">
                <span className="material-symbols-outlined text-[14px]">local_fire_department</span>
                <span>Saves 35%</span>
              </div>
            </div>

            <div className="mt-2.5 flex items-center gap-3.5">
              <div className="w-24 h-24 rounded-lg overflow-hidden shrink-0 bg-surface-container-highest shadow-inner">
                <CafeImage
                  src={specialCombo.imageUrl}
                  alt={specialCombo.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <h2 className="text-base text-on-surface font-semibold truncate leading-tight">
                  {specialCombo.name}
                </h2>
                <p className="text-xs text-on-surface-variant line-clamp-2 mt-1">
                  {specialCombo.description}
                </p>
                <div className="mt-2.5 flex items-center justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl text-primary font-bold tabular-nums">
                      ₹{specialCombo.price}
                    </span>
                    <span className="text-xs text-on-surface-variant line-through tabular-nums">
                      ₹310
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Add today's special combo"
                    onClick={() => {
                      onAddToCart(specialCombo);
                      onNotify(`Added ${specialCombo.name} to cart`);
                    }}
                    className="px-3 py-1.5 bg-primary hover:bg-primary-fixed-dim text-on-primary text-xs font-bold rounded-lg flex items-center gap-1 shadow-sm active:scale-95 transition-transform cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>Add</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Live Counter & Kitchen Assurance Badge */}
          <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-tertiary-container/20 shrink-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-tertiary text-[24px]">timer</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base text-on-surface font-semibold">
                Average Prep Time: 8-12 min
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Fresh handcrafted brews made to order at Counter 1.
              </p>
            </div>
          </div>
        </div>

        {/* Featured Best Sellers Grid */}
        <div className="lg:col-span-7">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined icon-filled text-primary text-[20px]">
                stars
              </span>
              <h2 className="text-lg text-on-surface font-bold">Patron Favorites</h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateMenu('Beverages')}
              className="text-xs text-primary font-semibold flex items-center gap-0.5 hover:underline cursor-pointer"
            >
              <span>View Full Menu</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {favorites.map((item) => (
              <div
                key={item.id}
                className="bg-surface-container p-2.5 rounded-xl flex flex-col justify-between shadow-sm group"
              >
                <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-container-highest mb-2">
                  <CafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-surface-container-lowest/80 backdrop-blur-md flex items-center gap-1">
                    <span className="material-symbols-outlined icon-filled text-primary text-[12px]">
                      star
                    </span>
                    <span className="text-[11px] text-on-surface font-bold tabular-nums">
                      {item.rating}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-sm text-on-surface font-semibold truncate">{item.name}</span>
                  <span className="text-xs text-on-surface-variant truncate">{item.description}</span>
                  <div className="flex items-center justify-between mt-2 pt-1">
                    <span className="text-base text-primary font-bold tabular-nums">₹{item.price}</span>
                    <button
                      type="button"
                      aria-label={`Add ${item.name} to cart`}
                      onClick={() => {
                        onAddToCart(item);
                        onNotify(`Added ${item.name} to cart`);
                      }}
                      className="w-9 h-9 rounded-full bg-surface-container-high text-primary hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Service Mode / Table Selector Dialog */}
      {tableModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setTableModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface-container-low rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-on-surface">Select Dining Mode &amp; Table</h3>
              <button
                type="button"
                aria-label="Close selector"
                onClick={() => setTableModalOpen(false)}
                className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(['dine-in', 'takeaway', 'delivery'] as ServiceMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSelectServiceAndTable(mode, selectedTable)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                    serviceMode === mode
                      ? 'bg-primary text-on-primary shadow-md'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {serviceMode === 'dine-in' && (
              <div className="space-y-2">
                <p className="text-xs text-on-surface-variant font-medium">Choose Table</p>
                <div className="grid grid-cols-4 gap-2">
                  {tables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onSelectServiceAndTable('dine-in', t.id);
                        setTableModalOpen(false);
                        onNotify(`Active table set to ${t.label}`);
                      }}
                      className={`py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        selectedTable === t.id
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-surface-container-high text-on-surface hover:bg-surface-bright'
                      }`}
                    >
                      {t.id}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setTableModalOpen(false)}
              className="w-full h-11 rounded-xl bg-primary text-on-primary font-bold text-sm cursor-pointer"
            >
              Confirm Selection
            </button>
          </div>
        </div>
      )}

      {/* Book a Table Dialog */}
      {bookingModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setBookingModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-surface-container-low rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-on-surface">Reserve Your Cozy Booth</h3>
              <button
                type="button"
                aria-label="Close reservation modal"
                onClick={() => setBookingModalOpen(false)}
                className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-on-surface-variant block mb-1">Party Size</label>
                <div className="grid grid-cols-3 gap-2">
                  {['2 Guests', '4 Guests', '6 Guests'].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setBookingGuests(g)}
                      className={`py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                        bookingGuests === g
                          ? 'bg-primary-container text-on-primary-container font-bold'
                          : 'bg-surface-container-high text-on-surface'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-on-surface-variant block mb-1">Evening Slot</label>
                <div className="grid grid-cols-3 gap-2">
                  {['6:30 PM', '7:30 PM', '8:30 PM'].map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setBookingTime(slot)}
                      className={`py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                        bookingTime === slot
                          ? 'bg-primary-container text-on-primary-container font-bold'
                          : 'bg-surface-container-high text-on-surface'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setBookingModalOpen(false);
                onNotify(`Reserved table for ${bookingGuests} at ${bookingTime}`);
              }}
              className="w-full h-11 rounded-xl bg-primary text-on-primary font-bold text-sm cursor-pointer"
            >
              Confirm Table Reservation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
