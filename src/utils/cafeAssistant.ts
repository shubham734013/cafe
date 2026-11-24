import { ORDER_STATUS_META } from '../state/cafeStateMachines';
import type { CafeOrder, CafeSettings, MenuItem, PromoCampaign } from '../types/cafe';

export * from './vishalAi';

export interface CafeAssistantContext {
  activeOrder?: CafeOrder;
  menuItems: MenuItem[];
  availableBeans: number;
  cafeSettings?: CafeSettings;
  campaigns?: PromoCampaign[];
  lastMentionedMenuItem?: MenuItem;
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

export function findCafeAssistantMenuItem(question: string, menuItems: MenuItem[]): MenuItem | undefined {
  const normalizedQuestion = normalize(question);
  const exactMatch = menuItems.find((item) => normalizedQuestion.includes(normalize(item.name)));
  if (exactMatch) return exactMatch;

  const questionWords = new Set(normalizedQuestion.split(' ').filter((word) => word.length > 2));
  return menuItems
    .map((item) => {
      const itemWords = normalize(item.name).split(' ').filter((word) => word.length > 2);
      const matchingWords = itemWords.filter((word) => questionWords.has(word)).length;
      return { item, score: matchingWords / Math.max(itemWords.length, 1) };
    })
    .filter(({ score }) => score >= 0.6)
    .sort((a, b) => b.score - a.score)[0]?.item;
}

function describeMenuItem(item: MenuItem, question: string): string {
  const normalizedQuestion = normalize(question);
  if (normalizedQuestion.includes('available') || normalizedQuestion.includes('stock')) {
    return item.isAvailable === false
      ? `${item.name} is currently unavailable. I can help you find another option.`
      : `${item.name} is currently available for ₹${item.price}.`;
  }

  if (normalizedQuestion.includes('price') || normalizedQuestion.includes('cost') || normalizedQuestion.includes('how much')) {
    return `${item.name} costs ₹${item.price}. It is listed under ${item.category}.`;
  }

  if (normalizedQuestion.includes('veg') || normalizedQuestion.includes('vegetarian')) {
    return item.isVeg
      ? `${item.name} is marked vegetarian on our menu.`
      : `${item.name} is not marked vegetarian on our menu.`;
  }

  if (
    normalizedQuestion.includes('ingredient') ||
    normalizedQuestion.includes('contain') ||
    normalizedQuestion.includes('made of') ||
    normalizedQuestion.includes('description')
  ) {
    return item.description.trim()
      ? `${item.name}: ${item.description}`
      : `I don't have an ingredient description for ${item.name}. Please ask a steward about ingredients or allergens before ordering.`;
  }

  return `${item.name} is ${item.isAvailable === false ? 'currently unavailable' : 'available'} for ₹${item.price} in ${item.category}. ${
    item.description.trim() ? item.description : ''
  }`.trim();
}

export function getCafeAssistantReply(
  question: string,
  context: CafeAssistantContext
): string {
  const text = normalize(question);
  const { activeOrder, menuItems, availableBeans, cafeSettings, campaigns = [] } = context;

  if (!text) return 'Type a question and I’ll do my best to help.';

  if (/\b(hi|hello|hey|good morning|good evening)\b/.test(text)) {
    return 'Hello! I can help with your order, menu, payment, rewards, invoice, or cafe details. What would you like to know?';
  }

  if (
    /\b(order|track|tracking|status|ready|prepar\w*|delivery|deliver\w*|eta|time left)\b/.test(text) &&
    !/\b(payment|paid|pay|upi|cash|card|refund|refunded)\b/.test(text)
  ) {
    if (!activeOrder) {
      return 'There isn’t an active order selected. Open an order from My Orders and I can share its current status.';
    }

    const orderNumber = activeOrder.kotNumber || activeOrder.id.slice(0, 4);
    const status = ORDER_STATUS_META[activeOrder.status].label;
    const itemSummary = activeOrder.items
      .filter((item) => item.status !== 'cancelled')
      .map((item) => `${item.quantity} × ${item.name}`)
      .join(', ');
    const serviceMode =
      activeOrder.serviceMode === 'delivery'
        ? 'delivery'
        : activeOrder.serviceMode === 'takeaway'
          ? 'takeaway'
          : 'dine-in';
    const timingNote =
      /\b(eta|time left|how long|when)\b/.test(text)
        ? ' I don’t have a reliable live arrival estimate, so please use the status shown on this page.'
        : '';
    const itemNote = /\b(item|ordered|order contain|what did i order)\b/.test(text) && itemSummary
      ? ` The order includes ${itemSummary}.`
      : '';
    return `Order #${orderNumber} is currently ${status.toLowerCase()} (${serviceMode}).${itemNote}${timingNote}`;
  }

  if (/\b(payment|paid|pay|upi|cash|card|refund|refunded)\b/.test(text)) {
    if (!activeOrder) return 'Select an order from My Orders and I can check its payment details.';

    const paymentStatus = activeOrder.paymentStatus?.replaceAll('_', ' ') || 'not recorded';
    const paymentMode = activeOrder.paymentMode ? ` via ${activeOrder.paymentMode.toUpperCase()}` : '';
    const orderNumber = activeOrder.kotNumber || activeOrder.id.slice(0, 4);
    if (/\b(refund|refunded)\b/.test(text)) {
      return `Order #${orderNumber} payment is marked ${paymentStatus}${paymentMode}. I can’t initiate or confirm a refund here; please contact a steward so they can review the payment.`;
    }
    return `Order #${orderNumber} payment is marked ${paymentStatus}${paymentMode}. The total is ₹${activeOrder.total}.`;
  }

  if (/\b(invoice|receipt|bill|gst|tax)\b/.test(text)) {
    if (!activeOrder) return 'Select an order first, then use View Invoice to see its receipt or Email Bill to send it to your inbox.';
    return `For order #${activeOrder.kotNumber || activeOrder.id.slice(0, 4)}, use View Invoice for the receipt or Email Bill to send it to your inbox. The order total is ₹${activeOrder.total}.`;
  }

  if (/\b(bean|beans|reward|rewards|loyalty|points|redeem)\b/.test(text)) {
    return `You currently have ${availableBeans} reward Beans. The rewards screen shows redemption options; 2 Beans equal ₹1 off a future order, subject to the checkout limit.`;
  }

  if (/\b(offer|offers|discount|coupon|promo|promotion|deal)\b/.test(text)) {
    const activeOffers = campaigns.filter((campaign) => campaign.status === 'active');
    return activeOffers.length > 0
      ? `Current offers: ${activeOffers.map((campaign) => `${campaign.title} (${campaign.code}) — ${campaign.description}`).join(' ')} Open Rewards to review the terms before applying an offer.`
      : 'I don’t see an active offer in the current cafe data. Check Rewards for the latest campaigns.';
  }

  if (/\b(hour|hours|open|close|closing|timing)\b/.test(text)) {
    return cafeSettings?.operatingHours
      ? `Our listed operating hours are ${cafeSettings.operatingHours}.`
      : 'I don’t have the cafe’s current operating hours available. Please contact the cafe directly to confirm.';
  }

  if (/\b(address|location|where are you|directions|phone|call|contact|email)\b/.test(text)) {
    if (!cafeSettings) return 'I don’t have the cafe’s contact details available right now. Please check the cafe profile for the latest information.';
    const details = [
      cafeSettings.address && `Address: ${cafeSettings.address}`,
      cafeSettings.phone && `Phone: ${cafeSettings.phone}`,
      cafeSettings.email && `Email: ${cafeSettings.email}`,
    ].filter(Boolean);
    return details.length > 0
      ? details.join('\n')
      : 'I don’t have the cafe’s contact details available right now. Please check the cafe profile for the latest information.';
  }

  if (/\b(allerg\w*|gluten|dairy|nuts?|peanuts?|sesame|shellfish|soy|eggs?|wheat|ingredient\w*)\b/.test(text)) {
    const item = findCafeAssistantMenuItem(question, menuItems) ?? context.lastMentionedMenuItem;
    if (item?.description.trim()) {
      return `${item.name}: ${item.description} For allergies or cross-contamination concerns, please confirm with a steward before ordering.`;
    }
    return 'For allergy or ingredient questions, please confirm with a steward before ordering. I don’t want to guess about ingredients or cross-contamination.';
  }

  if (/\b(cancel|change|edit|modify|remove item)\b/.test(text)) {
    return 'I can’t change or cancel an order from chat. Please contact a steward as soon as possible; changes may depend on the order’s preparation status.';
  }

  if (/\b(vegetarian|veg options|non veg|non vegetarian)\b/.test(text)) {
    const wantsVegetarian = !/\b(non veg|non vegetarian)\b/.test(text);
    const matches = menuItems.filter(
      (item) => item.isAvailable !== false && item.isVeg === wantsVegetarian
    );
    const options = matches.slice(0, 5).map((item) => `${item.name} (₹${item.price})`);
    return options.length > 0
      ? `${wantsVegetarian ? 'Vegetarian' : 'Non-vegetarian'} options currently listed: ${options.join(', ')}. Please confirm ingredients with a steward if you have dietary restrictions.`
      : `I don’t see any currently available ${wantsVegetarian ? 'vegetarian' : 'non-vegetarian'} options in the menu data.`;
  }

  if (/\b(menu|recommend|recommendation|popular|best seller|bestseller|food|drink|coffee)\b/.test(text)) {
    const item = findCafeAssistantMenuItem(question, menuItems) ?? context.lastMentionedMenuItem;
    if (item) return describeMenuItem(item, question);

    const availableItems = menuItems.filter((menuItem) => menuItem.isAvailable !== false);
    const bestSellers = availableItems.filter((menuItem) => menuItem.isBestSeller);
    const picks = (bestSellers.length > 0 ? bestSellers : availableItems)
      .slice(0, 3)
      .map((menuItem) => `${menuItem.name} (₹${menuItem.price})`);
    return picks.length > 0
      ? `A few available menu options: ${picks.join(', ')}. Tell me a dish name if you’d like its price, description, or availability.`
      : 'I can’t load the menu right now. Please open the Menu screen to see current items.';
  }

  const item =
    findCafeAssistantMenuItem(question, menuItems) ??
    (/\b(it|that|this|its|they|them)\b/.test(text) ? context.lastMentionedMenuItem : undefined);
  if (item) return describeMenuItem(item, question);

  return 'I’m your local cafe assistant. I can answer questions about order status, menu items, availability, prices, payment, invoices, rewards, and cafe details. For anything that needs a staff member—or for allergy or ingredient certainty—please contact a steward.';
}
