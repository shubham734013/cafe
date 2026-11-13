import { z } from 'zod';
import { isValidUpiVpa } from '../payments/upiUri';

export const serviceModeSchema = z.enum(['dine-in', 'takeaway', 'delivery']);
export const paymentModeSchema = z.enum(['upi', 'cash', 'card']);
export const upiAppIdSchema = z.enum(['any', 'paytm', 'gpay', 'phonepe', 'amazonpay']);
export const cardNetworkSchema = z.enum(['Visa', 'Mastercard', 'RuPay', 'Amex']);
export const orderStatusSchema = z.enum(['placed', 'preparing', 'ready', 'served']);
export const tableFloorSchema = z.enum([
  'Floor 1 (Main Hall)',
  'Floor 2 (Rooftop)',
  'Outdoor Patio',
]);
export const customerSegmentSchema = z.enum(['vip', 'loyal', 'regular', 'new', 'risk']);

export const cartItemSchema = z.object({
  menuItemId: z.string().min(1),
  name: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive().max(99),
  note: z.string().default(''),
  imageUrl: z.string().default(''),
  station: z.enum(['Barista', 'Grill', 'Fryer', 'Cold Bar', 'Kitchen']),
  checked: z.boolean().optional(),
});

export const cardPaymentInputSchema = z.object({
  method: z.enum(['edc_table', 'online_card']).default('edc_table'),
  network: cardNetworkSchema.optional(),
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter only last 4 digits of card')
    .optional()
    .or(z.literal('')),
  holderName: z.string().trim().max(60).optional(),
  authCode: z.string().trim().max(24).optional(),
});

export const createOrderSchema = z.object({
  outletId: z.string().min(1).default('seth-sawariya-main'),
  serviceMode: serviceModeSchema,
  tableNumber: z.string().trim().min(1).max(16).optional(),
  deliveryPartner: z.string().trim().min(1).max(60).optional(),
  items: z.array(cartItemSchema).min(1, 'Order must contain at least one item'),
  couponCode: z.string().trim().max(32).optional().default(''),
  paymentMode: paymentModeSchema,
  preferredUpiApp: upiAppIdSchema.optional(),
  cardDetails: cardPaymentInputSchema.optional(),
  cookingNote: z.string().trim().max(240).optional().default(''),
  isPosTerminal: z.boolean().optional().default(false),
  customerId: z.string().trim().max(64).optional(),
  idempotencyKey: z.string().trim().max(120).optional(),
});

export const settleOrderPaymentSchema = z.object({
  action: z.enum(['settle', 'fail', 'refund']),
  network: cardNetworkSchema.optional(),
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter exactly 4 card digits')
    .optional()
    .or(z.literal('')),
  authCode: z.string().trim().max(24).optional(),
  note: z.string().trim().max(200).optional(),
});

export const toggleKotItemSchema = z.object({
  menuItemId: z.string().min(1),
});

export const addIngredientSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(80),
  quantity: z.coerce.number().positive('Opening stock must be greater than 0'),
  unit: z.enum(['kg', 'g', 'L', 'ml', 'pcs']),
  minThreshold: z.coerce.number().min(0, 'Threshold cannot be negative'),
  supplier: z.string().trim().min(2, 'Enter supplier name').max(80),
  unitCost: z.coerce.number().min(0).optional().default(180),
});

export const restockIngredientSchema = z.object({
  addedQty: z.coerce.number().positive().optional(),
});

export const addTableSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'Table code is required')
    .max(10, 'Max 10 characters')
    .transform((v) => v.toUpperCase()),
  seats: z.coerce
    .number()
    .int()
    .min(1, 'Minimum 1 seat')
    .max(16, 'Maximum 16 seats'),
  zone: z.string().trim().min(2, 'Enter seating zone').max(60),
  floor: tableFloorSchema,
});

export const tableTransferMergeSchema = z.object({
  sourceTableId: z.string().trim().min(1),
  targetTableId: z.string().trim().min(1),
});

export const reserveTableSchema = z.object({
  guestName: z.string().trim().min(2, 'Enter guest name').max(80),
  guestPhone: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, '').slice(-10))
    .refine((v) => v.length === 0 || /^\d{10}$/.test(v), 'Enter a valid 10-digit mobile number')
    .optional(),
  partySize: z.coerce.number().int().min(1, 'Minimum 1 guest').max(16, 'Maximum 16 guests'),
  timeSlot: z.string().trim().min(2, 'Select a reservation time').max(40),
  tableId: z.string().trim().max(10).optional(),
});

export const addCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required').max(80),
  phone: z
    .string()
    .trim()
    .transform((val) => val.replace(/\D/g, '').slice(-10))
    .refine((val) => /^\d{10}$/.test(val), 'Enter a valid 10-digit Indian mobile number'),
  segment: customerSegmentSchema,
  favorites: z.string().trim().min(2, 'Enter favorite item').max(120),
  note: z.string().trim().max(180).optional(),
  dpdpConsent: z.boolean().optional().default(true),
});

export const addLoyaltyRuleSchema = z.object({
  title: z.string().trim().min(2, 'Rule name is required').max(80),
  headline: z.string().trim().min(2, 'Reward formula is required').max(60),
  badge: z.string().trim().min(1, 'Badge text is required').max(24),
  description: z.string().trim().min(4, 'Description is required').max(200),
});

export const createCampaignSchema = z.object({
  title: z.string().trim().min(2, 'Campaign title is required').max(80),
  code: z
    .string()
    .trim()
    .min(3, 'Promo code must be at least 3 characters')
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - or _ only')
    .transform((v) => v.toUpperCase()),
  validityLabel: z.string().trim().min(2, 'Validity window is required').max(40),
  description: z.string().trim().min(4, 'Offer rule summary is required').max(200),
});

export const addStaffSchema = z.object({
  name: z.string().trim().min(2, 'Staff name is required').max(80),
  role: z.enum(['Barista', 'Cashier', 'Kitchen Line', 'Store Manager', 'Server / Steward']),
  shiftLabel: z.string().trim().min(3, 'Shift timing is required').max(40),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(-10) : undefined)),
});

export const cafeSettingsSchema = z.object({
  cafeName: z.string().trim().min(2, 'Cafe name is required').max(80),
  subCategory: z.string().trim().min(2, 'Sub-category is required').max(100),
  address: z.string().trim().min(5, 'Store address is required').max(240),
  phone: z.string().trim().min(7, 'Valid contact number is required').max(24),
  email: z.string().trim().email('Enter a valid email address'),
  operatingHours: z.string().trim().min(3, 'Operating hours are required').max(60),
  gstin: z
    .string()
    .trim()
    .min(10, 'Enter valid GSTIN')
    .max(20)
    .transform((v) => v.toUpperCase()),
  serviceChargePct: z.coerce.number().min(0).max(20),
  qrOrderingEnabled: z.boolean(),
  managerPinRequired: z.boolean(),
  kotPrinterConnected: z.boolean(),
  posPrinterConnected: z.boolean(),
  upiVpa: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default('')
    .refine(
      (v) => v === '' || isValidUpiVpa(v),
      'Enter a valid UPI ID (e.g., yourname@okicici or shop@paytm)'
    ),
  upiPayeeName: z.string().trim().max(60).optional().default(''),
});

export const staffPinLoginSchema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter 4-digit staff PIN'),
});
