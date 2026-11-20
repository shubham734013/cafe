import React from 'react';
import { FileCheck, ArrowLeft, CreditCard, RotateCcw, AlertCircle } from 'lucide-react';

interface TermsAndConditionsScreenProps {
  onBack: () => void;
}

export const TermsAndConditionsScreen: React.FC<TermsAndConditionsScreenProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Navigation Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-amber-400 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Cafe
          </button>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            Last Updated: November 20, 2026
          </div>
        </div>

        {/* Hero Section */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Customer Agreement
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
            Terms & Conditions
          </h1>
          <p className="text-neutral-400 text-sm md:text-base leading-relaxed">
            Welcome to Seth Sawariya Cafe & Roastery. By scanning a table QR code, placing an order, or accessing
            the CafeOS ordering portal, you agree to comply with and be bound by the following terms.
          </p>
        </div>

        {/* Section 1 */}
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 space-y-4">
          <h2 className="text-lg font-bold text-amber-200 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-amber-400" /> 1. Table Ordering & Dining
          </h2>
          <ul className="list-disc list-inside space-y-2 text-neutral-300 text-sm leading-relaxed">
            <li>Orders submitted via Table QR codes are dispatched directly to the active Kitchen Display System (KOT).</li>
            <li>Please ensure accurate table selection when dining in. Transferring tables requires informing your server.</li>
            <li>Menu items are subject to live stock availability; out-of-stock items (86&apos;d) are automatically prevented from checkout.</li>
          </ul>
        </div>

        {/* Section 2 */}
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 space-y-4">
          <h2 className="text-lg font-bold text-amber-200 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-amber-400" /> 2. Pricing, Billing & Payments
          </h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            All prices are listed in Indian Rupees (₹) and include applicable Goods and Services Tax (GST) breakdown.
            Payment modes accepted:
          </p>
          <ul className="list-disc list-inside space-y-2 text-neutral-300 text-sm leading-relaxed">
            <li>Direct UPI Intent & Dynamic Dynamic QR via Cashfree payment gateway.</li>
            <li>Cash or physical POS card payment settled at the front billing counter.</li>
            <li>Campaign discount promo codes and Beans loyalty points may be applied during cart checkout in accordance with active cafe promotion rules.</li>
          </ul>
        </div>

        {/* Section 3 */}
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 space-y-4">
          <h2 className="text-lg font-bold text-amber-200 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-400" /> 3. Cancellation & Refund Policy
          </h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            Because our beverages and kitchen dishes are freshly prepared upon receipt:
          </p>
          <ul className="list-disc list-inside space-y-2 text-neutral-300 text-sm leading-relaxed">
            <li>Once an order transitions to <span className="text-amber-400 font-semibold">&ldquo;Preparing&rdquo;</span>, customer self-cancellation is restricted.</li>
            <li>If an item is unavailable or defective, the kitchen manager can cancel the item, restore recipe inventory, and issue an automatic refund back to your source payment method within 5–7 banking days.</li>
          </ul>
        </div>

        {/* Section 4 */}
        <div className="p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/80 space-y-4">
          <h2 className="text-lg font-bold text-amber-200 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400" /> 4. Intellectual Property & Contact
          </h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            All branding, recipes, roast profiles, and CafeOS user interface assets are the proprietary intellectual property
            of Seth Sawariya Cafe. For disputes, inquiries, or billing questions, reach us at:
          </p>
          <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-300">
            Support: <a href="mailto:support@sethsawariya.com" className="text-amber-400 underline">support@sethsawariya.com</a><br/>
            Outlet Manager Desk: +91 98765 43210
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-neutral-800 text-center text-xs text-neutral-500">
          Seth Sawariya CafeOS · Hospitality Hub Terms of Service
        </div>
      </div>
    </div>
  );
};
