import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { addStaffSchema, staffPinLoginSchema } from '../shared/schemas';
import { StaffMember, StaffShiftFilter } from '../types/cafe';
import { filterStaffRoster } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';

interface StaffRolesScreenProps {
  roster: StaffMember[];
  managerPinRequired: boolean;
  onToggleManagerPin: (enabled: boolean) => void;
  onAddStaff: (member: Omit<StaffMember, 'id'>) => void;
  onToggleDuty: (id: string) => void;
  onNotify: (msg: string) => void;
}

type AddStaffValues = z.input<typeof addStaffSchema>;
type PinValues = z.input<typeof staffPinLoginSchema>;

export const StaffRolesScreen: React.FC<StaffRolesScreenProps> = ({
  roster,
  managerPinRequired,
  onToggleManagerPin,
  onAddStaff,
  onToggleDuty,
  onNotify,
}) => {
  const [shiftFilter, setShiftFilter] = useState<StaffShiftFilter>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);

  const staffForm = useForm<AddStaffValues>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: {
      name: '',
      role: 'Barista',
      shiftLabel: '10 AM – 6 PM',
    },
  });

  const pinForm = useForm<PinValues>({
    resolver: zodResolver(staffPinLoginSchema),
    defaultValues: { pin: '' },
  });

  const onDutyCount = useMemo(() => roster.filter((s) => s.isOnDuty).length, [roster]);
  const morningCount = useMemo(
    () => roster.filter((s) => s.shiftBucket === 'morning').length,
    [roster]
  );
  const fullDayCount = useMemo(
    () => roster.filter((s) => s.shiftBucket === 'fullday').length,
    [roster]
  );

  const visibleRoster = useMemo(
    () => filterStaffRoster(roster, shiftFilter),
    [roster, shiftFilter]
  );

  const handleOpenAddStaff = () => {
    staffForm.reset({ name: '', role: 'Barista', shiftLabel: '10 AM – 6 PM' });
    setAddModalOpen(true);
  };

  const handleCreateStaff = staffForm.handleSubmit((values) => {
    const parsed = addStaffSchema.parse(values);
    const parts = parsed.name.split(/\s+/);
    const initials = (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
    onAddStaff({
      initials,
      name: parsed.name,
      role: parsed.role,
      roleIcon:
        parsed.role === 'Cashier'
          ? 'point_of_sale'
          : parsed.role === 'Store Manager'
            ? 'shield_person'
            : 'coffee_maker',
      shiftLabel: parsed.shiftLabel,
      shiftBucket: 'afternoon',
      isOnDuty: true,
      statLeft: '4.8 Efficiency',
      statRight: 'Clocked In',
      stationBadge: `${parsed.role} Station Active`,
      stationIcon: 'verified_user',
    });
    setAddModalOpen(false);
  });

  const handleVerifyPin = pinForm.handleSubmit(async (values) => {
    const parsed = staffPinLoginSchema.parse(values);
    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        pinForm.setError('pin', { message: data.error || 'Invalid PIN' });
        return;
      }
      setPinVerified(true);
      setPinModalOpen(false);
      pinForm.reset({ pin: '' });
      onNotify('Manager PIN verified — session active for 12 hours');
    } catch {
      pinForm.setError('pin', { message: 'Unable to reach auth server' });
    }
  });

  return (
    <div className="flex flex-col w-full pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex flex-col min-w-0">
          <h1 className="text-xl font-bold text-on-surface tracking-tight">Staff &amp; Roles</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
              {onDutyCount} On Duty
            </span>
            <span className="text-on-surface-variant text-[11px]">
              • {roster.length + 1} Registered
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAddStaff}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-container text-on-primary text-xs font-bold shadow-md active:scale-95 transition-transform shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          <span>Add Staff</span>
        </button>
      </div>

      {/* Operational Snapshot Strip */}
      <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-surface-container shadow-sm">
        <div className="flex flex-col min-w-0 pr-1">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider truncate">
            Shift
          </span>
          <span className="text-xs text-primary font-bold truncate mt-0.5">Afternoon</span>
          <span className="text-[11px] text-on-surface-variant truncate">2 PM – 10 PM</span>
        </div>

        <div className="flex flex-col min-w-0 bg-surface-container-high/40 rounded-lg p-1.5">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider truncate">
            On Floor
          </span>
          <span className="text-xs text-on-surface font-bold truncate mt-0.5">
            {onDutyCount} Staff
          </span>
          <span className="text-[11px] text-secondary truncate">1 Mgr • 1 Pos • 2 Kit</span>
        </div>

        <div className="flex flex-col min-w-0 pl-1">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider truncate">
            Clock-In
          </span>
          <span className="text-xs text-tertiary font-bold truncate mt-0.5 tabular-nums">100%</span>
          <span className="text-[11px] text-on-surface-variant truncate">On-Time Punch</span>
        </div>
      </div>

      {/* Shift Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {(
          [
            { id: 'all', label: `All Staff (${roster.length})` },
            { id: 'active', label: `Current Shift (${onDutyCount})` },
            { id: 'morning', label: `Morning (${morningCount})` },
            { id: 'fullday', label: `Full Day (${fullDayCount})` },
          ] as { id: StaffShiftFilter; label: string }[]
        ).map((pill) => {
          const active = shiftFilter === pill.id;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => setShiftFilter(pill.id)}
              className={`px-3 py-1.5 rounded-full text-xs shrink-0 transition-colors cursor-pointer ${
                active
                  ? 'bg-primary-container text-on-primary font-bold shadow-sm'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Roster + Role Permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3">
          {visibleRoster.map((staff) => (
            <div
              key={staff.id}
              className={`rounded-xl p-3.5 flex flex-col space-y-3 shadow-md ${
                staff.isOnDuty ? 'bg-surface-container' : 'bg-surface-container/70 opacity-90'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${
                        staff.role === 'Store Manager'
                          ? 'bg-primary-container text-on-primary'
                          : 'bg-surface-container-highest text-primary'
                      }`}
                    >
                      {staff.initials}
                    </div>
                    <span
                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-surface-container ${
                        staff.isOnDuty ? 'bg-tertiary' : 'bg-outline'
                      }`}
                    />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-on-surface font-bold truncate">
                        {staff.name}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          staff.isOnDuty
                            ? 'bg-tertiary-container/20 text-tertiary'
                            : 'bg-surface-container-highest text-on-surface-variant'
                        }`}
                      >
                        {staff.isOnDuty ? 'Active' : 'Off Duty'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-primary font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          {staff.roleIcon}
                        </span>
                        {staff.role}
                      </span>
                      <span className="text-on-surface-variant text-[11px]">•</span>
                      <span className="text-xs text-on-surface-variant">{staff.shiftLabel}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={`Toggle duty for ${staff.name}`}
                  onClick={() => onToggleDuty(staff.id)}
                  className="text-on-surface-variant hover:text-primary p-1 rounded-lg cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">more_vert</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-surface-container-low rounded-lg p-2.5 text-xs">
                <span className="text-on-surface-variant truncate">{staff.statLeft}</span>
                <span className="text-right font-semibold text-primary truncate">
                  {staff.statRight}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant text-[11px] truncate">
                  <span className="material-symbols-outlined text-[13px] text-primary">
                    {staff.stationIcon}
                  </span>
                  {staff.stationBadge}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onNotify(`${staff.name} shift punch log verified (${staff.shiftLabel})`)
                    }
                    className="px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface hover:text-primary text-xs font-medium cursor-pointer"
                  >
                    View Log
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleDuty(staff.id)}
                    className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold cursor-pointer"
                  >
                    {staff.isOnDuty ? 'Clock Out' : 'Clock In'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Reference Preview + Role Permissions Master */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl bg-surface-container-low p-3 flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                <span className="text-[11px] text-on-surface font-bold uppercase tracking-wider">
                  CafeOS Roster Sync
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant">Live Shift Roster</span>
            </div>
            <div className="w-full h-28 rounded-lg overflow-hidden relative">
              <CafeImage
                src={CAFE_ASSETS.loyaltySyncRef}
                alt="CafeOS Staff and Operations System Reference"
                className="w-full h-full object-cover object-top opacity-75 hover:opacity-100 transition-opacity"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low via-transparent to-transparent pointer-events-none" />
            </div>
          </div>

          <div className="rounded-xl bg-surface-container p-4 flex flex-col space-y-3.5 shadow-md">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-container/20 flex items-center justify-center text-primary-container">
                <span className="material-symbols-outlined text-[18px]">lock_person</span>
              </div>
              <div>
                <h2 className="text-sm font-bold text-on-surface">Role Permissions Master</h2>
                <p className="text-xs text-on-surface-variant">
                  Security tiers across POS and kitchen tablets
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-primary font-bold">Admin / Mgr</span>
                  <span className="px-1.5 py-0.5 rounded bg-tertiary-container/20 text-tertiary text-[10px] font-bold">
                    Full
                  </span>
                </div>
                <span className="text-on-surface-variant text-[11px] mt-1">
                  Discounts, refunds, staff rates, tax changes &amp; closing day
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface font-bold">Cashier</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-variant text-on-surface text-[10px] font-bold">
                    POS Only
                  </span>
                </div>
                <span className="text-on-surface-variant text-[11px] mt-1">
                  Bill punch, split settlement, UPI QR &amp; shift cash handoff
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface font-bold">Barista</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-variant text-on-surface text-[10px] font-bold">
                    KOT Only
                  </span>
                </div>
                <span className="text-on-surface-variant text-[11px] mt-1">
                  KOT queue view, bump tickets &amp; ingredient 86-list toggles
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-on-surface font-bold">Server</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface-variant text-on-surface text-[10px] font-bold">
                    Order Take
                  </span>
                </div>
                <span className="text-on-surface-variant text-[11px] mt-1">
                  Table allocation, captain pad order taking, no bill settlement
                </span>
              </div>
            </div>

            {/* PIN Safeguard Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-high/60 gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="material-symbols-outlined text-primary text-[20px] shrink-0 mt-0.5">
                  pin
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs text-on-surface font-bold truncate">
                    Require Manager PIN for Bill Cancellation
                  </span>
                  <span className="text-[11px] text-on-surface-variant truncate">
                    Prevents unverified voids &amp; line cancellations
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    pinForm.reset({ pin: '' });
                    setPinModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-md bg-surface-container-highest text-primary text-[11px] font-semibold hover:bg-surface-bright cursor-pointer"
                >
                  {pinVerified ? 'PIN Active' : 'Verify PIN'}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={managerPinRequired}
                  aria-label="Require Manager PIN for Bill Cancellation"
                  onClick={() => onToggleManagerPin(!managerPinRequired)}
                  className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors shrink-0 cursor-pointer ${
                    managerPinRequired ? 'bg-primary-container justify-end' : 'bg-surface-variant justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-on-surface shadow-sm" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Staff Dialog */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Add Staff Member
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Assign station role and shift window for floor operations.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateStaff} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  {...staffForm.register('name')}
                  placeholder="e.g. Aarav Tiwari"
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {staffForm.formState.errors.name && (
                  <p className="text-[11px] text-error mt-1">
                    {staffForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Role
                  </label>
                  <select
                    {...staffForm.register('role')}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="Barista">Head Barista</option>
                    <option value="Cashier">Cashier</option>
                    <option value="Kitchen Line">Kitchen Line</option>
                    <option value="Store Manager">Store Manager</option>
                    <option value="Server / Steward">Server / Steward</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                    Shift
                  </label>
                  <input
                    type="text"
                    {...staffForm.register('shiftLabel')}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {staffForm.formState.errors.shiftLabel && (
                    <p className="text-[11px] text-error mt-1">
                      {staffForm.formState.errors.shiftLabel.message}
                    </p>
                  )}
                </div>
              </div>
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
                Save Staff
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Manager PIN Verification Dialog */}
      <Dialog open={pinModalOpen} onOpenChange={setPinModalOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-sm rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Manager PIN Verification
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Enter 4-digit staff PIN to issue a signed HTTP-only session cookie (default: 1234).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                4-Digit Staff PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                {...pinForm.register('pin')}
                placeholder="••••"
                className="w-full px-3 py-2.5 rounded-lg bg-surface-container-low text-on-surface text-center text-lg tracking-[0.5em] font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {pinForm.formState.errors.pin && (
                <p className="text-[11px] text-error mt-1">
                  {pinForm.formState.errors.pin.message}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPinModalOpen(false)}
                className="flex-1 py-2.5 rounded-lg bg-surface-container-high text-on-surface text-sm font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-lg bg-primary-container text-on-primary text-sm font-bold cursor-pointer"
              >
                Unlock Session
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
