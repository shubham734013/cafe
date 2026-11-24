import React, { useEffect, useRef, useState } from 'react';
import { useCafeStore } from '../store/useCafeStore';
import type { MenuItem } from '../types/cafe';
import {
  getVishalAiResponse,
  type VishalAction,
  type VishalContext,
  type VishalMode,
  type VishalResponse,
} from '../utils/vishalAi';

export interface VishalAiAssistantProps {
  context?: VishalContext;
  defaultOpen?: boolean;
  onClose?: () => void;
  mode?: 'floating' | 'embedded';
}

interface ChatMessage {
  id: number;
  sender: 'assistant' | 'user';
  text: string;
  recommendedItems?: MenuItem[];
  actions?: VishalAction[];
  insights?: { label: string; value: string | number; highlight?: boolean }[];
  timestamp: string;
}

interface FloatingPosition {
  left: number;
  top: number;
}

const FLOATING_POSITION_KEY = 'cafeos_vishal_assistant_position';
const FLOATING_BUTTON_SIZE = 48;
const VIEWPORT_MARGIN = 8;

function clampFloatingPosition(left: number, top: number): FloatingPosition {
  return {
    left: Math.min(
      Math.max(VIEWPORT_MARGIN, left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - FLOATING_BUTTON_SIZE - VIEWPORT_MARGIN)
    ),
    top: Math.min(
      Math.max(VIEWPORT_MARGIN, top),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - FLOATING_BUTTON_SIZE - VIEWPORT_MARGIN)
    ),
  };
}

