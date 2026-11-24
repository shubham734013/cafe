import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface BookTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (details: { guests: string }) => Promise<string>;
}

const GUEST_OPTIONS = [
  '1 Person',
  '2 People',
  '3 People',
  '4 People',
  '6 People',
  '8+ People',
];

export const BookTableModal: React.FC<BookTableModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedGuests, setSelectedGuests] = useState('2 People');
  const [isBooked, setIsBooked] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsBooked(false);
      setBookingError('');
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    []
  );

  if (!isOpen) return null;

  const handleBook = async () => {
    if (isBooking || isBooked) return;
    setIsBooking(true);
    setBookingError('');
    try {
    const tableId = await onConfirm({ guests: selectedGuests });
      setIsBooked(true);
    toast.success(`Table ${tableId} is ready for ${selectedGuests}.`);
      closeTimerRef.current = window.setTimeout(() => {
        setIsBooked(false);
        onClose();
      }, 1200);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reserve a table.';
      setBookingError(message);
      toast.error(message);
    } finally {
      setIsBooking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-table-title"
    >
      <div className="relative w-full max-w-sm rounded-3xl bg-surface-container-low border border-outline-variant shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header matching Panel 11 */}
        <div className="flex items-center justify-between px-5 py-4 bg-surface-container-low border-b border-outline-variant">
          <button
            type="button"
            onClick={onClose}
            disabled={isBooking}
            className="w-9 h-9 rounded-full bg-surface-container border border-outline-variant flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
            aria-label="Back"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <h2 id="book-table-title" className="text-sm font-bold text-on-surface tracking-tight">
            Find a Seat
          </h2>
          <div className="w-9" />
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Cafe Interior Banner Photo */}
          <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-outline-variant shadow-xs">
            <img
              src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80"
              alt="Dine-in at The Sawariya Cafe"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            <div className="absolute bottom-2 left-3 right-3 text-white">
              <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full bg-[#382319]/80 backdrop-blur-xs">
                Premium Seating
              </span>
            </div>

          </div>

          {/* Heading & Subtext */}
          <div>
            <h3 className="text-base font-bold text-on-surface font-serif">
              Dine-in at The Sawariya Cafe
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
              Available seating only - no date or fixed-time booking.
            </p>
          </div>

          {/* Immediate Seating */}
          <div className="space-y-3">
            {/* Guests Picker */}
            <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant p-3 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-primary">
                  group
                </span>
                <select
                  value={selectedGuests}
                  onChange={(e) => setSelectedGuests(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-on-surface outline-hidden cursor-pointer"
                  aria-label="Select Number of Guests"
                >
                  {GUEST_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                expand_more
              </span>
            </div>
          </div>
          {bookingError && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
            >
              {bookingError}
            </p>
          )}
        </div>

        {/* Footer Action Button */}
        <div className="p-4 bg-surface-container-low border-t border-outline-variant">
          <button
            type="button"
            onClick={() => void handleBook()}
            disabled={isBooking || isBooked}
            className="w-full py-3.5 px-4 rounded-2xl bg-primary hover:brightness-90 text-on-primary font-bold text-xs tracking-wide flex items-center justify-center gap-2 transition-transform active:scale-[0.98] cursor-pointer shadow-md disabled:opacity-75"
          >
            <span>{isBooked ? 'Seat Ready ✓' : isBooking ? 'Finding an Available Seat…' : 'Sit Here Now'}</span>
            {!isBooked && !isBooking && (
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
