import React, { useEffect, useState } from 'react';

interface CoffeeBrewLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'fullscreen';
  title?: string;
  subtitle?: string;
  progress?: number;
  interactive?: boolean;
}

const BREW_STAGES = [
  { label: 'Selecting single-origin beans...', aroma: 'Arabica Hazelnut' },
  { label: 'Grinding at 180 microns...', aroma: 'Fresh Roast' },
  { label: 'Tamping & pre-infusing 9 bar...', aroma: 'Rich Extraction' },
  { label: 'Pouring velvet espresso shot...', aroma: 'Golden Crema' },
  { label: 'Harmonizing flavours & steaming...', aroma: 'Hot & Fresh' },
];

const CAFE_TRIVIA = [
  'Roasted daily at 215°C for maximum crema richness.',
  'Ground fresh on demand to preserve aromatic terpenes.',
  'Our milk is micro-steamed to a silky 65°C sweet spot.',
  'Pure 100% Arabica sourced from Coorg & Chikmagalur.',
];

export const CoffeeBrewLoader: React.FC<CoffeeBrewLoaderProps> = ({
  size = 'md',
  title = 'Brewing Your Experience',
  subtitle,
  progress: externalProgress,
  interactive = true,
}) => {
  const [internalProgress, setInternalProgress] = useState(externalProgress ?? 15);
  const [stageIndex, setStageIndex] = useState(0);
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [cupJiggle, setCupJiggle] = useState(false);
  const [hearts, setHearts] = useState<Array<{ id: number; x: number }>>([]);

  // Auto-progress simulation if externalProgress is omitted
  useEffect(() => {
    if (externalProgress !== undefined) {
      setInternalProgress(externalProgress);
      const idx = Math.min(
        BREW_STAGES.length - 1,
        Math.floor((externalProgress / 100) * BREW_STAGES.length)
      );
      setStageIndex(idx);
      return;
    }

    const timer = setInterval(() => {
      setInternalProgress((prev) => {
        const next = prev >= 95 ? 15 : prev + Math.floor(Math.random() * 8 + 4);
        const idx = Math.min(
          BREW_STAGES.length - 1,
          Math.floor((next / 100) * BREW_STAGES.length)
        );
        setStageIndex(idx);
        return next;
      });
    }, 450);

    const triviaTimer = setInterval(() => {
      setTriviaIndex((prev) => (prev + 1) % CAFE_TRIVIA.length);
    }, 3200);

    return () => {
      clearInterval(timer);
      clearInterval(triviaTimer);
    };
  }, [externalProgress]);

  const handleCupClick = () => {
    if (!interactive) return;
    setCupJiggle(true);
    const newHeart = { id: Date.now(), x: (Math.random() - 0.5) * 40 };
    setHearts((prev) => [...prev.slice(-4), newHeart]);
    setTimeout(() => setCupJiggle(false), 500);
  };

  const currentStage = BREW_STAGES[stageIndex];

  // Dimensions based on size
  const scale = size === 'sm' ? 0.65 : size === 'md' ? 0.9 : 1.15;
  const containerClasses =
    size === 'fullscreen'
      ? 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface/95 backdrop-blur-md px-4 py-8 select-none'
      : size === 'sm'
      ? 'flex flex-col items-center justify-center p-3 select-none'
      : 'flex flex-col items-center justify-center p-6 select-none';

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      {/* Background ambient warm glow */}
      <div className="absolute pointer-events-none w-72 h-72 rounded-full bg-primary/10 blur-3xl -z-10" />

      {/* Main Coffee Pouring Animation Graphic */}
      <div
        className={`relative cursor-pointer transition-transform duration-300 ${
          cupJiggle ? 'scale-105 rotate-1' : 'hover:scale-[1.02]'
        }`}
        onClick={handleCupClick}
        title="Tap to stir the brew"
        style={{ width: `${180 * scale}px`, height: `${220 * scale}px` }}
      >
        <svg
          viewBox="0 0 200 240"
          className="w-full h-full overflow-visible drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
        >
          <defs>
            {/* Filter portafilter metallic gradient */}
            <linearGradient id="metalSpout" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#45382f" />
              <stop offset="35%" stopColor="#8c7866" />
              <stop offset="50%" stopColor="#d5c4b1" />
              <stop offset="65%" stopColor="#8c7866" />
              <stop offset="100%" stopColor="#45382f" />
            </linearGradient>

            {/* Coffee stream gradient (dark roast to liquid amber) */}
            <linearGradient id="coffeeStream" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#451a03" />
              <stop offset="25%" stopColor="#78350f" />
              <stop offset="50%" stopColor="#d97706" />
              <stop offset="75%" stopColor="#78350f" />
              <stop offset="100%" stopColor="#451a03" />
            </linearGradient>

            {/* Golden Crema gradient */}
            <linearGradient id="goldenCrema" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="45%" stopColor="#d97706" />
              <stop offset="100%" stopColor="#78350f" />
            </linearGradient>

            {/* Ceramic cup exterior gradient */}
            <linearGradient id="cupCeramic" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#241f1b" />
              <stop offset="20%" stopColor="#3a3430" />
              <stop offset="50%" stopColor="#4e4641" />
              <stop offset="80%" stopColor="#3a3430" />
              <stop offset="100%" stopColor="#1e1a17" />
            </linearGradient>

            {/* Saucer gradient */}
            <linearGradient id="saucerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1e1a17" />
              <stop offset="50%" stopColor="#3a3430" />
              <stop offset="100%" stopColor="#120e0c" />
            </linearGradient>

            {/* Ambient cup glow filter */}
            <filter id="cremaGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Steam wisps wafting up from the hot brew */}
          <g className="pointer-events-none">
            {/* Steam 1: Left soft curl */}
            <path
              d="M 85 105 Q 70 80 85 55 T 82 25"
              fill="none"
              stroke="#fed7aa"
              strokeWidth="2.8"
              strokeLinecap="round"
              className="animate-steam-1"
              opacity="0.45"
            />
            {/* Steam 2: Center undulating waft */}
            <path
              d="M 100 100 Q 115 75 98 50 T 106 18"
              fill="none"
              stroke="#ffedd5"
              strokeWidth="3.2"
              strokeLinecap="round"
              className="animate-steam-2"
              opacity="0.6"
            />
            {/* Steam 3: Right wispy trail */}
            <path
              d="M 115 106 Q 130 82 118 58 T 125 30"
              fill="none"
              stroke="#fed7aa"
              strokeWidth="2.6"
              strokeLinecap="round"
              className="animate-steam-3"
              opacity="0.4"
            />
          </g>

          {/* Portafilter Spout (Brewing Head) */}
          <g>
            {/* Portafilter top rim */}
            <rect x="70" y="8" width="60" height="8" rx="2" fill="url(#metalSpout)" />
            {/* Portafilter funnel cone */}
            <path d="M 74 16 L 90 34 L 110 34 L 126 16 Z" fill="url(#metalSpout)" />
            {/* Nozzle outlet ring */}
            <ellipse cx="100" cy="34" rx="10" ry="3" fill="#292019" />
            <ellipse cx="100" cy="34" rx="6" ry="1.8" fill="#120b06" />
          </g>

          {/* Pouring Coffee Stream */}
          <g className="animate-coffee-stream">
            {/* Core rich stream */}
            <path
              d="M 97 34 Q 98 80 97 126 L 103 126 Q 102 80 103 34 Z"
              fill="url(#coffeeStream)"
            />
            {/* Specular fluid highlight line in the middle */}
            <line
              x1="99.5"
              y1="36"
              x2="99.5"
              y2="124"
              stroke="#fef3c7"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.75"
            />
          </g>

          {/* Splash droplets around stream entry into crema */}
          <circle cx="92" cy="122" r="2.2" fill="#d97706" className="animate-droplet-left" />
          <circle cx="108" cy="121" r="2.4" fill="#f59e0b" className="animate-droplet-right" />
          <circle cx="98" cy="125" r="1.5" fill="#fef3c7" className="animate-droplet-left" />

          {/* Ceramic Saucer Plate */}
          <ellipse cx="100" cy="216" rx="68" ry="12" fill="url(#saucerGrad)" />
          <ellipse cx="100" cy="215" rx="62" ry="9" fill="#2d2621" />
          <ellipse cx="100" cy="214" rx="42" ry="5" fill="#1e1814" opacity="0.6" />

          {/* Ceramic Coffee Cup Body */}
          <g className="animate-cup-bob">
            {/* Cup Handle (Curved Loop on Right) */}
            <path
              d="M 148 135 C 172 135 174 180 148 185"
              fill="none"
              stroke="url(#cupCeramic)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <path
              d="M 148 138 C 167 138 169 177 148 182"
              fill="none"
              stroke="#17120f"
              strokeWidth="3.5"
              strokeLinecap="round"
            />

            {/* Cup Exterior Silhouette */}
            <path
              d="M 54 122 C 55 178 72 206 100 206 C 128 206 145 178 146 122 Z"
              fill="url(#cupCeramic)"
            />

            {/* Cup Lip / Top Rim Outer */}
            <ellipse cx="100" cy="122" rx="46" ry="11" fill="url(#cupCeramic)" />

            {/* Cup Interior Cavity */}
            <ellipse cx="100" cy="123" rx="42" ry="9.5" fill="#1e1814" />

            {/* Rising Coffee / Velvety Crema Layer */}
            <g className="animate-crema-surface">
              {/* Coffee Liquid Base */}
              <ellipse cx="100" cy="126" rx="40" ry="8.8" fill="url(#goldenCrema)" />

              {/* Crema foam swirl texture */}
              <ellipse
                cx="100"
                cy="126"
                rx="35"
                ry="7"
                fill="#f59e0b"
                opacity="0.9"
                filter="url(#cremaGlow)"
              />
              <path
                d="M 76 126 Q 92 122 104 127 T 124 126"
                fill="none"
                stroke="#fef3c7"
                strokeWidth="1.8"
                opacity="0.8"
                strokeLinecap="round"
              />
              <path
                d="M 85 128 Q 98 131 115 127"
                fill="none"
                stroke="#b45309"
                strokeWidth="1.2"
                opacity="0.9"
                strokeLinecap="round"
              />
              {/* Latte art micro rosette center */}
              <circle cx="100" cy="126" r="3.2" fill="#fffbeb" opacity="0.85" />
            </g>

            {/* Specular curved reflection on cup ceramic side */}
            <path
              d="M 64 135 C 66 168 76 192 92 200"
              fill="none"
              stroke="#ebe0db"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.18"
            />
          </g>

          {/* Interactive Heart Particles floating when tapped */}
          {hearts.map((h) => (
            <g
              key={h.id}
              className="animate-droplet-left"
              style={{ transform: `translate(${h.x}px, -15px)` }}
            >
              <path
                d="M 100 115 C 95 105 85 110 88 120 Q 100 132 100 132 Q 100 132 112 120 C 115 110 105 105 100 115 Z"
                fill="#ffc174"
                opacity="0.75"
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Status & Progress Information */}
      <div className="mt-4 flex flex-col items-center text-center max-w-xs w-full px-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[18px] text-primary animate-bean-wobble">
            coffee
          </span>
          <h2 className="text-sm sm:text-base font-bold text-on-surface tracking-tight">
            {title}
          </h2>
        </div>

        <p className="text-xs text-primary font-medium min-h-[1.25rem] transition-all duration-300">
          {subtitle || currentStage.label}
        </p>

        {/* Artisanal Progress Bar */}
        <div className="w-full mt-3 h-2 rounded-full bg-surface-container-highest overflow-hidden p-0.5 border border-outline-variant/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-container via-primary to-tertiary transition-all duration-300 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
            style={{ width: `${Math.max(8, Math.min(100, internalProgress))}%` }}
          />
        </div>

        {/* Live Brewing Metrics Footer */}
        <div className="w-full flex items-center justify-between mt-2 text-[11px] text-on-surface-variant font-medium">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
            {currentStage.aroma}
          </span>
          <span className="tabular-nums font-bold text-primary">{internalProgress}%</span>
        </div>

        {/* Cozy Cafe Trivia Snippet */}
        {size !== 'sm' && (
          <div className="mt-3 px-3 py-1.5 rounded-xl bg-surface-container-low/70 border border-outline-variant/20 text-[11px] text-on-surface-variant/90 transition-opacity duration-500 italic">
            &ldquo;{CAFE_TRIVIA[triviaIndex]}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
};
