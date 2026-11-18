import React, { useEffect, useState } from 'react';
import { CafeBrandEmblem } from './CafeBrandEmblem';
import { CoffeeBrewLoader } from './CoffeeBrewLoader';

interface SplashScreenProps {
  errorMessage?: string;
  onRetry: () => void;
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  errorMessage,
  onRetry,
  onFinish,
}) => {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    if (errorMessage) return;

    // Artisanal 2.2-second brew pouring journey so user can enjoy the animation
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            onFinish?.();
          }, 300);
          return 100;
        }
        const delta = Math.floor(Math.random() * 8 + 6);
        return Math.min(100, prev + delta);
      });
    }, 140);

    return () => clearInterval(interval);
  }, [errorMessage, onFinish]);

  return (
    <main className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-surface px-6 py-10 text-center text-on-surface select-none">
      {/* Ambient Cafe Lights */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary-container/10 blur-3xl" />

      <section className="relative z-10 flex w-full max-w-sm flex-col items-center">
        {/* Brand Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded-lg bg-surface-container-high p-1 shadow-md border border-outline-variant/30 flex items-center justify-center">
            <CafeBrandEmblem className="h-full w-full" />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-primary-fixed-dim">
            Seth Sawariya Cafe
          </span>
        </div>

        <p className="text-[11px] font-medium text-on-surface-variant mb-5">
          Artisanal Roastery &amp; Fast Kitchen
        </p>

        {errorMessage ? (
          <div
            className="w-full rounded-2xl border border-error/20 bg-surface-container-low p-6 shadow-xl"
            role="alert"
          >
            <span className="material-symbols-outlined mb-2 text-3xl text-error">cloud_off</span>
            <p className="text-sm font-bold text-on-surface">Connection Interrupted</p>
            <p className="mt-1 text-xs text-on-surface-variant">{errorMessage}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-on-primary shadow-lg hover:bg-primary-container transition-all active:scale-95 cursor-pointer"
            >
              Reconnect to Cafe
            </button>
          </div>
        ) : (
          /* The signature Coffee Brewing & Pouring Loader */
          <div className="w-full rounded-2xl bg-surface-container-low/85 border border-outline-variant/20 p-5 shadow-2xl backdrop-blur-sm relative">
            <CoffeeBrewLoader
              size="md"
              title="Brewing Your Experience"
              progress={progress}
              interactive={true}
            />

            {/* Quick Enter / Skip CTA */}
            <div className="mt-4 pt-3 border-t border-outline-variant/15 flex items-center justify-center">
              <button
                type="button"
                onClick={() => onFinish?.()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-surface-container hover:bg-surface-container-high text-xs font-semibold text-primary transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                <span>Enter Cafe</span>
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </button>
            </div>
          </div>
        )}
      </section>

      <footer className="absolute bottom-6 z-10 flex flex-col items-center gap-0.5 text-center">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-outline">
          <span className="material-symbols-outlined text-[14px] text-tertiary">check_circle</span>
          <span>CafeOS 2.0 Real-time Mesh</span>
        </div>
        <p className="text-[10px] text-outline-variant">
          High-Efficiency Hospitality &amp; UPI Architecture
        </p>
      </footer>
    </main>
  );
};
