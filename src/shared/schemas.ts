import { z } from 'zod';
import { MENU_ITEM_CATEGORIES } from '../types/cafe';

export const serviceModeSchema = z.enum(['dine-in', 'takeaway', 'delivery']);
export const orderStatusSchema = z.enum(['placed', 'preparing', 'ready', 'served']);
export const tableFloorSchema = z.enum([
  'Floor 1 (Main Hall)',
  'Floor 2 (Rooftop)',
  'Outdoor Patio',
]);
export const customerSegmentSchema = z.enum(['vip', 'loyal', 'regular', 'new', 'risk']);

export const cartItemSchema = z.object({
  menuItemId: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive().max(99),
  size: z.string().trim().min(1).max(40).optional(),
  note: z.string().trim().max(200).default(''),
  imageUrl: z.string().trim().max(500).default(''),
  station: z.enum(['Barista', 'Grill', 'Fryer', 'Cold Bar', 'Kitchen']),
  checked: z.boolean().optional(),
});

export const createOrderSchema = z.object({
  outletId: z.string().min(1).default('seth-sawariya-main'),
  serviceMode: serviceModeSchema,
  tableNumber: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().trim().min(1, 'Table number must be at least 1 character').max(16).optional()
    ),
  deliveryAddress: z
    .string()
    .trim()
    .min(5, 'Enter a complete delivery address')
    .max(240, 'Delivery address is too long')
    .optional(),
  deliveryPartner: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().trim().min(1).max(60).optional()
    ),
  items: z
    .array(cartItemSchema)
    .min(1, 'Order must contain at least one item')
    .max(50, 'Cannot exceed 50 items per order'),
  couponCode: z.string().trim().max(32).optional().default(''),
  cookingNote: z.string().trim().max(240).optional().default(''),
  customerName: z.string().trim().max(120).optional(),
  customerEmail: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().trim().email().optional()
    ),
  customerPhone: z.string().trim().max(20).optional(),
  isPosTerminal: z.boolean().optional().default(false),
  paymentMode: z.enum(['upi', 'cash', 'card']).optional().default('upi'),
  customerId: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().trim().max(64).optional()
    ),
  redeemPoints: z.coerce.number().int().nonnegative().max(10000).optional(),
  idempotencyKey: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().trim().max(120).optional()
    ),
});

export const toggleKotItemSchema = z.object({
  menuItemId: z.string().min(1),
});

export const addMenuItemSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().trim().max(500).optional().default(''),
  price: z.coerce.number().positive('Price must be greater than 0').max(100000),
  category: z.enum(MENU_ITEM_CATEGORIES),
  isVeg: z.boolean().default(true),
  isBestSeller: z.boolean().optional().default(false),
  station: z.enum(['Barista', 'Grill', 'Fryer', 'Cold Bar', 'Kitchen']).default('Kitchen'),
  imageUrl: z.string().trim().optional().default(''),
  defaultNote: z.string().trim().optional().default(''),
  recipe: z
    .array(
      z.object({
        ingredientId: z.string().trim().min(1),
        amount: z.coerce.number().positive('Ingredient quantity must be greater than 0'),
        amountUnit: z.enum(['g', 'kg', 'ml', 'L', 'pcs']).optional(),
      })
    )
    .optional()
    .default([]),
});

export const updateMenuItemSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
  description: z.string().trim().max(500).optional(),
  price: z.coerce.number().positive('Price must be greater than 0').max(100000).optional(),
  category: z.enum(MENU_ITEM_CATEGORIES).optional(),
  isVeg: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  station: z.enum(['Barista', 'Grill', 'Fryer', 'Cold Bar', 'Kitchen']).optional(),
  variants: z
    .array(
      z.object({
        size: z.string().trim().min(1).max(40),
        price: z.coerce.number().positive().max(100000),
      })
    )
    .max(12)
    .optional(),
  imageUrl: z.string().trim().optional(),
  defaultNote: z.string().trim().optional(),
  recipe: z
    .array(
      z.object({
        ingredientId: z.string().trim().min(1),
        amount: z.coerce.number().positive('Ingredient quantity must be greater than 0'),
        amountUnit: z.enum(['g', 'kg', 'ml', 'L', 'pcs']).optional(),
      })
    )
    .optional(),
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
  addedQty: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
});

export const stockReceiptSchema = z.object({
  ingredientId: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().optional(),
  supplier: z.string().trim().max(80).optional().default(''),
  batchNumber: z.string().trim().max(80).optional().default(''),
  expiryDate: z.string().trim().max(30).optional(),
  note: z.string().trim().max(240).optional().default(''),
});

export const stockWasteSchema = z.object({
  ingredientId: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  reason: z.string().trim().min(2).max(240),
  batchId: z.string().trim().max(80).optional(),
});

export const stockTransferSchema = z.object({
  ingredientId: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  fromLocation: z.string().trim().min(2).max(80),
  toLocation: z.string().trim().min(2).max(80),
  note: z.string().trim().max(240).optional().default(''),
});

