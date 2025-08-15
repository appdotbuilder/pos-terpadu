import { z } from 'zod';

// Enums
export const userRoleSchema = z.enum(['OWNER', 'MANAGER', 'CASHIER', 'WAREHOUSE_STAFF']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const businessTypeSchema = z.enum(['FOOD_BEVERAGE', 'RETAIL', 'ONLINE_SHOP', 'SERVICE']);
export type BusinessType = z.infer<typeof businessTypeSchema>;

export const transactionStatusSchema = z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'HOLD']);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const paymentMethodSchema = z.enum(['CASH', 'CARD', 'QRIS', 'BANK_TRANSFER', 'E_WALLET']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const discountTypeSchema = z.enum(['PERCENTAGE', 'FIXED_AMOUNT']);
export type DiscountType = z.infer<typeof discountTypeSchema>;

export const stockMovementTypeSchema = z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT']);
export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

export const membershipTypeSchema = z.enum(['BASIC', 'SILVER', 'GOLD', 'PLATINUM']);
export type MembershipType = z.infer<typeof membershipTypeSchema>;

// Branch schema
export const branchSchema = z.object({
  id: z.number(),
  name: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Branch = z.infer<typeof branchSchema>;

export const createBranchInputSchema = z.object({
  name: z.string().min(1),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().email().nullable()
});

export type CreateBranchInput = z.infer<typeof createBranchInputSchema>;

// User schema
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  full_name: z.string(),
  role: userRoleSchema,
  branch_id: z.number().nullable(),
  is_active: z.boolean(),
  two_factor_enabled: z.boolean(),
  last_login: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(1),
  role: userRoleSchema,
  branch_id: z.number().nullable()
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

// Product Category schema
export const productCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  parent_id: z.number().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type ProductCategory = z.infer<typeof productCategorySchema>;

export const createProductCategoryInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  parent_id: z.number().nullable()
});

export type CreateProductCategoryInput = z.infer<typeof createProductCategoryInputSchema>;

// Product schema
export const productSchema = z.object({
  id: z.number(),
  sku: z.string(),
  barcode: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  category_id: z.number().nullable(),
  base_price: z.number(),
  selling_price: z.number(),
  unit: z.string(),
  min_stock: z.number().int(),
  is_active: z.boolean(),
  has_variants: z.boolean(),
  is_raw_material: z.boolean(),
  image_url: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Product = z.infer<typeof productSchema>;

export const createProductInputSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().nullable(),
  name: z.string().min(1),
  description: z.string().nullable(),
  category_id: z.number().nullable(),
  base_price: z.number().positive(),
  selling_price: z.number().positive(),
  unit: z.string().min(1),
  min_stock: z.number().int().nonnegative(),
  has_variants: z.boolean().default(false),
  is_raw_material: z.boolean().default(false),
  image_url: z.string().nullable()
});

export type CreateProductInput = z.infer<typeof createProductInputSchema>;

// Product Variant schema
export const productVariantSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  variant_name: z.string(),
  sku: z.string(),
  barcode: z.string().nullable(),
  price_adjustment: z.number(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type ProductVariant = z.infer<typeof productVariantSchema>;

// Stock schema
export const stockSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  branch_id: z.number(),
  quantity: z.number().int(),
  reserved_quantity: z.number().int(),
  last_updated: z.coerce.date()
});

export type Stock = z.infer<typeof stockSchema>;

