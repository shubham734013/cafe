import React, { useEffect, useState } from 'react';
import { CafeBrandEmblem } from './CafeBrandEmblem';

interface SplashScreenProps {
  onEnterCustomer: () => void;
  onEnterStaff: () => void;
}

const PHRASES = [
  'Warming the espresso group head...',
  'Brewing your experience...',
  'Synchronizing live KOT tables...',
  'Setting cozy cafe ambiance...',
];

const WIDTHS = ['45%', '68%', '84%', '96%'];

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onEnterCustomer,
  onEnterStaff,
}) => {
  const [index, setIndex] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % PHRASES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen w-full bg-surface text-on-surface flex flex-col justify-between items-center text-center relative overflow-hidden py-10 px-6">
      {/* Warm Atmospheric Light Orbs */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Hub Identifier */}
      <div className="relative z-10 pt-2 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-low shadow-sm">
        <span className="w-2 h-2 rounded-full bg-tertiary shadow-[0_0_8px_#51e77b] animate-pulse" />
        <span className="text-[11px] font-medium text-on-surface-variant tracking-wider uppercase">
          CafeOS v2.4 · Active Hub
        </span>
      </div>

      {/* Central Hero Branding */}
      <div className="relative z-10 flex flex-col items-center max-w-sm w-full mx-auto my-auto py-8">
        <div className="relative mb-8 flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-primary-container/30 to-primary/20 blur-xl scale-125" />
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-surface-container-lowest p-4 shadow-2xl flex items-center justify-center">
            <CafeBrandEmblem className="w-full h-full drop-shadow-[0_0_12px_rgba(245,158,11,0.45)]" />
          </div>
        </div>

        <h1 className="text-[28px] sm:text-[32px] leading-tight text-primary tracking-tight font-bold mb-2">
          Seth Sawariya Cafe
        </h1>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />
          <span className="text-xs font-semibold tracking-widest text-on-surface-variant uppercase">
            Artisanal Roastery &amp; Kitchen
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />
        </div>
        <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
          Complete Cafe Experience · Great Coffee · Cozy Vibes
        </p>

        {/* Warm Progress & Status Card */}
        <div className="w-full max-w-xs mt-10 bg-surface-container-low/90 rounded-xl p-5 shadow-lg flex flex-col items-center">
          <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden relative mb-4">
            <div
              className="h-full bg-gradient-to-r from-primary via-primary-container to-secondary rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(245,158,11,0.6)]"
              style={{ width: WIDTHS[index] }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined icon-filled text-primary text-base animate-spin">
              coffee
            </span>
            <span className="text-xs text-on-surface font-medium tracking-wide transition-opacity duration-200">
              {PHRASES[index]}
            </span>
          </div>
          <span className="mt-3 text-[11px] px-2.5 py-0.5 rounded-full bg-surface-container text-primary-fixed-dim">
            Syncing live POS &amp; menu items
          </span>
        </div>

        {/* Workspace Launch Actions */}
        <div className="w-full max-w-xs mt-6 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onEnterCustomer}
            className="h-12 rounded-xl bg-primary-container hover:bg-primary text-on-primary font-bold text-sm flex items-center justify-center gap-1.5 shadow-[0_0_18px_rgba(245,158,11,0.3)] active:scale-[0.98] transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined icon-filled text-[18px]">local_cafe</span>
            <span>Enter Cafe</span>
          </button>
          <button
            type="button"
            onClick={onEnterStaff}
            className="h-12 rounded-xl bg-surface-container-high hover:bg-surface-bright text-on-surface font-semibold text-sm flex items-center justify-center gap-1.5 shadow-md active:scale-[0.98] transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px] text-primary">point_of_sale</span>
            <span>Staff POS</span>
          </button>
        </div>
      </div>

      {/* Bottom Brand Credential */}
      <div className="relative z-10 pb-2 flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-outline text-sm">local_cafe</span>
          <p className="text-xs text-outline tracking-wider font-semibold">Powered by CafeOS</p>
        </div>
        <p className="text-[11px] text-outline-variant">High-Efficiency Hospitality Architecture</p>
      </div>
    </div>
  );
};