export const stockCountSchema = z.object({
  physicalCounts: z
    .array(
      z.object({
        ingredientId: z.string().trim().min(1),
        physicalQuantity: z.coerce.number().nonnegative(),
        note: z.string().trim().max(240).optional(),
      })
    )
    .min(1),
  note: z.string().trim().max(240).optional().default(''),
});

export const purchaseOrderSchema = z.object({
  supplier: z.string().trim().min(2).max(80),
  note: z.string().trim().max(240).optional().default(''),
  lines: z
    .array(
      z.object({
        ingredientId: z.string().trim().min(1),
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().nonnegative(),
      })
    )
    .min(1),
});

export const receivePurchaseOrderSchema = z.object({
  purchaseOrderId: z.string().trim().min(1),
  receivedLines: z
    .array(
      z.object({
        ingredientId: z.string().trim().min(1),
        quantity: z.coerce.number().positive(),
        batchNumber: z.string().trim().max(80).optional(),
        expiryDate: z.string().trim().max(30).optional(),
      })
    )
    .min(1),
});

export const addTableSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, 'Table code is required')
    .max(10, 'Max 10 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Table code must be alphanumeric')
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
  email: z.string().trim().email('Enter a valid email address').optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val ? val.replace(/\D/g, '').slice(-10) : ''))
    .default(''),
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
  discountPercentage: z.coerce
    .number()
    .int()
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%')
    .default(0),
  minimumOrderAmount: z.coerce.number().int().min(0).default(0),
  validityLabel: z.string().trim().min(2, 'Validity window is required').max(40),
  description: z.string().trim().min(4, 'Offer rule summary is required').max(200),
  targetSegment: z
    .enum(['all', 'vip', 'loyal', 'regular', 'new', 'risk'])
    .optional()
    .default('all'),
});

export const addStaffSchema = z.object({
  name: z.string().trim().min(2, 'Staff name is required').max(80),
  role: z.enum(['Admin', 'Kitchen']),
  shiftLabel: z.string().trim().min(3, 'Shift timing is required').max(40),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, '').slice(-10) : undefined))
    .refine((value) => !value || value.length === 10, 'Enter a valid 10-digit mobile number'),
});

export const cafeSettingsSchema = z.object({
  cafeName: z.string().trim().min(2, 'Cafe name is required').max(80),
  logoUrl: z
    .string()
    .trim()
    .regex(/^\/images\/(?:uploads\/)?[\w-]+\.(?:jpe?g|png|webp)$/i, 'Choose a valid cafe logo')
    .default('/images/tsc-logo.jpg'),
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
  adminPinRequired: z.boolean(),
  kotPrinterConnected: z.boolean(),
  posPrinterConnected: z.boolean(),
});

export const staffPinLoginSchema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'Enter 4-digit staff PIN'),
});

export const orderFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().max(40)).max(10).optional().default([]),
  comment: z.string().trim().max(500).optional().default(''),
  customerPhone: z.string().trim().max(20).optional(),
});

export const customerFeedbackSchema = z.object({
  customerName: z.string().trim().min(2, 'Enter your name').max(80),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  comment: z.string().trim().min(3, 'Please share a little more detail').max(1000),
  dishName: z.string().trim().max(80).optional(),
  diningMode: serviceModeSchema.optional(),
});
export type CustomerFeedbackInput = z.infer<typeof customerFeedbackSchema>;

export const orderRefundSchema = z.object({
  reason: z.string().trim().min(2, 'Enter refund reason').max(200).default('Customer requested refund'),
});

export const cancelOrderItemSchema = z.object({
  menuItemId: z.string().trim().min(1, 'Menu Item ID is required'),
  quantity: z.number().int().positive().optional(),
  reason: z.string().trim().min(2, 'Enter cancellation reason').max(200).default('Item cancelled in kitchen'),
});
export type CancelOrderItemInput = z.infer<typeof cancelOrderItemSchema>;

export const orderPayCounterSchema = z.object({
  paymentMode: z.enum(['cash', 'card', 'upi']).optional().default('cash'),
  note: z.string().trim().max(160).optional(),
});

export const requestReorderSchema = z.object({
  id: z.string().trim().min(1, 'Ingredient ID is required'),
  note: z.string().trim().max(200).optional(),
});

export const brevoConfirmationSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().email('Valid email is required').max(120),
  phone: z.string().trim().max(25).optional().default(''),
  code: z.string().trim().max(10).optional(),
});

export const sendBillEmailSchema = z.object({
  email: z.string().trim().email('Valid email is required').max(120),
  name: z.string().trim().max(80).optional(),
});
export type SendBillEmailInput = z.infer<typeof sendBillEmailSchema>;

export const broadcastEmailSchema = z.object({
  targetSegment: z.enum(['all', 'vip', 'loyal', 'regular', 'new', 'risk']).default('all'),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(150),
  heading: z.string().trim().min(3, 'Heading is required').max(120),
  message: z.string().trim().min(10, 'Message body must be at least 10 characters').max(2000),
  promoCode: z.string().trim().max(30).optional(),
  discountBadge: z.string().trim().max(40).optional(),
  testEmail: z.string().trim().email().optional(),
});
export type BroadcastEmailInput = z.infer<typeof broadcastEmailSchema>;