// Stock Movement schema
export const stockMovementSchema = z.object({
  id: z.number(),
  product_id: z.number(),
  branch_id: z.number(),
  movement_type: stockMovementTypeSchema,
  quantity: z.number().int(),
  reference_number: z.string().nullable(),
  notes: z.string().nullable(),
  user_id: z.number(),
  created_at: z.coerce.date()
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

// Customer schema
export const customerSchema = z.object({
  id: z.number(),
  customer_code: z.string(),
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  membership_type: membershipTypeSchema,
  loyalty_points: z.number().int(),
  total_spent: z.number(),
  last_visit: z.coerce.date().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Customer = z.infer<typeof customerSchema>;

export const createCustomerInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  membership_type: membershipTypeSchema.default('BASIC')
});

export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

// Transaction schema
export const transactionSchema = z.object({
  id: z.number(),
  transaction_number: z.string(),
  branch_id: z.number(),
  customer_id: z.number().nullable(),
  user_id: z.number(),
  subtotal: z.number(),
  discount_amount: z.number(),
  tax_amount: z.number(),
  total_amount: z.number(),
  status: transactionStatusSchema,
  notes: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Transaction = z.infer<typeof transactionSchema>;

// Transaction Item schema
export const transactionItemSchema = z.object({
  id: z.number(),
  transaction_id: z.number(),
  product_id: z.number(),
  product_variant_id: z.number().nullable(),
  quantity: z.number().int(),
  unit_price: z.number(),
  discount_amount: z.number(),
  total_amount: z.number(),
  notes: z.string().nullable()
});

export type TransactionItem = z.infer<typeof transactionItemSchema>;

// Transaction Payment schema
export const transactionPaymentSchema = z.object({
  id: z.number(),
  transaction_id: z.number(),
  payment_method: paymentMethodSchema,
  amount: z.number(),
  reference_number: z.string().nullable(),
  created_at: z.coerce.date()
});

export type TransactionPayment = z.infer<typeof transactionPaymentSchema>;

// Addon schema
export const addonSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Addon = z.infer<typeof addonSchema>;

// Transaction Item Addon schema
export const transactionItemAddonSchema = z.object({
  id: z.number(),
  transaction_item_id: z.number(),
  addon_id: z.number(),
  quantity: z.number().int(),
  unit_price: z.number(),
  total_price: z.number()
});

export type TransactionItemAddon = z.infer<typeof transactionItemAddonSchema>;

// User Activity Log schema
export const userActivityLogSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.number().nullable(),
  details: z.string().nullable(),
  ip_address: z.string().nullable(),
  created_at: z.coerce.date()
});

export type UserActivityLog = z.infer<typeof userActivityLogSchema>;

// Shift schema
export const shiftSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  branch_id: z.number(),
  start_time: z.coerce.date(),
  end_time: z.coerce.date().nullable(),
  opening_cash: z.number(),
  closing_cash: z.number().nullable(),
  total_sales: z.number(),
  notes: z.string().nullable()
});

export type Shift = z.infer<typeof shiftSchema>;

// Create Transaction Input schema
export const createTransactionInputSchema = z.object({
  customer_id: z.number().nullable(),
  items: z.array(z.object({
    product_id: z.number(),
    product_variant_id: z.number().nullable(),
    quantity: z.number().int().positive(),
    unit_price: z.number().positive(),
    discount_amount: z.number().nonnegative().default(0),
    notes: z.string().nullable(),
    addons: z.array(z.object({
      addon_id: z.number(),
      quantity: z.number().int().positive()
    })).default([])
  })),
  discount_amount: z.number().nonnegative().default(0),
  tax_amount: z.number().nonnegative().default(0),
  payments: z.array(z.object({
    payment_method: paymentMethodSchema,
    amount: z.number().positive(),
    reference_number: z.string().nullable()
  })),
  notes: z.string().nullable()
});

export type CreateTransactionInput = z.infer<typeof createTransactionInputSchema>;

// Report filter schema
export const reportFilterSchema = z.object({
  branch_id: z.number().nullable(),
  start_date: z.coerce.date(),
  end_date: z.coerce.date(),
  category_id: z.number().nullable(),
  user_id: z.number().nullable()
});

export type ReportFilter = z.infer<typeof reportFilterSchema>;

// Sales report schema
export const salesReportSchema = z.object({
  total_sales: z.number(),
  total_transactions: z.number().int(),
  average_transaction_value: z.number(),
  top_products: z.array(z.object({
    product_id: z.number(),
    product_name: z.string(),
    quantity_sold: z.number().int(),
    total_revenue: z.number()
  })),
  daily_sales: z.array(z.object({
    date: z.coerce.date(),
    total_sales: z.number(),
    transaction_count: z.number().int()
  }))
});

export type SalesReport = z.infer<typeof salesReportSchema>;

// Inventory report schema
export const inventoryReportSchema = z.object({
  total_products: z.number().int(),
  low_stock_items: z.array(z.object({
    product_id: z.number(),
    product_name: z.string(),
    current_stock: z.number().int(),
    min_stock: z.number().int(),
    branch_name: z.string()
  })),
  stock_value: z.number(),
  stock_movements: z.array(z.object({
    product_name: z.string(),
    movement_type: stockMovementTypeSchema,
    quantity: z.number().int(),
    date: z.coerce.date()
  }))
});

export type InventoryReport = z.infer<typeof inventoryReportSchema>;