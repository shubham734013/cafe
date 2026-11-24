import React from 'react';

export const CustomerFooter: React.FC = () => (
  <footer className="mx-auto mt-4 w-full max-w-[1480px] border-t border-outline-variant/50 px-1 pb-4 pt-5 text-xs text-on-surface-variant sm:mt-6 sm:pt-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-bold text-on-surface">The Sawariya Cafe</p>
        <p className="mt-0.5">Good Food • Good Mood</p>
      </div>
      <div className="flex flex-col gap-1 sm:items-end">
        <a className="hover:text-primary" href="tel:+919876543210">
          +91 98765 43210
        </a>
        <a className="break-all hover:text-primary" href="mailto:TheSawariyacafe70@gmail.com">
          TheSawariyacafe70@gmail.com
        </a>
      </div>
    </div>
    <p className="mt-4 border-t border-outline-variant/40 pt-3">
      © {new Date().getFullYear()} The Sawariya Cafe
    </p>
  </footer>
);
