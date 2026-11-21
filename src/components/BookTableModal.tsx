import React, { useState } from 'react';
import { toast } from 'sonner';

interface BookTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (details: { date: string; time: string; guests: string }) => Promise<string>;
}

const DATE_OPTIONS = Array.from({ length: 5 }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() + index);
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(date);
});

const TIME_OPTIONS = [
  '12:00 PM',
  '1:30 PM',
  '3:30 PM',
  '5:00 PM',
  '7:00 PM',
  '8:30 PM',
  '9:30 PM',
];

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
  const [selectedDate, setSelectedDate] = useState(DATE_OPTIONS[4] ?? DATE_OPTIONS[0] ?? '');
  const [selectedTime, setSelectedTime] = useState('7:00 PM');
  const [selectedGuests, setSelectedGuests] = useState('2 People');
  const [isBooked, setIsBooked] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState('');

  if (!isOpen) return null;

  const handleBook = async () => {
    if (isBooking || isBooked) return;
    setIsBooking(true);
    setBookingError('');
    try {
      const tableId = await onConfirm({
        date: selectedDate,
        time: selectedTime,
        guests: selectedGuests,
      });
      setIsBooked(true);
      toast.success(`Table ${tableId} confirmed for ${selectedGuests} at ${selectedTime}.`);
      window.setTimeout(() => {
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
      <div className="relative w-full max-w-sm rounded-3xl bg-[#FAF7F2] border border-[#EAE2D7] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header matching Panel 11 */}
        <div className="flex items-center justify-between px-5 py-4 bg-white border-b border-[#EAE2D7]">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-[#FAF7F2] border border-[#EAE2D7] flex items-center justify-center text-[#1F1610] hover:bg-[#F3ECE2] transition-colors cursor-pointer"
            aria-label="Back"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <h2 id="book-table-title" className="text-sm font-bold text-[#1F1610] tracking-tight">
            Book a Table
          </h2>
          <div className="w-9" />
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Cafe Interior Banner Photo */}
          <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-[#EAE2D7] shadow-xs">
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

            {bookingError && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {bookingError}
              </p>
            )}
          </div>

          {/* Heading & Subtext */}
          <div>
            <h3 className="text-base font-bold text-[#1F1610] font-serif">
              Dine-in at The Sawariya Cafe
            </h3>
            <p className="text-xs text-[#7A7067] mt-0.5 leading-relaxed">
              Great food, cozy ambiance and your favorite seat.
            </p>
          </div>

          {/* Selection Pickers */}
          <div className="space-y-3">
            {/* Date Picker */}
            <div className="rounded-2xl bg-white border border-[#EAE2D7] p-3 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-[#382319]">
                  calendar_today
                </span>
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-[#1F1610] outline-hidden cursor-pointer"
                  aria-label="Select Date"
                >
                  {DATE_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <span className="material-symbols-outlined text-[18px] text-[#7A7067]">
                expand_more
              </span>
            </div>

            {/* Time Picker */}
            <div className="rounded-2xl bg-white border border-[#EAE2D7] p-3 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-[#382319]">
                  schedule
                </span>
                <select
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-[#1F1610] outline-hidden cursor-pointer"
                  aria-label="Select Time"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <span className="material-symbols-outlined text-[18px] text-[#7A7067]">
                expand_more
              </span>
            </div>

            {/* Guests Picker */}
            <div className="rounded-2xl bg-white border border-[#EAE2D7] p-3 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px] text-[#382319]">
                  group
                </span>
                <select
                  value={selectedGuests}
                  onChange={(e) => setSelectedGuests(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-[#1F1610] outline-hidden cursor-pointer"
                  aria-label="Select Number of Guests"
                >
                  {GUEST_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <span className="material-symbols-outlined text-[18px] text-[#7A7067]">
                expand_more
              </span>
            </div>
          </div>
        </div>

        {/* Footer Action Button */}
        <div className="p-4 bg-white border-t border-[#EAE2D7]">
          <button
            type="button"
            onClick={() => void handleBook()}
            disabled={isBooking || isBooked}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#382319] hover:bg-[#2A1A13] text-white font-bold text-xs tracking-wide flex items-center justify-center gap-2 transition-transform active:scale-[0.98] cursor-pointer shadow-md disabled:opacity-75"
          >
            <span>{isBooked ? 'Table Reserved ✓' : isBooking ? 'Finding a Table…' : 'Find a Table'}</span>
            {!isBooked && !isBooking && (
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
