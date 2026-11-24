import React from 'react';
import { FileCheck, ArrowLeft, CreditCard, RotateCcw, AlertCircle } from 'lucide-react';

interface TermsAndConditionsScreenProps {
  onBack: () => void;
}

export const TermsAndConditionsScreen: React.FC<TermsAndConditionsScreenProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-surface text-on-surface p-4 md:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Navigation Header */}
        <div className="flex items-center justify-between pb-4 border-b border-outline-variant">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-primary text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cafe
          </button>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <FileCheck className="w-4 h-4 text-primary" />
            Last Updated: November 20, 2026
          </div>
        </div>

        {/* Hero Section */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/60 shadow-md shrink-0 bg-surface-container p-0.5">
            <img src="/images/tsc-logo.jpg" alt="The Sawariya Cafe" className="w-full h-full object-cover rounded-full" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              Customer Agreement
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-on-surface">
              Terms &amp; Conditions
            </h1>
            <p className="text-on-surface-variant text-xs md:text-sm leading-relaxed">
              Welcome to The Sawariya Cafe.
            </p>
          </div>
        </div>

        {/* Section 1 */}
        <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant space-y-4">
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" /> 1. Table Ordering & Dining
          </h2>
          <ul className="list-disc list-inside space-y-2 text-on-surface-variant text-sm leading-relaxed">
            <li>Orders submitted via Table QR codes are dispatched directly to the active Kitchen Display System (KOT).</li>
            <li>Please ensure accurate table selection when dining in. Transferring tables requires informing your server.</li>
            <li>Menu items are subject to live stock availability; out-of-stock items (86&apos;d) are automatically prevented from checkout.</li>
          </ul>
        </div>

        {/* Section 2 */}
        <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant space-y-4">
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" /> 2. Pricing, Billing & Payments
          </h2>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            All prices are listed in Indian Rupees (₹) and include applicable Goods and Services Tax (GST) breakdown.
            Payment modes accepted:
          </p>
          <ul className="list-disc list-inside space-y-2 text-on-surface-variant text-sm leading-relaxed">
            <li>Direct UPI Intent & Dynamic Dynamic QR via Cashfree payment gateway.</li>
            <li>Cash or physical POS card payment settled at the front billing counter.</li>
            <li>Campaign discount promo codes and Beans loyalty points may be applied during cart checkout in accordance with active cafe promotion rules.</li>
          </ul>
        </div>

        {/* Section 3 */}
        <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant space-y-4">
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-primary" /> 3. Cancellation & Refund Policy
          </h2>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            Because our beverages and kitchen dishes are freshly prepared upon receipt:
          </p>
          <ul className="list-disc list-inside space-y-2 text-on-surface-variant text-sm leading-relaxed">
            <li>Once an order transitions to <span className="text-primary font-semibold">&ldquo;Preparing&rdquo;</span>, customer self-cancellation is restricted.</li>
            <li>If an item is unavailable or defective, the kitchen manager can cancel the item, restore recipe inventory, and issue an automatic refund back to your source payment method within 5–7 banking days.</li>
          </ul>
        </div>

        {/* Section 4 */}
        <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant space-y-4">
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-primary" /> 4. Intellectual Property & Contact
          </h2>
          <p className="text-on-surface-variant text-sm leading-relaxed">
            All branding, recipes, roast profiles, and CafeOS user interface assets are the proprietary intellectual property
            of Seth Sawariya Cafe. For disputes, inquiries, or billing questions, reach us at:
          </p>
          <div className="p-3 rounded-lg bg-surface-container border border-outline-variant text-sm text-on-surface-variant">
            Support: <a href="mailto:TheSawariyacafe70@gmail.com" className="text-primary underline">TheSawariyacafe70@gmail.com</a><br/>
            Outlet Manager Desk: +91 98765 43210
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-outline-variant text-center text-xs text-on-surface-variant">
          Seth Sawariya CafeOS · Hospitality Hub Terms of Service
        </div>
      </div>
    </div>
  );
};