export const VishalAiAssistant: React.FC<VishalAiAssistantProps> = ({
  context,
  defaultOpen = false,
  onClose,
  mode = 'floating',
}) => {
  const store = useCafeStore();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isAuthorizedStaff = Boolean(
    context?.authSession?.role && ['admin', 'kitchen'].includes(context.authSession.role)
  );
  const [activeTab, setActiveTab] = useState<VishalMode>(
    isAuthorizedStaff && (context?.mode === 'staff' || store.workspaceMode === 'staff')
      ? 'staff'
      : 'customer'
  );
  const [input, setInput] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [floatingPosition, setFloatingPosition] = useState<FloatingPosition | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = window.localStorage.getItem(FLOATING_POSITION_KEY);
      if (!saved) return null;
      const position = JSON.parse(saved) as Partial<FloatingPosition>;
      if (typeof position.left !== 'number' || typeof position.top !== 'number') return null;
      return clampFloatingPosition(position.left, position.top);
    } catch (error) {
      console.warn('Could not restore the Vishal AI launcher position:', error);
      return null;
    }
  });
  const dragStartRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    left: number;
    top: number;
  } | null>(null);
  const draggedRef = useRef(false);

  const initialGreeting =
    isAuthorizedStaff && activeTab === 'staff'
      ? 'Namaste! Main Vishal hoon — Cafe Operations Copilot. KOT load, daily sales, delay alerts ya quick POS billing me main aapki help kar sakta hoon.'
      : 'Namaste! Main Vishal hoon — The Sawariya Cafe ka AI Assistant. Main aapki craving, best combo, cart addition aur live order tracking me help kar sakta hoon!';

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      sender: 'assistant',
      text: initialGreeting,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!floatingPosition) return;
    const handleResize = () => {
      setFloatingPosition((position) =>
        position ? clampFloatingPosition(position.left, position.top) : null
      );
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [Boolean(floatingPosition)]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query) return;

    const userMsg: ChatMessage = {
      id: Date.now(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Compute Vishal AI intelligence
    const vishalContext: VishalContext = {
      ...context,
      mode: activeTab,
      menuItems: context?.menuItems || [],
      orders: context?.orders || [],
      activeOrder: context?.activeOrder,
      currentTable: store.selectedTable || 'T1',
      workspaceMode: store.workspaceMode,
      authSession: context?.authSession,
    };

    const reply: VishalResponse = getVishalAiResponse(query, vishalContext);

    const assistantMsg: ChatMessage = {
      id: Date.now() + 1,
      sender: 'assistant',
      text: reply.text,
      recommendedItems: reply.recommendedItems,
      actions: reply.actions,
      insights: reply.insights,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, assistantMsg]);
  };

  const executeAction = (action: VishalAction) => {
    if (action.type === 'ADD_TO_CART' && action.payload?.item) {
      store.addCustomerItem(action.payload.item, action.payload.quantity || 1);
      setActionNotice(`✅ Added ${action.payload.item.name} to Cart!`);
      setTimeout(() => setActionNotice(null), 3000);
    } else if (action.type === 'POS_QUICK_BILL' && action.payload?.item) {
      store.addPosItem(action.payload.item, undefined, action.payload.quantity || 1);
      setActionNotice(`⚡ Added ${action.payload.item.name} to POS Cart!`);
      setTimeout(() => setActionNotice(null), 3000);
    } else if (action.type === 'NAVIGATE' && action.payload?.screen) {
      store.navigate(action.payload.screen, store.workspaceMode);
      setIsOpen(false);
    } else if (action.type === 'VIEW_KITCHEN_ORDERS') {
      store.navigate('kitchen-display-system', 'staff');
      setIsOpen(false);
    } else if (action.type === 'VIEW_ANALYTICS') {
      store.navigate('reports-analytics', 'staff');
      setIsOpen(false);
    } else if (action.type === 'APPLY_COUPON' && action.payload?.code) {
      store.setCouponCode(action.payload.code);
      setActionNotice(`🎟️ Applied Coupon: ${action.payload.code}`);
      setTimeout(() => setActionNotice(null), 3000);
    } else if (
      action.type === 'CALL_STEWARD' ||
      action.type === 'REQUEST_WATER' ||
      action.type === 'REQUEST_BILL'
    ) {
      setActionNotice(`🔔 Notification sent to Counter for Table ${store.selectedTable || 'T1'}`);
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  const handleLauncherPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    draggedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleLauncherPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragStart.pointerX;
    const deltaY = event.clientY - dragStart.pointerY;
    if (!draggedRef.current && Math.hypot(deltaX, deltaY) < 5) return;
    draggedRef.current = true;
    setFloatingPosition(clampFloatingPosition(dragStart.left + deltaX, dragStart.top + deltaY));
  };

  const handleLauncherPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    dragStartRef.current = null;
    if (!draggedRef.current) return;

    const position = clampFloatingPosition(
      dragStart.left + event.clientX - dragStart.pointerX,
      dragStart.top + event.clientY - dragStart.pointerY
    );
    setFloatingPosition(position);
    try {
      window.localStorage.setItem(FLOATING_POSITION_KEY, JSON.stringify(position));
    } catch (error) {
      console.warn('Could not save the Vishal AI launcher position:', error);
    }
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };

  const handleLauncherPointerCancel = () => {
    dragStartRef.current = null;
    draggedRef.current = false;
  };

  const handleLauncherClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setIsOpen(true);
  };

  const floatingPanelStyle: React.CSSProperties | undefined = floatingPosition
    ? (() => {
        const panelWidth = Math.max(0, Math.min(390, window.innerWidth - 32));
        const panelHeight = Math.max(
          0,
          Math.min(window.innerWidth >= 640 ? 590 : 520, window.innerHeight - 32)
        );
        const left = Math.min(
          Math.max(VIEWPORT_MARGIN, floatingPosition.left + FLOATING_BUTTON_SIZE - panelWidth),
          Math.max(VIEWPORT_MARGIN, window.innerWidth - panelWidth - VIEWPORT_MARGIN)
        );
        const aboveTop = floatingPosition.top - panelHeight - 12;
        const preferredTop =
          aboveTop >= VIEWPORT_MARGIN
            ? aboveTop
            : floatingPosition.top + FLOATING_BUTTON_SIZE + 12;
        const top = Math.min(
          Math.max(VIEWPORT_MARGIN, preferredTop),
          Math.max(VIEWPORT_MARGIN, window.innerHeight - panelHeight - VIEWPORT_MARGIN)
        );
        return { left, top, width: panelWidth, height: panelHeight };
      })()
    : undefined;

  const customerQuickPrompts = [
    { label: '🍕 Spicy Pizzas', text: 'Spicy pizza options dikhao' },
    { label: '☕ Best with Cold Coffee', text: 'Cold coffee ke sath kya best snack hai?' },
    { label: '🪙 Under ₹100', text: 'Budget snacks under 100 rupees' },
    { label: '🎂 Birthday Offer', text: 'Birthday celebration offer details' },
    { label: '🛵 Order Status', text: 'Mera order status kya hai?' },
    { label: '🔔 Call Waiter', text: 'Table par waiter bulana hai' },
    { label: '📶 Free Wi-Fi', text: 'Cafe ka wifi password kya hai?' },
  ];

  const staffQuickPrompts = [
    { label: '👨‍🍳 Live KOT Load', text: 'Kitchen pending orders status' },
    { label: '💰 Today Sales', text: 'Aaj ki total sales and revenue summary' },
    { label: '⚠️ Delayed Orders', text: 'Delayed orders check (>15 min)' },
    { label: '📦 Stock Check', text: 'Out of stock items check' },
    { label: '🪑 Table Status', text: 'Occupied tables list' },
  ];

  const currentPrompts =
    isAuthorizedStaff && activeTab === 'staff' ? staffQuickPrompts : customerQuickPrompts;

  if (mode === 'embedded') {
    return (
      <div className="flex flex-col h-[480px] bg-surface-container rounded-2xl border border-outline-variant/30 overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 bg-black/40 border-b border-outline-variant/20 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-[#D4AF37] shadow-sm bg-black p-0.5 relative">
              <img src="/images/tsc-logo.jpg" alt="Vishal AI" className="w-full h-full object-cover rounded-full" />
              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-black" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-on-surface">Vishal AI</span>
                <span className="text-[10px] bg-[#D4AF37]/20 text-[#D4AF37] font-semibold px-1.5 py-0.2 rounded-full border border-[#D4AF37]/40">
                  Copilot
                </span>
              </div>
              <p className="text-[10px] text-on-surface-variant">The Sawariya Cafe Assistant</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-primary text-on-primary rounded-tr-xs shadow-sm'
                    : 'bg-surface-container-high text-on-surface rounded-tl-xs border border-outline-variant/15 shadow-sm'
                }`}
              >
                <div className="whitespace-pre-line">{msg.text}</div>

                {/* Insights Pills */}
                {msg.insights && msg.insights.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-outline-variant/20 flex flex-wrap gap-1.5">
                    {msg.insights.map((ins, i) => (
                      <div
                        key={i}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                          ins.highlight
                            ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40'
                            : 'bg-surface-container text-on-surface-variant'
                        }`}
                      >
                        <span className="font-normal opacity-80">{ins.label}: </span>
                        <span>{ins.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommended Dishes */}
                {msg.recommendedItems && msg.recommendedItems.length > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-outline-variant/20 grid grid-cols-1 gap-1.5">
                    {msg.recommendedItems.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-container border border-outline-variant/25 hover:border-[#D4AF37]/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={item.imageUrl || '/images/tsc-logo.jpg'}
                            alt={item.name}
                            className="w-9 h-9 rounded-lg object-cover bg-black shrink-0 border border-outline-variant/30"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-[11px] text-on-surface truncate">{item.name}</p>
                            <p className="text-[10px] text-[#D4AF37] font-semibold">₹{item.price}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => executeAction({ type: 'ADD_TO_CART', label: 'Add', payload: { item, quantity: 1 } })}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-[10px] font-bold flex items-center gap-1 shadow-xs transition-transform active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[13px]">add</span>
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action Buttons */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-outline-variant/20 flex flex-wrap gap-1.5">
                    {msg.actions.map((act, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => executeAction(act)}
                        className="px-2.5 py-1 rounded-full bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 text-[#D4AF37] border border-[#D4AF37]/40 text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95"
                      >
                        <span>{act.label}</span>
                        <span className="material-symbols-outlined text-[12px]">chevron_right</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[9px] text-on-surface-variant/60 mt-1 px-1">{msg.timestamp}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="px-3 py-1.5 border-t border-outline-variant/15 flex gap-1.5 overflow-x-auto no-scrollbar">
          {currentPrompts.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSendMessage(p.text)}
              className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full bg-surface-container-high hover:bg-surface-container text-on-surface-variant border border-outline-variant/20 hover:border-primary/50 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-2.5 bg-black/40 border-t border-outline-variant/20 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Poochhein Vishal AI se..."
            className="flex-1 bg-surface-container-high border border-outline-variant/30 rounded-xl px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => handleSendMessage()}
            className="w-8 h-8 rounded-xl bg-primary hover:bg-primary-hover text-on-primary flex items-center justify-center transition-transform active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
        </div>
      </div>
    );
  }

  // FLOATING WIDGET MODE
  return (
    <>
      {/* Action Toast Notice */}
      {actionNotice && (
        <div className="fixed bottom-28 right-6 z-[60] bg-black/90 text-[#D4AF37] border border-[#D4AF37]/50 px-4 py-2 rounded-xl text-xs font-bold shadow-2xl backdrop-blur-md animate-bounce">
          {actionNotice}
        </div>
      )}

      {/* Sleek Compact Launcher Button - Positioned above mobile bottom bar */}
      {!isOpen && (
        <div
          className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2"
          style={
            floatingPosition
              ? { left: floatingPosition.left, top: floatingPosition.top, right: 'auto', bottom: 'auto' }
              : undefined
          }
        >
          <button
            type="button"
            onClick={handleLauncherClick}
            onPointerDown={handleLauncherPointerDown}
            onPointerMove={handleLauncherPointerMove}
            onPointerUp={handleLauncherPointerUp}
            onPointerCancel={handleLauncherPointerCancel}
            className="group relative flex items-center justify-center w-12 h-12 rounded-full bg-black/95 hover:bg-black text-on-surface border-2 border-[#D4AF37]/80 hover:border-[#D4AF37] shadow-[0_6px_22px_rgba(212,175,55,0.35)] hover:shadow-[0_8px_32px_rgba(212,175,55,0.55)] backdrop-blur-md transition-all duration-300 hover:scale-110 active:scale-95 cursor-grab active:cursor-grabbing touch-none select-none"
            aria-label="Drag to move or open Vishal AI Assistant"
            title="Drag to move or click to open Vishal AI"
          >
            <div className="w-9 h-9 rounded-full overflow-hidden border border-[#D4AF37]/50 bg-black p-0.5 relative shrink-0">
              <img src="/images/tsc-logo.jpg" alt="Vishal AI" className="w-full h-full object-cover rounded-full" />
            </div>
            {/* AI Sparkle Badge */}
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-tr from-[#D4AF37] to-amber-200 text-black flex items-center justify-center text-[9px] font-black shadow-sm ring-1 ring-black">
              ✦
            </span>
            {/* Active Pulse Dot */}
            <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-black animate-pulse" />
          </button>
        </div>
      )}

      {/* Expanded Floating Assistant - Opens smoothly from button */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 w-[calc(100vw-2rem)] max-w-[390px] h-[520px] sm:h-[590px] z-50 flex flex-col bg-[#121212]/98 border border-[#D4AF37]/50 rounded-3xl shadow-[0_16px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl overflow-hidden transition-all duration-300 ease-out origin-bottom-right animate-in fade-in zoom-in-95"
          style={floatingPanelStyle}
        >
          {/* Header */}
          <div className="flex flex-col border-b border-outline-variant/20 bg-black/70 p-3 sm:p-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-[#D4AF37] shadow-md bg-black p-0.5 relative">
                  <img src="/images/tsc-logo.jpg" alt="Vishal AI" className="w-full h-full object-cover rounded-full" />
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-black" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-extrabold text-sm text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] via-amber-100 to-[#D4AF37]">
                      Vishal AI
                    </h3>
                    <span className="text-[9px] bg-[#D4AF37]/20 text-[#D4AF37] font-bold px-1.5 py-0.2 rounded-full border border-[#D4AF37]/40">
                      {isAuthorizedStaff ? 'Staff Copilot' : 'Food Butler'}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    {isAuthorizedStaff ? 'Cafe Operations & Kitchen Assistant' : 'The Sawariya Cafe Assistant & Butler'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    if (onClose) onClose();
                  }}
                  className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            {/* Mode Switcher Tabs - ONLY shown for authorized staff/admin */}
            {isAuthorizedStaff && (
              <div className="flex items-center gap-1 mt-2.5 bg-zinc-900/90 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveTab('customer')}
                  className={`flex-1 py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'customer'
                      ? 'bg-gradient-to-r from-[#D4AF37] to-amber-600 text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>🍔</span>
                  <span>Customer View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('staff')}
                  className={`flex-1 py-1 px-2.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 ${
                    activeTab === 'staff'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <span>👨‍🍳</span>
                  <span>Cafe Operations</span>
                </button>
              </div>
            )}
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-primary text-on-primary rounded-tr-xs shadow-md'
                      : 'bg-zinc-900/90 text-zinc-100 rounded-tl-xs border border-white/10 shadow-lg'
                  }`}
                >
                  <div className="whitespace-pre-line font-medium">{msg.text}</div>

                  {/* Insights Section */}
                  {msg.insights && msg.insights.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap gap-2">
                      {msg.insights.map((ins, i) => (
                        <div
                          key={i}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold ${
                            ins.highlight
                              ? 'bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/50 shadow-xs'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          <span className="font-normal opacity-80">{ins.label}: </span>
                          <span>{ins.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommended Items Cards */}
                  {msg.recommendedItems && msg.recommendedItems.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 space-y-2">
                      {msg.recommendedItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-black/60 border border-white/10 hover:border-[#D4AF37]/60 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.imageUrl || '/images/tsc-logo.jpg'}
                              alt={item.name}
                              className="w-11 h-11 rounded-xl object-cover bg-zinc-900 shrink-0 border border-white/10"
                            />
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-white truncate">{item.name}</p>
                              <div className="flex items-center gap-2 text-[11px]">
                                <span className="text-[#D4AF37] font-extrabold">₹{item.price}</span>
                                {item.isVeg && (
                                  <span className="text-[9px] text-emerald-400 font-semibold bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-500/30">
                                    VEG
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              executeAction({
                                type: activeTab === 'staff' ? 'POS_QUICK_BILL' : 'ADD_TO_CART',
                                label: 'Add',
                                payload: { item, quantity: 1 },
                              })
                            }
                            className="shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-amber-600 text-black text-xs font-extrabold flex items-center gap-1 shadow-md hover:scale-105 active:scale-95 transition-transform"
                          >
                            <span className="material-symbols-outlined text-[15px]">add</span>
                            <span>Add</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions Buttons */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap gap-1.5">
                      {msg.actions.map((act, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => executeAction(act)}
                          className="px-3 py-1.5 rounded-xl bg-[#D4AF37]/20 hover:bg-[#D4AF37]/35 text-[#D4AF37] border border-[#D4AF37]/50 text-xs font-bold transition-all flex items-center gap-1 shadow-xs hover:scale-102 active:scale-95"
                        >
                          <span>{act.label}</span>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500 mt-1 px-1">{msg.timestamp}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-3 py-2 bg-black/40 border-t border-white/10 flex gap-2 overflow-x-auto no-scrollbar">
            {currentPrompts.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendMessage(p.text)}
                className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/10 hover:border-[#D4AF37]/50 transition-all active:scale-95"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-black/80 border-t border-white/10 flex items-center gap-2">
            <div className="flex-1 relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={
                  activeTab === 'staff'
                    ? 'Ask KOT load, sales, quick punch...'
                    : 'Poochhein cravings, combos, status...'
                }
                className="w-full bg-zinc-900 border border-white/15 focus:border-[#D4AF37] rounded-2xl px-4 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Send Button */}
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={!input.trim()}
              className="w-10 h-10 rounded-2xl bg-gradient-to-r from-[#D4AF37] to-amber-600 disabled:opacity-40 text-black flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-md shrink-0 disabled:hover:scale-100"
            >
              <span className="material-symbols-outlined text-[20px]">send</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
