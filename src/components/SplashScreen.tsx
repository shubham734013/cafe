import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  errorMessage?: string;
  onRetry: () => void;
  onFinish?: () => void;
}

const BRAND_NAME = 'The Sawariya Cafe';
const INTRO_DURATION_MS = 3_500;
const FADE_OUT_DURATION_MS = 600;
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
    <main className="brand-loader-root" role="status" aria-label="Loading The Sawariya Cafe">
      <style>{`
        .brand-loader-root {
          --loader-bg: #FAF7F2;
          --loader-ink: #1F1610;
          --loader-roast: #382319;
          --loader-crema: #C67C4E;
          --loader-cream-soft: #F3ECE2;
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
          background: radial-gradient(circle at 50% 40%, rgba(198, 124, 78, 0.12), transparent 60%);
          pointer-events: none;
        }
        .brand-silhouette {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 140px;
          opacity: 0.18;
          pointer-events: none;
          background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 240' preserveAspectRatio='none'%3E%3Cpath fill='%23C67C4E' d='M0,240 L0,180 Q100,160 200,190 T400,170 Q480,110 520,110 Q560,110 600,150 Q660,90 720,150 T880,180 Q980,140 1080,170 L1200,160 L1200,240 Z'/%3E%3C/svg%3E") bottom center no-repeat;
          background-size: cover;
        }
        .brand-loader-container {
          position: relative;
          display: flex;
          width: 100%;
          max-width: 480px;
          flex-direction: column;
          align-items: center;
          margin-top: -3vh;
          padding: 2rem;
          text-align: center;
          transition: opacity 600ms cubic-bezier(.22,1,.36,1), transform 600ms cubic-bezier(.22,1,.36,1);
        }
        .brand-loader-container.fade-out {
          opacity: 0;
          transform: translateY(-10px);
          pointer-events: none;
        }
        .brand-crest-svg {
          width: 130px;
          height: 130px;
          margin-bottom: 1.25rem;
        }
        .brand-wordmark {
          margin: 0;
          color: #382319;
          font-family: "Cormorant Garamond", Georgia, serif;
          font-size: clamp(2.1rem, 5vw, 2.75rem);
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1.1;
        }
        .brand-subtitle {
          margin: 0.5rem 0 0;
          color: #7A7067;
          font-size: 0.85rem;
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .brand-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 0.6rem;
          color: #C67C4E;
          font-size: 0.75rem;
        }
        .brand-divider::before, .brand-divider::after {
          content: "";
          display: inline-block;
          width: 32px;
          height: 1px;
          background-color: #EAE2D7;
        }
      `}</style>

      {/* Decorative background silhouette matching Panel 1 */}
      <div className="brand-silhouette" aria-hidden="true" />

      <div className={`brand-loader-container ${isFadingOut ? 'fade-out' : ''}`}>
        {/* Arch Crest Emblem matching Panel 1 */}
        <svg
          className="brand-crest-svg"
          viewBox="0 0 160 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Outer Arch */}
          <path
            d="M40 140V70C40 45 58 28 80 28C102 28 120 45 120 70V140"
            stroke="#C67C4E"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Inner Arch */}
          <path
            d="M48 140V72C48 52 62 38 80 38C98 38 112 52 112 72V140"
            stroke="#EAE2D7"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          {/* Arch Flag / Pinnacle on Top */}
          <path d="M80 28V16L92 21L80 26" fill="#C67C4E" stroke="#C67C4E" strokeWidth="1" strokeLinejoin="round" />
          
          {/* Hanging Lamp */}
          <line x1="80" y1="38" x2="80" y2="58" stroke="#382319" strokeWidth="1.5" />
          <path d="M74 58H86L82 66H78L74 58Z" fill="#C67C4E" />
          <circle cx="80" cy="70" r="3" fill="#EAE2D7" />

          {/* Steaming Coffee Cup */}
          <path
            d="M62 94H98V108C98 118 90 126 80 126C70 126 62 118 62 108V94Z"
            stroke="#382319"
            strokeWidth="2.2"
            fill="#FFFFFF"
          />
          {/* Cup Handle */}
          <path
            d="M98 98H104C107.5 98 110 100.5 110 104C110 107.5 107.5 110 104 110H98"
            stroke="#382319"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Saucer */}
          <path d="M54 130H106" stroke="#382319" strokeWidth="2.5" strokeLinecap="round" />

          {/* Steam curves */}
          <path d="M72 88C72 83 75 83 75 79" stroke="#C67C4E" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M80 86C80 81 83 81 83 77" stroke="#C67C4E" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M88 88C88 83 91 83 91 79" stroke="#C67C4E" strokeWidth="1.5" strokeLinecap="round" />

          {/* Side Botanical Laurel Leaves */}
          <path d="M28 100C30 92 36 86 40 85" stroke="#C67C4E" strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="29" cy="94" rx="3" ry="5" transform="rotate(-30 29 94)" fill="#EAE2D7" />
          <ellipse cx="36" cy="87" rx="3" ry="5" transform="rotate(15 36 87)" fill="#EAE2D7" />
          
          <path d="M132 100C130 92 124 86 120 85" stroke="#C67C4E" strokeWidth="1.5" strokeLinecap="round" />
          <ellipse cx="131" cy="94" rx="3" ry="5" transform="rotate(30 131 94)" fill="#EAE2D7" />
          <ellipse cx="124" cy="87" rx="3" ry="5" transform="rotate(-15 124 87)" fill="#EAE2D7" />
        </svg>

        <div className="brand-hero">
          <h1 className="brand-wordmark">{BRAND_NAME}</h1>
          <p className="brand-subtitle">Cafe • Food • Delivery</p>
          <div className="brand-divider">✦</div>
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
