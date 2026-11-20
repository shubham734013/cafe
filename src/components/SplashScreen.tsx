import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  errorMessage?: string;
  onRetry: () => void;
  onFinish?: () => void;
}

const BRAND_NAME = 'SETH SAWARIYA';
const INTRO_DURATION_MS = 5_000;
const FADE_OUT_DURATION_MS = 700;
const FADE_OUT_DELAY_MS = INTRO_DURATION_MS - FADE_OUT_DURATION_MS;

export const SplashScreen: React.FC<SplashScreenProps> = ({
  errorMessage,
  onRetry,
  onFinish,
}) => {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (errorMessage) return;

    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
      finishTimer = setTimeout(() => onFinish?.(), FADE_OUT_DURATION_MS);
    }, FADE_OUT_DELAY_MS);

    return () => {
      clearTimeout(fadeTimer);
      if (finishTimer !== undefined) clearTimeout(finishTimer);
    };
  }, [errorMessage, onFinish]);

  return (
    <main className="brand-loader-root" role="status" aria-label="Loading Seth Sawariya Cafe">
      <style>{`
        .brand-loader-root {
          --loader-bg: #faf7f1;
          --loader-ink: #2d2925;
          --loader-roast: #7a6655;
          --loader-crema: #c6a27b;
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: var(--loader-bg);
          color: var(--loader-ink);
          user-select: none;
          font-family: "Plus Jakarta Sans", sans-serif;
        }
        .brand-loader-root::before {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 43%, rgba(198, 162, 123, 0.09), transparent 58%);
          pointer-events: none;
        }
        .brand-loader-container {
          position: relative;
          display: flex;
          width: 100%;
          max-width: 720px;
          flex-direction: column;
          align-items: center;
          margin-top: -1vh;
          padding: 2rem;
          text-align: center;
          transition: opacity 700ms cubic-bezier(.22,1,.36,1), transform 700ms cubic-bezier(.22,1,.36,1);
        }
        .brand-loader-container.fade-out {
          opacity: 0;
          transform: translateY(-10px);
          pointer-events: none;
        }
        .brand-cup {
          width: 68px;
          height: 68px;
          margin-bottom: 1.05rem;
          overflow: visible;
        }
        .brand-cup-line {
          fill: none;
          stroke: var(--loader-ink);
          stroke-width: 1.7;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 170;
          stroke-dashoffset: 170;
          animation: drawCup 1.45s cubic-bezier(.65,0,.35,1) forwards;
        }
        .brand-steam {
          fill: none;
          stroke: var(--loader-crema);
          stroke-width: 1.45;
          stroke-linecap: round;
          opacity: 0;
          animation: steamRise 2.4s ease-in-out infinite;
        }
        .brand-steam:nth-child(1) { animation-delay: .45s; }
        .brand-steam:nth-child(2) { animation-delay: .85s; }
        .brand-steam:nth-child(3) { animation-delay: 1.25s; }
        .brand-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .brand-eyebrow {
          margin-bottom: .42rem;
          color: var(--loader-crema);
          font-size: .58rem;
          font-weight: 600;
          letter-spacing: .32em;
          text-transform: uppercase;
          opacity: 0;
          animation: slideFadeUp .8s ease-out 1.7s forwards;
        }
        .brand-wordmark {
          margin: 0;
          padding: .08em 0;
          overflow: hidden;
          color: var(--loader-ink);
          font-family: "Cormorant Garamond", Georgia, serif;
          font-size: clamp(2rem, 5vw, 3.25rem);
          font-weight: 600;
          letter-spacing: .08em;
          line-height: 1.05;
        }
        .brand-wordmark span {
          display: inline-block;
          opacity: 0;
          transform: translateY(105%);
          animation: letterReveal .85s cubic-bezier(.22,1,.36,1) forwards;
        }
        .brand-subtitle {
          margin: .32rem 0 0;
          color: var(--loader-roast);
          font-family: "Cormorant Garamond", Georgia, serif;
          font-size: clamp(.98rem, 2vw, 1.22rem);
          font-style: italic;
          font-weight: 500;
          letter-spacing: .16em;
          opacity: 0;
          animation: slideFadeUp .9s ease-out 2.25s forwards;
        }
        .brand-error {
          width: 100%;
          max-width: 380px;
          margin-top: 2rem;
          padding: 1.25rem;
          border: 1px solid rgba(180, 50, 50, .16);
          border-radius: 14px;
          background: rgba(255,255,255,.72);
        }
        .brand-error p { margin: 0; }
        .brand-error button {
          margin-top: 1rem;
          border: 0;
          border-radius: 10px;
          padding: .65rem 1rem;
          background: var(--loader-crema);
          color: #fff;
          font-size: .75rem;
          cursor: pointer;
        }
        @keyframes drawCup { to { stroke-dashoffset: 0; } }
        @keyframes steamRise {
          0% { opacity: 0; transform: translateY(5px); }
          45% { opacity: .75; }
          100% { opacity: 0; transform: translateY(-9px); }
        }
        @keyframes letterReveal { to { opacity: 1; transform: translateY(0); } }
        @keyframes slideFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-height: 620px) {
          .brand-cup { width: 54px; height: 54px; margin-bottom: .65rem; }
        }
      `}</style>

      <div className={`brand-loader-container ${isFadingOut ? 'fade-out' : ''}`}>
        <svg className="brand-cup" viewBox="0 0 64 64" aria-hidden="true">
          <path className="brand-steam" d="M22 18 C22 14,25 14,25 10" />
          <path className="brand-steam" d="M30 16 C30 12,33 12,33 8" />
          <path className="brand-steam" d="M38 18 C38 14,41 14,41 10" />
          <path className="brand-cup-line" d="M14 26 H46 V38 C46 45.7 39.7 52 32 52 H28 C20.3 52 14 45.7 14 38 Z" />
          <path className="brand-cup-line" d="M46 30 H50 C52.8 30 55 32.2 55 35 C55 37.8 52.8 40 50 40 H46" />
          <path className="brand-cup-line" d="M10 56 H50" />
        </svg>

        <div className="brand-hero">
          <span className="brand-eyebrow">Handcrafted Brews &amp; Heritage</span>
          <h1 className="brand-wordmark" aria-label={BRAND_NAME}>
            {BRAND_NAME.split('').map((char, index) => (
              <span
                key={`${char}-${index}`}
                style={{ animationDelay: `${2.05 + index * 0.05}s` }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            ))}
          </h1>
          <p className="brand-subtitle">— Cafe &amp; Roastery —</p>
        </div>

        {errorMessage ? (
          <div className="brand-error" role="alert">
            <p style={{ fontWeight: 700, color: '#b44a3a' }}>Connection Interrupted</p>
            <p style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{errorMessage}</p>
            <button type="button" onClick={onRetry}>Reconnect to Cafe</button>
          </div>
        ) : null}
      </div>
    </main>
  );
};
