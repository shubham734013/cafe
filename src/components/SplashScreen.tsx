import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  errorMessage?: string;
  onRetry: () => void;
  onFinish?: () => void;
}

const BRAND_NAME = 'SETH SAWARIYA';

export const SplashScreen: React.FC<SplashScreenProps> = ({
  errorMessage,
  onRetry,
  onFinish,
}) => {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Grinding Beans');
  const [isReady, setIsReady] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (errorMessage) return;

    let current = 0;
    const brewTimer = setInterval(() => {
      current += Math.floor(Math.random() * 4) + 1;

      if (current >= 100) {
        current = 100;
        clearInterval(brewTimer);
        setIsReady(true);
        setStage('Welcome');

        // Allow user to admire the completed gauge before smooth fade out
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            onFinish?.();
          }, 650);
        }, 400);
      }

      setProgress(current);

      if (current < 35) {
        setStage('Grinding Beans');
      } else if (current < 75) {
        setStage('Pouring Crema');
      } else if (current < 100) {
        setStage('Serving Warm');
      }
    }, 55);

    return () => clearInterval(brewTimer);
  }, [errorMessage, onFinish]);

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      onFinish?.();
    }, 200);
  };

  return (
    <main
      className="brand-loader-root fixed inset-0 z-50 flex items-center justify-center overflow-hidden select-none"
      role="status"
      aria-label="Loading Seth Sawariya Cafe"
    >
      <style>{`
        .brand-loader-root {
          --bg-cream: #F9F5EE;
          --espresso: #1E140F;
          --roast: #4A3224;
          --crema: #C59B67;
          --hairline: rgba(30, 20, 15, 0.14);
          background-color: var(--bg-cream);
          color: var(--espresso);
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .dark .brand-loader-root {
          --bg-cream: #120D0A;
          --espresso: #F5EFEB;
          --roast: #D4B28C;
          --crema: #E0AC69;
          --hairline: rgba(245, 239, 235, 0.14);
        }

        /* Subtle warm radial ambient glow */
        .brand-loader-root::before {
          content: "";
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at 50% 45%, rgba(197, 155, 103, 0.12), transparent 65%);
          pointer-events: none;
        }

        .brand-loader-container {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 2rem;
          max-width: 720px;
          width: 100%;
          transition: opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .brand-loader-container.fade-out {
          opacity: 0;
          transform: translateY(-10px);
          pointer-events: none;
        }

        /* 1. Monoline Coffee Cup & Steam */
        .cup-svg {
          width: 56px;
          height: 56px;
          margin-bottom: 1.75rem;
          overflow: visible;
        }

        .cup-line {
          fill: none;
          stroke: var(--espresso);
          stroke-width: 1.85;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 170;
          stroke-dashoffset: 170;
          animation: drawCup 1.6s cubic-bezier(0.65, 0, 0.35, 1) forwards;
        }

        .steam-line {
          fill: none;
          stroke: var(--crema);
          stroke-width: 1.6;
          stroke-linecap: round;
          opacity: 0;
          animation: steamRise 2.4s ease-in-out infinite;
        }

        .steam-1 { animation-delay: 0.5s; }
        .steam-2 { animation-delay: 0.9s; }
        .steam-3 { animation-delay: 1.3s; }

        /* 2. Hero Brand Mascot Typography */
        .brand-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.45rem;
        }

        .brand-eyebrow {
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.38em;
          text-transform: uppercase;
          color: var(--crema);
          opacity: 0;
          animation: slideFadeUp 0.8s ease-out 0.2s forwards;
        }

        .brand-wordmark {
          font-family: 'Cinzel', serif;
          font-size: clamp(2.1rem, 5.2vw, 3.6rem);
          font-weight: 700;
          letter-spacing: 0.14em;
          line-height: 1.1;
          text-transform: uppercase;
          color: var(--espresso);
          overflow: hidden;
          padding: 0.1em 0;
        }

        .brand-wordmark span {
          display: inline-block;
          opacity: 0;
          transform: translateY(105%);
          animation: letterReveal 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .brand-subtitle {
          font-family: 'Cormorant Garamond', serif;
          font-style: italic;
          font-size: clamp(1.2rem, 2.4vw, 1.55rem);
          font-weight: 500;
          letter-spacing: 0.22em;
          color: var(--roast);
          opacity: 0;
          animation: slideFadeUp 0.9s ease-out 0.75s forwards;
        }

        /* 3. Center-Expanding Hairline Brewing Gauge */
        .gauge-section {
          margin-top: 2.75rem;
          width: 260px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          opacity: 0;
          animation: slideFadeUp 0.8s ease-out 0.9s forwards;
        }

        .gauge-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.68rem;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: var(--roast);
        }

        .gauge-percent {
          font-variant-numeric: tabular-nums;
          font-weight: 500;
          color: var(--espresso);
        }

        .gauge-rail {
          position: relative;
          width: 100%;
          height: 1px;
          background-color: var(--hairline);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .gauge-progress {
          position: absolute;
          height: 1.5px;
          width: 0%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            var(--crema) 25%,
            var(--espresso) 50%,
            var(--crema) 75%,
            transparent 100%
          );
          transition: width 0.12s linear;
        }

        .gauge-diamond {
          width: 8px;
          height: 8px;
          background-color: var(--bg-cream);
          border: 1.5px solid var(--crema);
          transform: rotate(45deg);
          z-index: 2;
          transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.35s ease, border-color 0.35s ease;
        }

        .gauge-diamond.is-ready {
          background-color: var(--espresso);
          border-color: var(--espresso);
          transform: rotate(225deg) scale(1.2);
        }

        /* Keyframes */
        @keyframes drawCup {
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes steamRise {
          0% {
            opacity: 0;
            transform: translateY(4px);
          }
          50% {
            opacity: 0.9;
          }
          100% {
            opacity: 0;
            transform: translateY(-8px);
          }
        }

        @keyframes letterReveal {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideFadeUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className={`brand-loader-container ${isFadingOut ? 'fade-out' : ''}`}>
        {/* Monoline Cup & Steam */}
        <svg className="cup-svg" viewBox="0 0 64 64" aria-hidden="true">
          <path className="steam-line steam-1" d="M22 18 C22 14, 25 14, 25 10" />
          <path className="steam-line steam-2" d="M30 16 C30 12, 33 12, 33 8" />
          <path className="steam-line steam-3" d="M38 18 C38 14, 41 14, 41 10" />
          <path className="cup-line" d="M14 26 H46 V38 C46 45.7 39.7 52 32 52 H28 C20.3 52 14 45.7 14 38 Z" />
          <path className="cup-line" d="M46 30 H50 C52.8 30 55 32.2 55 35 C55 37.8 52.8 40 50 40 H46" />
          <path className="cup-line" d="M10 56 H50" />
        </svg>

        {/* Hero Brand Typography */}
        <div className="brand-hero">
          <span className="brand-eyebrow">Handcrafted Brews &amp; Heritage</span>
          <h1 className="brand-wordmark">
            {BRAND_NAME.split('').map((char, idx) => (
              <span
                key={idx}
                style={{ animationDelay: `${0.25 + idx * 0.04}s` }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </h1>
          <p className="brand-subtitle">— Cafe &amp; Roastery —</p>
        </div>

        {/* Center-Expanding Hairline Gauge / Error Box */}
        {errorMessage ? (
          <div className="mt-8 w-full max-w-sm rounded-2xl border border-red-500/20 bg-surface-container-low/80 p-5 shadow-xl text-center">
            <p className="text-sm font-bold text-red-500">Connection Interrupted</p>
            <p className="mt-1 text-xs opacity-75">{errorMessage}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-xl bg-[var(--crema)] px-5 py-2 text-xs font-bold text-white shadow-md hover:opacity-90 active:scale-95 cursor-pointer"
            >
              Reconnect to Cafe
            </button>
          </div>
        ) : (
          <div className="gauge-section">
            <div className="gauge-header">
              <span>{stage}</span>
              <span className="gauge-percent">
                {String(progress).padStart(2, '0')}%
              </span>
            </div>
            <div className="gauge-rail">
              <div
                className="gauge-progress"
                style={{ width: `${progress}%` }}
              />
              <div
                className={`gauge-diamond ${isReady ? 'is-ready' : ''}`}
              />
            </div>

            {/* Subtle Enter / Skip button */}
            <button
              type="button"
              onClick={handleSkip}
              className="mt-6 text-[11px] tracking-wider uppercase font-medium text-[var(--crema)] opacity-70 hover:opacity-100 transition-opacity cursor-pointer inline-flex items-center gap-1"
            >
              <span>Enter Cafe</span>
              <span>→</span>
            </button>
          </div>
        )}
      </div>
    </main>
  );
};
