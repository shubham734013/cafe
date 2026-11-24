import React, { useEffect, useRef, useState } from 'react';
import { CAFE_ASSETS } from '../data/cafeSeedData';
import { CafeImage } from './CafeImage';

interface SplashScreenProps {
  errorMessage?: string;
  onRetry: () => void;
  onFinish?: (destination?: 'home' | 'login', initialTab?: 'register' | 'login') => void;
}

const BRAND_NAME = 'The Sawariya Cafe';
const INTRO_DURATION_MS = 1_500;
const FADE_OUT_DURATION_MS = 400;
const FADE_OUT_DELAY_MS = INTRO_DURATION_MS - FADE_OUT_DURATION_MS;
const ONBOARDING_SEEN_KEY = 'cafeos_onboarding_seen';

const ONBOARDING_SLIDES = [
  {
    title: 'Cafe, Food & More at Your Door',
    description:
      'Order your favorite meals, book a table, or get it delivered — all in one app.',
    image: CAFE_ASSETS.cappuccino,
    imageAlt: 'Freshly brewed cappuccino',
  },
  {
    title: 'Fresh Food Delivered Fast',
    description: 'From our kitchen to your doorstep, hot and fresh.',
    image: CAFE_ASSETS.dailyCombo,
    imageAlt: 'Fresh cafe meal ready for delivery',
  },
];

export const SplashScreen: React.FC<SplashScreenProps> = ({
  errorMessage,
  onRetry,
  onFinish,
}) => {
  const [isFadingOut, setIsFadingOut] = useState(false);
  // The initial brand-only screen delayed the actual customer content, then replaced
  // the whole viewport with onboarding. Start first-time visitors directly on the
  // stable onboarding view so its image can become the LCP without a large shift.
  const [view, setView] = useState<'brand' | 'onboarding'>('onboarding');
  const [activeSlide, setActiveSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (errorMessage) return;

    if (view === 'onboarding') return;

    let hasSeenOnboarding = false;
    try {
      hasSeenOnboarding = window.localStorage.getItem(ONBOARDING_SEEN_KEY) === 'true';
    } catch (error) {
      console.warn('Could not read the onboarding preference:', error);
    }

    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const fadeTimer = setTimeout(() => setIsFadingOut(true), FADE_OUT_DELAY_MS);
    finishTimer = setTimeout(() => {
      if (hasSeenOnboarding) onFinish?.('home');
      else {
        setView('onboarding');
        setIsFadingOut(false);
      }
    }, INTRO_DURATION_MS);

    return () => {
      clearTimeout(fadeTimer);
      if (finishTimer !== undefined) clearTimeout(finishTimer);
    };
  }, [errorMessage, onFinish, view]);

  const finishOnboarding = (initialTab: 'register' | 'login') => {
    try {
      window.localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    } catch (error) {
      console.warn('Could not save the onboarding preference:', error);
    }
    onFinish?.('login', initialTab);
  };

  if (view === 'onboarding' && !errorMessage) {
    const slide = ONBOARDING_SLIDES[activeSlide];
    return (
      <main className="fixed inset-0 z-50 flex min-h-screen flex-col overflow-hidden bg-[#FAF7F2] px-5 pb-safe pt-safe text-[#1F1610]">
        <div className="w-full max-w-sm mx-auto flex justify-end pt-3">
          <button
            type="button"
            onClick={() => {
              try {
                window.localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
              } catch (e) {
                console.warn(e);
              }
              onFinish?.('home');
            }}
            className="text-xs font-bold text-[#70645A] hover:text-[#1F1610] transition-colors px-2 py-1 cursor-pointer"
          >
            Skip to Cafe &rarr;
          </button>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center">
          <div
            className="w-full flex-1 flex flex-col items-center justify-center text-center"
            onTouchStart={(event) => {
              touchStartX.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const startX = touchStartX.current;
              const endX = event.changedTouches[0]?.clientX;
              touchStartX.current = null;
              if (startX === null || endX === undefined) return;
              const deltaX = endX - startX;
              if (Math.abs(deltaX) < 40) return;
              setActiveSlide((current) =>
                Math.max(0, Math.min(ONBOARDING_SLIDES.length - 1, current + (deltaX < 0 ? 1 : -1)))
              );
            }}
          >
            <div key={activeSlide} className="onboarding-slide w-full">
              <div className="onboarding-art-float relative mx-auto mb-8 flex h-64 w-full items-center justify-center">
                <div className="absolute inset-x-7 bottom-5 h-16 rounded-full bg-[#EFDCC8]/70 blur-2xl" />
                <div className="relative flex h-56 w-56 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-white to-[#F3E4D4] shadow-[0_22px_50px_rgba(87,54,30,0.12)]">
                  {activeSlide === 0 ? (
                    <CafeImage
                      src={slide.image}
                      alt={slide.imageAlt}
                      loading="eager"
                      fetchPriority="high"
                      sizes="224px"
                      className="h-full w-full object-cover"
                      fallbackIcon="local_cafe"
                    />
                  ) : (
                    <div className="relative flex h-full w-full items-center justify-center text-[#382319]">
                      <span className="material-symbols-outlined text-[112px]">two_wheeler</span>
                      <span className="material-symbols-outlined absolute right-8 top-7 text-[36px] text-[#E89A48]">
                        location_on
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <h1 className="mx-auto max-w-[19rem] font-sans text-[1.65rem] font-extrabold leading-tight tracking-tight">
                {slide.title}
              </h1>
              <p className="mx-auto mt-3 max-w-[19rem] text-sm leading-6 text-[#70645A]">
                {slide.description}
              </p>
            </div>

            <div className="mb-7 mt-8 flex items-center justify-center gap-2">
              {ONBOARDING_SLIDES.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  aria-label={`Show introduction ${index + 1}`}
                  aria-current={index === activeSlide ? 'step' : undefined}
                  onClick={() => setActiveSlide(index)}
                  className={`h-2 rounded-full transition-all duration-200 ${
                    index === activeSlide ? 'w-6 bg-[#382319]' : 'w-2 bg-[#D8C8B8]'
                  }`}
                />
              ))}
            </div>

            <div className="w-full pb-5 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
                  } catch (e) {
                    console.warn(e);
                  }
                  onFinish?.('home');
                }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#382319] text-sm font-bold text-white shadow-[0_10px_24px_rgba(56,35,25,0.2)] transition-transform active:scale-[0.98] cursor-pointer"
              >
                <span>Browse Menu &amp; Order</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
              <button
                type="button"
                onClick={() => finishOnboarding('login')}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[#D8C8B8] bg-white text-xs font-bold text-[#382319] shadow-xs transition-colors hover:bg-[#FAF7F2] cursor-pointer"
              >
                <span>Sign in with Google</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

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
        {/* The Sawariya Cafe Official Logo */}
        <div className="w-32 h-32 mx-auto rounded-full overflow-hidden border-2 border-[#D4AF37]/70 shadow-2xl mb-4 bg-black p-0.5 animate-in zoom-in-95 duration-500">
          <img
            src="/images/tsc-logo.jpg"
            alt="The Sawariya Cafe Logo"
            className="w-full h-full object-cover rounded-full"
          />
        </div>

        <div className="brand-hero">
          <h1 className="brand-wordmark">{BRAND_NAME}</h1>
          <p className="brand-subtitle">Good Food • Good Mood</p>
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
