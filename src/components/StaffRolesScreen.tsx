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
import { authenticateStaffPinApi } from '../hooks/useCafeApi';
import { addStaffSchema, staffPinLoginSchema } from '../shared/schemas';
import { type PinAuthState, getStaffDutyStatus } from '../state/cafeStateMachines';
import { AuthSessionState, StaffMember, StaffShiftFilter } from '../types/cafe';
import { filterStaffRoster } from '../utils/cafeLogic';
import { CafeImage } from './CafeImage';

interface StaffRolesScreenProps {
  roster: StaffMember[];
  adminPinRequired: boolean;
  authSession?: AuthSessionState;
  onLoginPin?: (pin: string) => Promise<AuthSessionState>;
  onLogoutPin?: () => Promise<void>;
  onToggleAdminPin: (enabled: boolean) => void;
  onAddStaff: (member: Omit<StaffMember, 'id'>) => void;
  onToggleDuty: (id: string) => void;
  onNotify: (msg: string) => void;
}

type AddStaffValues = z.input<typeof addStaffSchema>;
type PinValues = z.input<typeof staffPinLoginSchema>;

export const StaffRolesScreen: React.FC<StaffRolesScreenProps> = ({
  roster,
  adminPinRequired,
  authSession,
  onLoginPin,
  onLogoutPin,
  onToggleAdminPin,
  onAddStaff,
  onToggleDuty,
  onNotify,
}) => {
  const [shiftFilter, setShiftFilter] = useState<StaffShiftFilter>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [selectedLogStaff, setSelectedLogStaff] = useState<StaffMember | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const pinAuth: PinAuthState = pinSubmitting
    ? { phase: 'submitting' }
    : authSession?.authenticated && authSession.session
      ? { phase: 'unlocked', staffName: authSession.session.staffName }
      : { phase: 'locked' };

  const staffForm = useForm<AddStaffValues>({
    resolver: zodResolver(addStaffSchema),
    defaultValues: {
      name: '',
      role: 'Kitchen',
      shiftLabel: '10 AM – 6 PM',
    },
  });

  const pinForm = useForm<PinValues>({
    resolver: zodResolver(staffPinLoginSchema),
    defaultValues: { pin: '' },
  });

  const onDutyCount = useMemo(
    () => roster.filter((s) => getStaffDutyStatus(s) === 'on_duty').length,
    [roster]
  );
  const morningCount = useMemo(
    () => roster.filter((s) => s.shiftBucket === 'morning').length,
    [roster]
  );
  const fullDayCount = useMemo(
    () => roster.filter((s) => s.shiftBucket === 'fullday').length,
    [roster]
  );
  const onFloorSummary = useMemo(() => {
    const active = roster.filter((s) => getStaffDutyStatus(s) === 'on_duty');
    if (active.length === 0) return 'No staff on duty';
    const admins = active.filter((s) => s.role === 'Admin').length;
    const kitchen = active.filter((s) => s.role === 'Kitchen').length;
    const parts = [
      admins > 0 ? `${admins} Admin` : null,
      kitchen > 0 ? `${kitchen} Kitchen` : null,
    ].filter(Boolean);
    return parts.join(' • ') || `${active.length} Assigned`;
  }, [roster]);

  const visibleRoster = useMemo(
    () => filterStaffRoster(roster, shiftFilter),
    [roster, shiftFilter]
  );

  const handleOpenAddStaff = () => {
    staffForm.reset({ name: '', role: 'Kitchen', shiftLabel: '10 AM – 6 PM' });
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
      roleIcon: parsed.role === 'Admin' ? 'shield_person' : 'skillet',
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
    setPinSubmitting(true);
    try {
      const data = onLoginPin
        ? await onLoginPin(parsed.pin)
        : await authenticateStaffPinApi(parsed.pin);
      setPinModalOpen(false);
      pinForm.reset({ pin: '' });
      onNotify(
        `Verified ${data.session?.staffName || 'Staff'} (${data.session?.role?.toUpperCase() || 'ACTIVE'}) — session active for 12 hours`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid PIN';
      pinForm.setError('pin', { message: msg });
    } finally {
      setPinSubmitting(false);
    }
  });

  const handleLockPinSession = async () => {
    try {
      if (onLogoutPin) {
        await onLogoutPin();
      } else {
        await fetch('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Non-fatal
    }
    onNotify('Staff PIN session locked');
  };

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
              • {roster.length} Registered
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
          <span className="text-xs text-primary font-bold truncate mt-0.5">Active Roster</span>
          <span className="text-[11px] text-on-surface-variant truncate">8 AM – 10 PM</span>
        </div>

        <div className="flex flex-col min-w-0 bg-surface-container-high/40 rounded-lg p-1.5">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider truncate">
            On Floor
          </span>
          <span className="text-xs text-on-surface font-bold truncate mt-0.5">
            {onDutyCount} Staff
          </span>
          <span className="text-[11px] text-secondary truncate">{onFloorSummary}</span>
        </div>

        <div className="flex flex-col min-w-0 pl-1">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider truncate">
            Attendance
          </span>
          <span className="text-xs text-tertiary font-bold truncate mt-0.5 tabular-nums">
            {roster.length > 0 ? Math.round((onDutyCount / roster.length) * 100) : 0}%
          </span>
          <span className="text-[11px] text-on-surface-variant truncate">Active Duty Rate</span>
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
          {visibleRoster.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-1 p-8 rounded-xl bg-surface-container-low text-center space-y-2">
              <span className="material-symbols-outlined text-3xl text-outline">badge</span>
              <p className="text-sm font-semibold text-on-surface">
                No staff scheduled for this shift filter
              </p>
              <button
                type="button"
                onClick={() => setShiftFilter('all')}
                className="px-3.5 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold cursor-pointer"
              >
                Show All Staff
              </button>
            </div>
          ) : (
            visibleRoster.map((staff) => {
              const onDuty = getStaffDutyStatus(staff) === 'on_duty';
              const isAdmin = staff.role === 'Admin';
              const staffPhone = staff.phone || '9876543210';

              return (
                <div
                  key={staff.id}
                  className={`relative overflow-hidden flex flex-col justify-between p-4 sm:p-5 rounded-3xl liquid-glass-card shadow-2xl transition-all space-y-4 border ${
                    onDuty
                      ? 'border-emerald-500/30'
                      : 'border-white/[0.08]'
                  }`}
                >
                  {onDuty && (
                    <div className="absolute -right-8 -top-8 w-24 h-24 bg-emerald-500/15 rounded-full blur-xl pointer-events-none" />
                  )}

                  {/* Header Row: Avatar + Name/Phone + Action Buttons */}
                  <div className="flex items-center justify-between gap-2.5 relative">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`relative w-12 h-12 rounded-full flex items-center justify-center text-sm font-black shrink-0 shadow-md ${
                          isAdmin
                            ? 'bg-gradient-to-tr from-amber-500/30 to-amber-400/10 text-amber-300 border border-amber-500/40'
                            : onDuty
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-surface-container-high/90 text-on-surface-variant border border-white/[0.08]'
                        }`}
                      >
                        {staff.initials}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-background flex items-center justify-center ${
                            onDuty ? 'bg-emerald-500' : 'bg-outline'
                          }`}
                        />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm sm:text-base text-on-surface font-extrabold truncate tracking-tight">
                            {staff.name}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase shrink-0 ${
                              onDuty
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-surface-container-highest text-on-surface-variant border border-white/[0.08]'
                            }`}
                          >
                            {onDuty ? 'ON DUTY' : 'OFF DUTY'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-on-surface-variant/80 text-xs sm:text-sm mt-0.5">
                          <span className="material-symbols-outlined text-[15px] -rotate-12 shrink-0">
                            call
                          </span>
                          <span className="tabular-nums font-medium tracking-wide">
                            +91 {staffPhone}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Icon Buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-label={`Toggle duty for ${staff.name}`}
                        onClick={() => onToggleDuty(staff.id)}
                        className={`w-10 h-10 rounded-2xl border flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
                          onDuty
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                            : 'bg-surface-container-high/80 border-white/[0.08] text-on-surface-variant hover:text-primary hover:border-primary/40'
                        }`}
                        title={onDuty ? 'Clock Out Staff' : 'Clock In Staff'}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {onDuty ? 'logout' : 'login'}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Call ${staff.name}`}
                        onClick={() => onNotify(`Calling ${staff.name} (+91 ${staffPhone})`)}
                        className="w-10 h-10 rounded-2xl bg-surface-container-high/80 border border-white/[0.08] flex items-center justify-center text-on-surface-variant hover:text-on-surface active:scale-95 transition-all cursor-pointer shadow-sm hover:border-white/20"
                        title="Call Staff"
                      >
                        <span className="material-symbols-outlined text-[18px]">call</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`View log for ${staff.name}`}
                        onClick={() => setSelectedLogStaff(staff)}
                        className="w-10 h-10 rounded-2xl bg-surface-container-high/80 border border-white/[0.08] flex items-center justify-center text-on-surface-variant hover:text-primary active:scale-95 transition-all cursor-pointer shadow-sm hover:border-primary/40"
                        title="View Activity Log"
                      >
                        <span className="material-symbols-outlined text-[18px]">history</span>
                      </button>
                    </div>
                  </div>

                  {/* Middle Metrics Inset Card */}
                  <div className="grid grid-cols-3 gap-2 py-3 px-4 rounded-2xl bg-black/40 backdrop-blur-md border border-white/[0.05] text-center items-center shadow-inner">
                    <div className="flex flex-col">
                      <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Shift</span>
                      <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight">
                        {staff.shiftLabel}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Performance</span>
                      <span className="text-xs sm:text-sm md:text-base text-[#f59e0b] dark:text-[#fbbf24] font-black tabular-nums tracking-tight">
                        {staff.statRight || '98% On Time'}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] text-on-surface-variant/70 font-semibold mb-0.5">Role</span>
                      <span className="text-xs sm:text-sm md:text-base text-on-surface font-black tabular-nums tracking-tight">
                        {staff.role}
                      </span>
                    </div>
                  </div>

                  {/* Footer Row: Station Badge & Shift Schedule */}
                  <div className="flex items-center justify-between gap-3 text-xs sm:text-sm pt-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="material-symbols-outlined text-[18px] text-primary shrink-0">
                        {staff.stationIcon || 'coffee'}
                      </span>
                      <span className="text-xs text-on-surface-variant/80 font-medium truncate">
                        {staff.stationBadge}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-on-surface-variant/70 text-xs shrink-0 font-medium">
                      <span className="material-symbols-outlined text-[15px]">schedule</span>
                      <span>{onDuty ? 'Active Now' : 'Off Shift'}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Reference Preview */}
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
              Assign an app role and shift window for floor operations.
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
                  placeholder="Staff name"
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
                    <option value="Admin">Admin</option>
                    <option value="Kitchen">Kitchen</option>
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

      {/* Staff PIN Verification Dialog */}
      <Dialog open={pinModalOpen} onOpenChange={setPinModalOpen}>
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-sm rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-on-surface">
              Staff PIN Verification
            </DialogTitle>
            <DialogDescription className="text-xs text-on-surface-variant">
              Enter your 4-digit PIN to unlock staff features for 12 hours.
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
                disabled={pinSubmitting}
                className="flex-1 py-2.5 rounded-lg bg-primary-container text-on-primary text-sm font-bold cursor-pointer disabled:opacity-50"
              >
                {pinSubmitting ? 'Verifying...' : 'Unlock Session'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Shift Punch Log Dialog */}
      <Dialog
        open={Boolean(selectedLogStaff)}
        onOpenChange={(open) => !open && setSelectedLogStaff(null)}
      >
        <DialogContent className="bg-surface-container border border-outline-variant/30 text-on-surface sm:max-w-md rounded-2xl p-5">
          {selectedLogStaff && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">history</span>
                  <span>Shift Punch Log · {selectedLogStaff.name}</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-on-surface-variant">
                  {selectedLogStaff.role} · Scheduled {selectedLogStaff.shiftLabel}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-surface-container-low">
                    <span className="text-[10px] uppercase tracking-wider text-on-surface-variant block">
                      Duty Status
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        selectedLogStaff.isOnDuty ? 'text-tertiary' : 'text-on-surface-variant'
                      }`}
                    >
                      {selectedLogStaff.isOnDuty ? 'Active · On Floor' : 'Off Duty'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-surface-container-low">
                    <span className="text-[10px] uppercase tracking-wider text-on-surface-variant block">
                      Assigned Station
                    </span>
                    <span className="text-sm font-bold text-on-surface truncate block">
                      {selectedLogStaff.stationBadge}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl bg-surface-container-low p-3 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Verified Shift Timeline
                  </p>
                  <div className="flex items-center justify-between py-1 border-b border-outline-variant/15">
                    <span className="text-on-surface font-medium">
                      {selectedLogStaff.isOnDuty ? 'Current Punch In' : 'Last Punch Out'}
                    </span>
                    <span className="text-primary font-mono font-semibold">
                      {selectedLogStaff.statRight}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-outline-variant/15">
                    <span className="text-on-surface font-medium">Shift Performance</span>
                    <span className="text-tertiary font-semibold">{selectedLogStaff.statLeft}</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-on-surface font-medium">Shift Window</span>
                    <span className="text-on-surface-variant">{selectedLogStaff.shiftLabel}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogStaff(null)}
                className="w-full py-2.5 rounded-xl bg-primary-container text-on-primary text-xs font-bold cursor-pointer"
              >
                Close Punch Log
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
