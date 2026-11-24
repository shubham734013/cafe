import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import type {
  AuthSessionState,
  CafeOrder,
  CafeSettings,
  CafeTable,
  InventoryIngredient,
  MenuItem,
  PromoCampaign,
  WorkspaceMode,
} from '../types/cafe';

export type VishalMode = 'customer' | 'staff';

export interface VishalAction {
  type:
    | 'ADD_TO_CART'
    | 'NAVIGATE'
    | 'APPLY_COUPON'
    | 'CALL_STEWARD'
    | 'REQUEST_WATER'
    | 'REQUEST_BILL'
    | 'POS_QUICK_BILL'
    | 'TOGGLE_STOCK'
    | 'VIEW_KITCHEN_ORDERS'
    | 'VIEW_ANALYTICS';
  label: string;
  payload?: any;
}

export interface VishalInsight {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export interface VishalResponse {
  text: string;
  speechText?: string;
  recommendedItems?: MenuItem[];
  actions?: VishalAction[];
  insights?: VishalInsight[];
}

export interface VishalContext {
  mode?: VishalMode;
  activeOrder?: CafeOrder;
  menuItems: MenuItem[];
  availableBeans?: number;
  cafeSettings?: CafeSettings;
  campaigns?: PromoCampaign[];
  orders?: CafeOrder[];
  tables?: CafeTable[];
  inventory?: InventoryIngredient[];
  workspaceMode?: WorkspaceMode;
  authSession?: AuthSessionState;
  lastMentionedMenuItem?: MenuItem;
  currentTable?: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findMatchingMenuItems(query: string, menuItems: MenuItem[], limit = 4): MenuItem[] {
  const normalized = normalize(query);
  const words = normalized.split(' ').filter((w) => w.length > 2);

  // Exact or contains match
  const exact = menuItems.filter(
    (item) =>
      item.isAvailable !== false &&
      (normalize(item.name).includes(normalized) || normalized.includes(normalize(item.name)))
  );
  if (exact.length > 0) return exact.slice(0, limit);

  // Keyword match
  const scored = menuItems
    .filter((item) => item.isAvailable !== false)
    .map((item) => {
      const itemWords = normalize(item.name).split(' ').concat(normalize(item.category).split(' '));
      let matchCount = 0;
      for (const w of words) {
        if (itemWords.some((iw) => iw.includes(w) || w.includes(iw))) {
          matchCount++;
        }
      }
      return { item, score: matchCount };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((s) => s.item).slice(0, limit);
}

export function getVishalAiResponse(question: string, context: VishalContext): VishalResponse {
  const text = normalize(question);
  const isAuthorizedStaff = Boolean(
    context.authSession?.role && ['admin', 'kitchen'].includes(context.authSession.role)
  );
  const isStaff = isAuthorizedStaff && (context.mode === 'staff' || context.workspaceMode === 'staff');
  const menu = context.menuItems || [];
  const orders = context.orders || [];
  const currentTable = context.currentTable || 'T1';

  if (!text) {
    return {
      text: isStaff
        ? 'Namaste! Main Vishal hoon — Cafe Operations Copilot. Aap kitchen status, sales report, ya POS quick-billing ke baare me pooch sakte hain.'
        : 'Namaste! Main Vishal hoon — The Sawariya Cafe ka AI Assistant. Main aapki craving, best combo, cart addition aur live order tracking me help kar sakta hoon!',
      speechText: isStaff
        ? 'Namaste! Main Vishal hoon, Cafe Operations Copilot.'
        : 'Namaste! Main Vishal hoon, The Sawariya Cafe ka AI Assistant.',
    };
  }

  // Security guard: If normal customer asks for internal sales or kitchen operations
  if (!isAuthorizedStaff && /\b(sale|sales|revenue|collection|earning|today report|kot|delayed orders|raw material)\b/.test(text)) {
    return {
      text: '🔒 Yeh internal operations information sirf cafe staff and admin ke liye reserved hai. Main aapko delicious food recommendations, special offers, aur order status me guide kar sakta hoon!',
      speechText: 'Yeh information cafe staff ke liye reserved hai. Main aapko menu ya offers me help kar sakta hoon.',
      actions: [
        { type: 'NAVIGATE', label: 'Explore Menu', payload: { screen: 'menu' } },
        { type: 'APPLY_COUPON', label: 'View Offers', payload: { code: 'TSC50' } },
      ],
    };
  }

  // -------------------------------------------------------------
  // STAFF / CAFE WORK INTELLIGENCE
  // -------------------------------------------------------------
  if (isStaff) {
    // 1. Kitchen Load / KOT Status
    if (
      /\b(kitchen|kot|pending order|pending orders|orders pending|load|cooking|chef|delayed)\b/.test(
        text
      )
    ) {
      const activeKitchenOrders = orders.filter((o) =>
        ['order_received', 'preparing'].includes(o.status)
      );
      const readyOrders = orders.filter((o) => o.status === 'ready_for_pickup');
      const now = Date.now();
      const delayedOrders = activeKitchenOrders.filter((o) => {
        const created = new Date(o.createdAt || Date.now()).getTime();
        return now - created > 15 * 60 * 1000;
      });

      const insights: VishalInsight[] = [
        { label: 'Active KOT', value: activeKitchenOrders.length, highlight: true },
        { label: 'Ready for Pickup', value: readyOrders.length },
        { label: 'Delayed (>15 min)', value: delayedOrders.length, highlight: delayedOrders.length > 0 },
      ];

      let msg = `👨‍🍳 **Kitchen Operations Summary:**\n`;
      msg += `• Current Active Cooking KOTs: **${activeKitchenOrders.length}**\n`;
      msg += `• Ready for Serving/Pickup: **${readyOrders.length}**\n`;
      if (delayedOrders.length > 0) {
        msg += `⚠️ **Warning:** ${delayedOrders.length} order(s) standard 15-min limit se zyada chal rahe hain (#${delayedOrders.map((o) => o.kotNumber || o.id.slice(0, 4)).join(', ')}).\n`;
      } else {
        msg += `✅ Sabhi orders safe time limit ke andar hain!\n`;
      }

      return {
        text: msg,
        speechText: `Kitchen me abhi ${activeKitchenOrders.length} active orders hain, aur ${readyOrders.length} orders ready hain.`,
        insights,
        actions: [
          { type: 'VIEW_KITCHEN_ORDERS', label: 'Open Kitchen KDS Display', payload: { screen: 'kitchen-display-system' } },
        ],
      };
    }

    // 2. Sales / Daily Revenue
    if (
      /\b(sale|sales|revenue|collection|earning|today report|summary|aov|business|income)\b/.test(text)
    ) {
      const today = new Date().toDateString();
      const todayOrders = orders.filter((o) => new Date(o.createdAt).toDateString() === today);
      const paidOrders = todayOrders.filter((o) => o.paymentStatus === 'paid');
      const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      const aov = paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0;

      // Top selling category/dish
      const itemFreq: Record<string, number> = {};
      todayOrders.forEach((o) => {
        o.items?.forEach((it) => {
          itemFreq[it.name] = (itemFreq[it.name] || 0) + (it.quantity || 1);
        });
      });
      const topDishes = Object.entries(itemFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const insights: VishalInsight[] = [
        { label: "Today's Revenue", value: `₹${totalRevenue.toLocaleString('en-IN')}`, highlight: true },
        { label: 'Paid Orders', value: paidOrders.length },
        { label: 'Avg Order Value', value: `₹${aov}` },
      ];

      let msg = `💰 **Today's Business & Sales Report:**\n`;
      msg += `• Total Revenue (Paid): **₹${totalRevenue.toLocaleString('en-IN')}**\n`;
      msg += `• Total Paid Orders: **${paidOrders.length}**\n`;
      msg += `• Average Order Value (AOV): **₹${aov}**\n`;
      if (topDishes.length > 0) {
        msg += `• 🔥 **Top Selling Today:** ${topDishes.map(([name, count]) => `${name} (${count})`).join(', ')}\n`;
      }

      return {
        text: msg,
        speechText: `Aaj ka kul revenue ₹${totalRevenue} hai across ${paidOrders.length} orders.`,
        insights,
        actions: [
          { type: 'VIEW_ANALYTICS', label: 'View Analytics Dashboard', payload: { screen: 'reports-analytics' } },
        ],
      };
    }

    // 3. Stock & Inventory Check
    if (/\b(stock|inventory|unavailable|out of stock|item available|raw material)\b/.test(text)) {
      const unavailableItems = menu.filter((item) => item.isAvailable === false);
      let msg = `📦 **Inventory & Stock Status:**\n`;
      if (unavailableItems.length > 0) {
        msg += `Currently **${unavailableItems.length}** item(s) are marked **Out of Stock**:\n`;
        unavailableItems.forEach((item) => {
          msg += `• ${item.name} (${item.category})\n`;
        });
        msg += `Aap admin menu edit ya inventory screen se inko wapas In-Stock kar sakte hain.`;
      } else {
        msg += `Sabhi menu items currently **In Stock & Available** hain! Koi bhi item 86 nahi hai.`;
      }

      return {
        text: msg,
        speechText:
          unavailableItems.length > 0
            ? `${unavailableItems.length} items currently out of stock hain.`
            : 'Sabhi menu items stock me available hain.',
        actions: [
          { type: 'NAVIGATE', label: 'Open Inventory Management', payload: { screen: 'inventory-stock' } },
          { type: 'NAVIGATE', label: 'Open Menu Editor', payload: { screen: 'admin-dashboard' } },
        ],
      };
    }

    // 4. Quick POS Bill Command for Staff (e.g. "bill 2 cold coffee")
    if (/\b(bill|add|punch|order for table|pos bill|take order)\b/.test(text)) {
      const matches = findMatchingMenuItems(text, menu, 3);
      if (matches.length > 0) {
        const actions: VishalAction[] = matches.map((item) => ({
          type: 'POS_QUICK_BILL',
          label: `Punch ${item.name} (₹${item.price})`,
          payload: { item, quantity: 1 },
        }));
        return {
          text: `⚡ **Quick POS Punch:** Maine ye items match kiye hain. Tap karke turant POS billing cart me add karein:`,
          speechText: `${matches.map((m) => m.name).join(', ')} ko billing cart me add kar diya ja sakta hai.`,
          recommendedItems: matches,
          actions: [
            ...actions,
            { type: 'NAVIGATE', label: 'Open POS Terminal', payload: { screen: 'pos-terminal' } },
          ],
        };
      }
    }

    // 5. Occupied Tables
    if (/\b(table|tables|occupied|vacant|diners|seating)\b/.test(text)) {
      const activeTableOrders = orders.filter(
        (o) =>
          o.serviceMode === 'dine_in' &&
          ['order_received', 'preparing', 'ready_for_pickup'].includes(o.status)
      );
      const occupiedTables = Array.from(new Set(activeTableOrders.map((o) => o.tableNumber).filter(Boolean)));

      let msg = `🪑 **Table Occupancy Status:**\n`;
      msg += `• Occupied Dine-in Tables: **${occupiedTables.length > 0 ? occupiedTables.join(', ') : 'None'}**\n`;
      msg += `• Total active dine-in orders: **${activeTableOrders.length}**`;

      return {
        text: msg,
        speechText: `Abhi ${occupiedTables.length} tables par active orders chal rahe hain.`,
        insights: [
          { label: 'Occupied Tables', value: occupiedTables.length, highlight: true },
          { label: 'Active Dine-in KOT', value: activeTableOrders.length },
        ],
        actions: [{ type: 'NAVIGATE', label: 'View Table Layout', payload: { screen: 'kitchen-tables' } }],
      };
    }
  }

  // -------------------------------------------------------------
  // CUSTOMER ASSISTANT & BUTLER INTELLIGENCE
  // -------------------------------------------------------------

  // 1. Direct Add to Cart Action (e.g. "add 2 burger", "cart me dal do", "order cold coffee")
  if (
    /\b(add|daal do|dal do|cart me|add to cart|order karo|mangwa do|chahiye|pack karo)\b/.test(text) &&
    !/\b(status|track|kahan|where)\b/.test(text)
  ) {
    const matchedItems = findMatchingMenuItems(text, menu, 3);
    if (matchedItems.length > 0) {
      const primeItem = matchedItems[0];
      // Check quantity: "2 cold coffee", "3 pizza"
      const qtyMatch = text.match(/\b([1-9]|10)\b/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      return {
        text: `🛒 **Item Ready!** Maine aapke liye **${qty} × ${primeItem.name}** (₹${primeItem.price * qty}) identify kiya hai. Aap neeche diye button se turant Cart me add kar sakte hain:`,
        speechText: `${primeItem.name} ko cart me add karne ke liye ready kar diya hai.`,
        recommendedItems: matchedItems,
        actions: [
          {
            type: 'ADD_TO_CART',
            label: `➕ Add ${qty} × ${primeItem.name} (₹${primeItem.price * qty})`,
            payload: { item: primeItem, quantity: qty },
          },
          {
            type: 'NAVIGATE',
            label: 'Go to Cart & Checkout',
            payload: { screen: 'cart' },
          },
        ],
      };
    }
  }

  // 2. Spicy / Chatpata Craving
  if (/\b(spicy|chatpata|teekha|masaledar|kurkura|chili|mirch|tandoori)\b/.test(text)) {
    const spicyItems = menu.filter(
      (item) =>
        item.isAvailable !== false &&
        (normalize(item.name).includes('tandoori') ||
          normalize(item.name).includes('peri peri') ||
          normalize(item.name).includes('masala') ||
          normalize(item.name).includes('capsicum'))
    );
    const picks = spicyItems.length > 0 ? spicyItems.slice(0, 4) : menu.slice(0, 3);

    return {
      text: `🌶️ **Craving Something Spicy & Zesty?**\nYe hain hamare sabse chatpate aur popular options jo aapko zarur pasand aayenge:`,
      speechText: 'Spicy cravings ke liye Tandoori Pizza aur Peri Peri Fries best choices hain!',
      recommendedItems: picks,
      actions: picks.map((item) => ({
        type: 'ADD_TO_CART',
        label: `Add ${item.name} (₹${item.price})`,
        payload: { item, quantity: 1 },
      })),
    };
  }

  // 3. Cheesy & Indulgent Craving
  if (/\b(cheese|cheesy|makhan|cream|creamy|paneer|loaded)\b/.test(text)) {
    const cheesyItems = menu.filter(
      (item) =>
        item.isAvailable !== false &&
        (normalize(item.name).includes('cheese') ||
          normalize(item.name).includes('paneer') ||
          normalize(item.name).includes('margherita'))
    );
    const picks = cheesyItems.length > 0 ? cheesyItems.slice(0, 4) : menu.slice(0, 3);

    return {
      text: `🧀 **Loaded with Cheese!**\nCheese lovers ke liye ye hamare top rated items hain:`,
      speechText: 'Cheese lovers ke liye Double Cheese Pizza aur Cheese Paneer Burger top recommendations hain.',
      recommendedItems: picks,
      actions: picks.map((item) => ({
        type: 'ADD_TO_CART',
        label: `Add ${item.name} (₹${item.price})`,
        payload: { item, quantity: 1 },
      })),
    };
  }

  // 4. Budget Recommendations (e.g. Under ₹100 or ₹150)
  if (/\b(budget|sasta|cheap|under 100|under 150|under 200|kam daam|paisa vasool|pocket friendly)\b/.test(text)) {
    const limit = text.includes('150') ? 150 : text.includes('200') ? 200 : 100;
    const affordableItems = menu
      .filter((item) => item.isAvailable !== false && item.price <= limit)
      .sort((a, b) => a.price - b.price);
    const picks = affordableItems.slice(0, 4);

    return {
      text: `🪙 **Pocket Friendly Delights (Under ₹${limit}):**\nAapke budget me taste se koi compromise nahi! Ye dekhein:`,
      speechText: `₹${limit} ke andar Aloo Tikki Burger, Plain Maggi aur Veg Sandwich best options hain.`,
      recommendedItems: picks,
      actions: picks.map((item) => ({
        type: 'ADD_TO_CART',
        label: `Add ${item.name} (₹${item.price})`,
        payload: { item, quantity: 1 },
      })),
    };
  }

  // 5. Best Pairing with Cold Coffee or Beverage
  if (/\b(coffee|cold coffee|tea|chai|shake|beverage|drink|pairing|ke sath|with coffee)\b/.test(text)) {
    const coffeeItems = menu.filter((i) => normalize(i.name).includes('cold coffee'));
    const pairings = menu.filter((i) =>
      ['tsc-special-burger', 'cheese-grill-sandwich', 'peri-peri-fries', 'margherita-pizza'].includes(i.id)
    );
    const combined = [...pairings, ...coffeeItems].filter((i) => i.isAvailable !== false).slice(0, 4);

    return {
      text: `☕ **Best Coffee Pairings:**\nCold Coffee ke sath hamara **TSC Special Burger** aur **Cheese Grill Sandwich** ekdum classic combination bante hain!`,
      speechText: 'Cold Coffee ke sath TSC Special Burger aur Cheese Grill Sandwich best combination hain.',
      recommendedItems: combined,
      actions: combined.map((item) => ({
        type: 'ADD_TO_CART',
        label: `Add ${item.name} (₹${item.price})`,
        payload: { item, quantity: 1 },
      })),
    };
  }

  // 6. Special Offers, Birthday & Deals
  if (
    /\b(offer|offers|deal|discount|birthday|free|coupon|promo|bogo|buy 5|free ice cream)\b/.test(text)
  ) {
    let msg = `🎁 **The Sawariya Cafe — Special Offers & Perks:**\n\n`;
    msg += `🎂 **1. Birthday Celebration Package (₹800):**\nPlace an order of ₹800 and celebrate your birthday with 1.5 hours exclusive dining time!\n\n`;
    msg += `☕ **2. Buy 5 Get 1 Free:**\nPurchase 5 Medium Cold Coffees and get 1 Small Cold Coffee free!\n\n`;
    msg += `🍨 **3. Free Ice Cream Offer:**\nFollow our Instagram (@the_sawariya_cafe) and leave a Google Review to get a complimentary cup of ice cream!\n\n`;
    msg += `🛵 **4. Free Delivery:**\nEnjoy Free Home Delivery within 1 km on orders above ₹249!\n`;

    return {
      text: msg,
      speechText:
        'Hamare paas Birthday Party offer ₹800 me, Buy 5 get 1 cold coffee free, aur free delivery offer available hain.',
      actions: [
        { type: 'APPLY_COUPON', label: 'Use Promo Code TSC50', payload: { code: 'TSC50' } },
        { type: 'NAVIGATE', label: 'View Offers Screen', payload: { screen: 'rewards' } },
      ],
    };
  }

  // 7. Table Butler & Steward Calling (Water, Tissue, Waiter, Bill)
  if (
    /\b(waiter|steward|call|paani|water|tissue|bill chahiye|bill please|chammach|spoon|service)\b/.test(
      text
    )
  ) {
    const isWater = /\b(paani|water)\b/.test(text);
    const isBill = /\b(bill|cheque|hisab)\b/.test(text);

    if (isBill) {
      return {
        text: `🧾 **Bill Request Sent!**\nTable **${currentTable}** ke liye counter par bill request notify kar di gayi hai. Steward aapke table par bill lekar aa rahe hain.`,
        speechText: `Table ${currentTable} ke liye bill request send kar di gayi hai.`,
        actions: [{ type: 'REQUEST_BILL', label: 'Confirm Bill Request', payload: { table: currentTable } }],
      };
    }

    if (isWater) {
      return {
        text: `💧 **Fresh Water Request Received!**\nTable **${currentTable}** par fresh drinking water ke liye steward ko notify kiya ja chuka hai.`,
        speechText: `Table ${currentTable} par paani serve karne ke liye steward aa rahe hain.`,
        actions: [{ type: 'REQUEST_WATER', label: 'Water Request Logged', payload: { table: currentTable } }],
      };
    }

    return {
      text: `🔔 **Steward Assistance:**\nTable **${currentTable}** par service ke liye alert bhej diya gaya hai. Hamara staff jaldi hi aapke paas hoga.`,
      speechText: `Table ${currentTable} par steward ko notify kar diya hai.`,
      actions: [{ type: 'CALL_STEWARD', label: 'Call Steward to Table', payload: { table: currentTable } }],
    };
  }

  // 8. Order Status Tracking
  if (
    /\b(order|status|track|tracking|eta|prepar\w*|kahan hai|kitna time|ready|kab aayega)\b/.test(text) &&
    !/\b(payment|paid|pay|refund)\b/.test(text)
  ) {
    const activeOrder = context.activeOrder;
    if (!activeOrder) {
      return {
        text: `Aapka koi active order select nahi hai. Aap **My Orders** screen se apna order dekh sakte hain ya naya order place kar sakte hain.`,
        speechText: 'Aapka koi active order nahi mila.',
        actions: [
          { type: 'NAVIGATE', label: 'Browse Menu', payload: { screen: 'menu' } },
          { type: 'NAVIGATE', label: 'My Orders', payload: { screen: 'tracking' } },
        ],
      };
    }

    const orderNumber = activeOrder.kotNumber || activeOrder.id.slice(0, 4);
    const statusMeta = ORDER_STATUS_META[activeOrder.status] || { label: activeOrder.status };
    const itemsCount = activeOrder.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0;

    let msg = `🛵 **Live Order #${orderNumber} Status:**\n`;
    msg += `• Current Status: **${statusMeta.label}**\n`;
    msg += `• Items: **${itemsCount} item(s)** (${activeOrder.items?.map((i) => `${i.quantity}× ${i.name}`).join(', ')})\n`;
    msg += `• Estimated Kitchen Time: 10–15 mins for regular items (15–20 mins for special items).\n`;
    msg += `• Order Total: **₹${activeOrder.total}**`;

    return {
      text: msg,
      speechText: `Aapka order #${orderNumber} abhi ${statusMeta.label} state me hai.`,
      insights: [
        { label: 'Order #', value: orderNumber },
        { label: 'Status', value: statusMeta.label, highlight: true },
        { label: 'Total', value: `₹${activeOrder.total}` },
      ],
      actions: [
        { type: 'NAVIGATE', label: 'Live Tracking Page', payload: { screen: 'tracking' } },
      ],
    };
  }

  // 9. Wi-Fi & Cafe Information
  if (/\b(wifi|wi-fi|internet|password|passcode)\b/.test(text)) {
    return {
      text: `📶 **High-Speed Cafe Wi-Fi Details:**\n• **Network (SSID):** Airtel_The sawariya cafe\n• **Password:** Sawariya@1177\n\nConnect karein aur cafe me smooth internet enjoy karein!`,
      speechText: 'WiFi network Airtel The sawariya cafe hai, aur password Sawariya@1177 hai.',
      insights: [
        { label: 'Wi-Fi SSID', value: 'Airtel_The sawariya cafe' },
        { label: 'Password', value: 'Sawariya@1177', highlight: true },
      ],
    };
  }

  // 10. Contact, Address & Location
  if (/\b(address|location|phone|call|contact|timing|hours|open|kahan)\b/.test(text)) {
    return {
      text: `📍 **The Sawariya Cafe Details:**\n• **Phone:** 01414611071\n• **WhatsApp:** 7300348070\n• **Instagram:** @the_sawariya_cafe\n• **Timings:** Open all 7 days from 10:00 AM to 11:00 PM\n• **Pure Veg:** 100% Pure Vegetarian Cafe\n\nFree delivery up to 1 km on orders above ₹249!`,
      speechText: 'The Sawariya Cafe ka phone number 01414611071 hai, aur timing subah 10 baje se raat 11 baje tak hai.',
      actions: [
        { type: 'NAVIGATE', label: 'View Profile & Contact', payload: { screen: 'profile' } },
      ],
    };
  }

  // 11. Specific Dish Query
  const matched = findMatchingMenuItems(text, menu, 3);
  if (matched.length > 0) {
    const item = matched[0];
    let msg = `🍽️ **${item.name}** (${item.category})\n`;
    msg += `• Price: **₹${item.price}**\n`;
    msg += `• Dietary: **${item.isVeg ? '🟢 100% Pure Veg' : 'Non-Veg'}**\n`;
    if (item.description) msg += `• Details: ${item.description}\n`;
    msg += `• Availability: **${item.isAvailable !== false ? '✅ Freshly Available' : '❌ Out of Stock'}**`;

    return {
      text: msg,
      speechText: `${item.name} ₹${item.price} me available hai.`,
      recommendedItems: matched,
      actions: [
        {
          type: 'ADD_TO_CART',
          label: `Add ${item.name} (₹${item.price}) to Cart`,
          payload: { item, quantity: 1 },
        },
      ],
    };
  }

  // 12. Fallback Friendly Help
  return {
    text: `Main Vishal hoon, aapka cafe assistant! Main ye sab kar sakta hoon:\n• 🍕 **Taste Recommendations** (Spicy, Cheesy, Combos)\n• 🛒 **Direct Cart Additions** ("Add 2 cold coffee")\n• 🎁 **Special Deals & Birthday Party Packages**\n• 🛵 **Live KOT Cooking & Order Tracking**\n• 📶 **Wi-Fi Details & Table Butler Service**\n\nAap kya try karna chahenge?`,
    speechText: 'Main aapki craving, food order ya cafe help me guide kar sakta hoon. Batayein main kya madad karu?',
    actions: [
      { type: 'NAVIGATE', label: 'Open Full Menu', payload: { screen: 'menu' } },
      { type: 'APPLY_COUPON', label: 'See Special Offers', payload: { code: 'TSC50' } },
    ],
  };
}
