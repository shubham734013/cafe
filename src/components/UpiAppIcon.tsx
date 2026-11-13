import React from 'react';
import type { UpiAppId } from '../payments/upiUri';

interface UpiAppIconProps {
  appId: UpiAppId;
  className?: string;
}

export const UpiAppIcon: React.FC<UpiAppIconProps> = ({ appId, className = 'w-9 h-9' }) => {
  switch (appId) {
    case 'gpay':
      return (
        <div
          className={`${className} rounded-xl bg-white border border-outline-variant/25 flex items-center justify-center shrink-0 shadow-xs`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
            <path
              d="M21.8 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.5c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3.1-4.3 3.1-7.3z"
              fill="#4285F4"
            />
            <path
              d="M12 22c2.7 0 5-.9 6.7-2.5l-3.2-2.5c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.9v2.6C4.6 19.7 8 22 12 22z"
              fill="#34A853"
            />
            <path
              d="M6.2 13.7c-.2-.6-.3-1.1-.3-1.7s.1-1.2.3-1.7V7.7H2.9C2.3 9 2 10.5 2 12s.3 3 .9 4.3l3.3-2.6z"
              fill="#FBBC05"
            />
            <path
              d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8 2 4.6 4.3 2.9 7.7l3.3 2.6C7 7.8 9.3 6 12 6z"
              fill="#EA4335"
            />
          </svg>
        </div>
      );
    case 'paytm':
      return (
        <div
          className={`${className} rounded-xl bg-[#002970] border border-[#00baf2]/40 flex items-center justify-center shrink-0 shadow-xs px-1`}
          aria-hidden="true"
        >
          <span className="text-[10px] font-black tracking-tight leading-none">
            <span className="text-white">Pay</span>
            <span className="text-[#00baf2]">tm</span>
          </span>
        </div>
      );
    case 'amazonpay':
      return (
        <div
          className={`${className} rounded-xl bg-[#131921] border border-[#ff9900]/45 flex flex-col items-center justify-center shrink-0 shadow-xs`}
          aria-hidden="true"
        >
          <span className="text-[11px] font-black text-white leading-none tracking-tight">a</span>
          <svg viewBox="0 0 24 8" className="w-5 h-2 -mt-0.5" fill="none">
            <path
              d="M2 2.5C6.5 6.2 14.5 6.5 20.5 2.5"
              stroke="#FF9900"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M18.5 1.2L21.5 2.3L20.3 5.2"
              stroke="#FF9900"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      );
    case 'phonepe':
      return (
        <div
          className={`${className} rounded-xl bg-[#5f259f] border border-purple-300/30 flex items-center justify-center shrink-0 shadow-xs`}
          aria-hidden="true"
        >
          <span className="text-xs font-black text-white tracking-tight">Pe</span>
        </div>
      );
    default:
      return (
        <div
          className={`${className} rounded-xl bg-surface-container-highest border border-primary/35 flex items-center justify-center shrink-0 text-primary shadow-xs`}
          aria-hidden="true"
        >
          <span className="material-symbols-outlined text-[19px]">qr_code_2</span>
        </div>
      );
  }
};
