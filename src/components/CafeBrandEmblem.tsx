import React from 'react';

interface CafeBrandEmblemProps {
  className?: string;
}

export const CafeBrandEmblem: React.FC<CafeBrandEmblemProps> = ({
  className = 'w-full h-full',
}) => {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Seth Sawariya Cafe Logo"
      className={className}
    >
      <defs>
        <linearGradient id="cafeAmber" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffddb8" />
          <stop offset="50%" stopColor="#ffc174" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      {/* Steam plumes */}
      <path
        d="M23 18C21.5 14.5 24.5 11.5 23 8"
        stroke="url(#cafeAmber)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M32 16C30.5 12 33.5 9 32 5.5"
        stroke="url(#cafeAmber)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M41 18C39.5 14.5 42.5 11.5 41 8"
        stroke="url(#cafeAmber)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Cup body */}
      <path
        d="M14 25H44V37C44 45.2843 37.2843 52 29 52C20.7157 52 14 45.2843 14 37V25Z"
        fill="url(#cafeAmber)"
        fillOpacity="0.16"
        stroke="url(#cafeAmber)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* Cup handle */}
      <path
        d="M44 28H48.5C51.5376 28 54 30.4624 54 33.5C54 36.5376 51.5376 39 48.5 39H44"
        stroke="url(#cafeAmber)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Roasted coffee bean center */}
      <ellipse
        cx="29"
        cy="38"
        rx="4.5"
        ry="6.5"
        transform="rotate(-18 29 38)"
        fill="url(#cafeAmber)"
      />
      <path
        d="M27.5 32.5C29.5 36 28.5 40 30.5 43.5"
        stroke="#17120f"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Saucer */}
      <path
        d="M12 56H46"
        stroke="url(#cafeAmber)"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
};
