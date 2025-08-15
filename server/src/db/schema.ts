import { 
  serial, 
  text, 
  pgTable, 
  timestamp, 
  numeric, 
  integer, 
  boolean, 
  pgEnum,
  varchar,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['OWNER', 'MANAGER', 'CASHIER', 'WAREHOUSE_STAFF']);
export const businessTypeEnum = pgEnum('business_type', ['FOOD_BEVERAGE', 'RETAIL', 'ONLINE_SHOP', 'SERVICE']);
export const transactionStatusEnum = pgEnum('transaction_status', ['PENDING', 'COMPLETED', 'CANCELLED', 'HOLD']);
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'CARD', 'QRIS', 'BANK_TRANSFER', 'E_WALLET']);
export const discountTypeEnum = pgEnum('discount_type', ['PERCENTAGE', 'FIXED_AMOUNT']);
export const stockMovementTypeEnum = pgEnum('stock_movement_type', ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT']);
export const membershipTypeEnum = pgEnum('membership_type', ['BASIC', 'SILVER', 'GOLD', 'PLATINUM']);

// Branches table
export const branchesTable = pgTable('branches', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  password_hash: text('password_hash').notNull(),
  full_name: text('full_name').notNull(),
  role: userRoleEnum('role').notNull(),
  branch_id: integer('branch_id').references(() => branchesTable.id),
  is_active: boolean('is_active').default(true).notNull(),
  two_factor_enabled: boolean('two_factor_enabled').default(false).notNull(),
  last_login: timestamp('last_login'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  branchIdx: index('users_branch_idx').on(table.branch_id)
}));

// Product Categories table
export const productCategoriesTable = pgTable('product_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  parent_id: integer('parent_id'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  parentIdx: index('categories_parent_idx').on(table.parent_id)
}));

// Product Category Relations
export const productCategoryRelations = relations(productCategoriesTable, ({ one, many }) => ({
  parent: one(productCategoriesTable, {
    fields: [productCategoriesTable.parent_id],
    references: [productCategoriesTable.id],
    relationName: 'CategoryParent'
  }),
  children: many(productCategoriesTable, {
    relationName: 'CategoryParent'
  }),
  products: many(productsTable)
}));

// Products table
export const productsTable = pgTable('products', {
  id: serial('id').primaryKey(),
  sku: varchar('sku', { length: 100 }).unique().notNull(),
  barcode: varchar('barcode', { length: 100 }),
  name: text('name').notNull(),
  description: text('description'),
  category_id: integer('category_id').references(() => productCategoriesTable.id),
  base_price: numeric('base_price', { precision: 10, scale: 2 }).notNull(),
  selling_price: numeric('selling_price', { precision: 10, scale: 2 }).notNull(),
  unit: varchar('unit', { length: 50 }).notNull(),
  min_stock: integer('min_stock').default(0).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  has_variants: boolean('has_variants').default(false).notNull(),
  is_raw_material: boolean('is_raw_material').default(false).notNull(),
  image_url: text('image_url'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  skuIdx: uniqueIndex('products_sku_idx').on(table.sku),
  barcodeIdx: index('products_barcode_idx').on(table.barcode),
  categoryIdx: index('products_category_idx').on(table.category_id)
}));

// Product Variants table
export const productVariantsTable = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  product_id: integer('product_id').references(() => productsTable.id).notNull(),
  variant_name: text('variant_name').notNull(),
  sku: varchar('sku', { length: 100 }).unique().notNull(),
  barcode: varchar('barcode', { length: 100 }),
  price_adjustment: numeric('price_adjustment', { precision: 10, scale: 2 }).default('0').notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  productIdx: index('variants_product_idx').on(table.product_id),
  skuIdx: uniqueIndex('variants_sku_idx').on(table.sku)
}));

// Stock table
export const stockTable = pgTable('stock', {
  id: serial('id').primaryKey(),
  product_id: integer('product_id').references(() => productsTable.id).notNull(),
  branch_id: integer('branch_id').references(() => branchesTable.id).notNull(),
  quantity: integer('quantity').default(0).notNull(),
  reserved_quantity: integer('reserved_quantity').default(0).notNull(),
  last_updated: timestamp('last_updated').defaultNow().notNull()
}, (table) => ({
  productBranchIdx: uniqueIndex('stock_product_branch_idx').on(table.product_id, table.branch_id),
  branchIdx: index('stock_branch_idx').on(table.branch_id)
}));

// Stock Movements table
export const stockMovementsTable = pgTable('stock_movements', {
  id: serial('id').primaryKey(),
  product_id: integer('product_id').references(() => productsTable.id).notNull(),
  branch_id: integer('branch_id').references(() => branchesTable.id).notNull(),
  movement_type: stockMovementTypeEnum('movement_type').notNull(),
  quantity: integer('quantity').notNull(),
  reference_number: varchar('reference_number', { length: 100 }),
  notes: text('notes'),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  productIdx: index('movements_product_idx').on(table.product_id),
  branchIdx: index('movements_branch_idx').on(table.branch_id),
  userIdx: index('movements_user_idx').on(table.user_id),
  createdAtIdx: index('movements_created_at_idx').on(table.created_at)
}));

// Customers table
export const customersTable = pgTable('customers', {
  id: serial('id').primaryKey(),
  customer_code: varchar('customer_code', { length: 50 }).unique().notNull(),
  name: text('name').notNull(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  address: text('address'),
  membership_type: membershipTypeEnum('membership_type').default('BASIC').notNull(),
  loyalty_points: integer('loyalty_points').default(0).notNull(),
  total_spent: numeric('total_spent', { precision: 12, scale: 2 }).default('0').notNull(),
  last_visit: timestamp('last_visit'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  customerCodeIdx: uniqueIndex('customers_code_idx').on(table.customer_code),
  emailIdx: index('customers_email_idx').on(table.email),
  phoneIdx: index('customers_phone_idx').on(table.phone)
}));

// Transactions table
export const transactionsTable = pgTable('transactions', {
  id: serial('id').primaryKey(),
  transaction_number: varchar('transaction_number', { length: 100 }).unique().notNull(),
  branch_id: integer('branch_id').references(() => branchesTable.id).notNull(),
  customer_id: integer('customer_id').references(() => customersTable.id),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  discount_amount: numeric('discount_amount', { precision: 10, scale: 2 }).default('0').notNull(),
  tax_amount: numeric('tax_amount', { precision: 10, scale: 2 }).default('0').notNull(),
  total_amount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  status: transactionStatusEnum('status').default('PENDING').notNull(),
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
}, (table) => ({
  transactionNumberIdx: uniqueIndex('transactions_number_idx').on(table.transaction_number),
  branchIdx: index('transactions_branch_idx').on(table.branch_id),
  customerIdx: index('transactions_customer_idx').on(table.customer_id),
  userIdx: index('transactions_user_idx').on(table.user_id),
  createdAtIdx: index('transactions_created_at_idx').on(table.created_at),
  statusIdx: index('transactions_status_idx').on(table.status)
}));

// Transaction Items table
export const transactionItemsTable = pgTable('transaction_items', {
  id: serial('id').primaryKey(),
  transaction_id: integer('transaction_id').references(() => transactionsTable.id).notNull(),
  product_id: integer('product_id').references(() => productsTable.id).notNull(),
  product_variant_id: integer('product_variant_id').references(() => productVariantsTable.id),
  quantity: integer('quantity').notNull(),
  unit_price: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  discount_amount: numeric('discount_amount', { precision: 10, scale: 2 }).default('0').notNull(),
  total_amount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes')
}, (table) => ({
  transactionIdx: index('transaction_items_transaction_idx').on(table.transaction_id),
  productIdx: index('transaction_items_product_idx').on(table.product_id)
}));

// Transaction Payments table
export const transactionPaymentsTable = pgTable('transaction_payments', {
  id: serial('id').primaryKey(),
  transaction_id: integer('transaction_id').references(() => transactionsTable.id).notNull(),
  payment_method: paymentMethodEnum('payment_method').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  reference_number: varchar('reference_number', { length: 100 }),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  transactionIdx: index('payments_transaction_idx').on(table.transaction_id)
}));

// Addons table
export const addonsTable = pgTable('addons', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 8, scale: 2 }).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Transaction Item Addons table
export const transactionItemAddonsTable = pgTable('transaction_item_addons', {
  id: serial('id').primaryKey(),
  transaction_item_id: integer('transaction_item_id').references(() => transactionItemsTable.id).notNull(),
  addon_id: integer('addon_id').references(() => addonsTable.id).notNull(),
  quantity: integer('quantity').notNull(),
  unit_price: numeric('unit_price', { precision: 8, scale: 2 }).notNull(),
  total_price: numeric('total_price', { precision: 8, scale: 2 }).notNull()
}, (table) => ({
  transactionItemIdx: index('item_addons_transaction_item_idx').on(table.transaction_item_id)
}));

// User Activity Logs table
export const userActivityLogsTable = pgTable('user_activity_logs', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  action: varchar('action', { length: 100 }).notNull(),
  entity_type: varchar('entity_type', { length: 50 }).notNull(),
  entity_id: integer('entity_id'),
  details: text('details'),
  ip_address: varchar('ip_address', { length: 45 }),
  created_at: timestamp('created_at').defaultNow().notNull()
}, (table) => ({
  userIdx: index('activity_logs_user_idx').on(table.user_id),
  createdAtIdx: index('activity_logs_created_at_idx').on(table.created_at)
}));

// Shifts table
export const shiftsTable = pgTable('shifts', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').references(() => usersTable.id).notNull(),
  branch_id: integer('branch_id').references(() => branchesTable.id).notNull(),
  start_time: timestamp('start_time').notNull(),
  end_time: timestamp('end_time'),
  opening_cash: numeric('opening_cash', { precision: 10, scale: 2 }).notNull(),
  closing_cash: numeric('closing_cash', { precision: 10, scale: 2 }),
  total_sales: numeric('total_sales', { precision: 12, scale: 2 }).default('0').notNull(),
  notes: text('notes')
}, (table) => ({
  userIdx: index('shifts_user_idx').on(table.user_id),
  branchIdx: index('shifts_branch_idx').on(table.branch_id),
  startTimeIdx: index('shifts_start_time_idx').on(table.start_time)
}));

// Relations
export const branchRelations = relations(branchesTable, ({ many }) => ({
  users: many(usersTable),
  stock: many(stockTable),
  transactions: many(transactionsTable),
  stockMovements: many(stockMovementsTable),
  shifts: many(shiftsTable)
}));

export const userRelations = relations(usersTable, ({ one, many }) => ({
  branch: one(branchesTable, {
    fields: [usersTable.branch_id],
    references: [branchesTable.id]
  }),
  transactions: many(transactionsTable),
  stockMovements: many(stockMovementsTable),
  activityLogs: many(userActivityLogsTable),
  shifts: many(shiftsTable)
}));



export const productRelations = relations(productsTable, ({ one, many }) => ({
  category: one(productCategoriesTable, {
    fields: [productsTable.category_id],
    references: [productCategoriesTable.id]
  }),
  variants: many(productVariantsTable),
  stock: many(stockTable),
  transactionItems: many(transactionItemsTable),
  stockMovements: many(stockMovementsTable)
}));

export const productVariantRelations = relations(productVariantsTable, ({ one, many }) => ({
  product: one(productsTable, {
    fields: [productVariantsTable.product_id],
    references: [productsTable.id]
  }),
  transactionItems: many(transactionItemsTable)
}));

export const stockRelations = relations(stockTable, ({ one }) => ({
  product: one(productsTable, {
    fields: [stockTable.product_id],
    references: [productsTable.id]
  }),
  branch: one(branchesTable, {
    fields: [stockTable.branch_id],
    references: [branchesTable.id]
  })
}));

export const customerRelations = relations(customersTable, ({ many }) => ({
  transactions: many(transactionsTable)
}));

export const transactionRelations = relations(transactionsTable, ({ one, many }) => ({
  branch: one(branchesTable, {
    fields: [transactionsTable.branch_id],
    references: [branchesTable.id]
  }),
  customer: one(customersTable, {
    fields: [transactionsTable.customer_id],
    references: [customersTable.id]
  }),
  user: one(usersTable, {
    fields: [transactionsTable.user_id],
    references: [usersTable.id]
  }),
  items: many(transactionItemsTable),
  payments: many(transactionPaymentsTable)
}));

export const transactionItemRelations = relations(transactionItemsTable, ({ one, many }) => ({
  transaction: one(transactionsTable, {
    fields: [transactionItemsTable.transaction_id],
    references: [transactionsTable.id]
  }),
  product: one(productsTable, {
    fields: [transactionItemsTable.product_id],
    references: [productsTable.id]
  }),
  productVariant: one(productVariantsTable, {
    fields: [transactionItemsTable.product_variant_id],
    references: [productVariantsTable.id]
  }),
  addons: many(transactionItemAddonsTable)
}));

export const addonRelations = relations(addonsTable, ({ many }) => ({
  transactionItemAddons: many(transactionItemAddonsTable)
}));

export const transactionItemAddonRelations = relations(transactionItemAddonsTable, ({ one }) => ({
  transactionItem: one(transactionItemsTable, {
    fields: [transactionItemAddonsTable.transaction_item_id],
    references: [transactionItemsTable.id]
  }),
  addon: one(addonsTable, {
    fields: [transactionItemAddonsTable.addon_id],
    references: [addonsTable.id]
  })
}));

// Export all tables
export const tables = {
  branches: branchesTable,
  users: usersTable,
  productCategories: productCategoriesTable,
  products: productsTable,
  productVariants: productVariantsTable,
  stock: stockTable,
  stockMovements: stockMovementsTable,
  customers: customersTable,
  transactions: transactionsTable,
  transactionItems: transactionItemsTable,
  transactionPayments: transactionPaymentsTable,
  addons: addonsTable,
  transactionItemAddons: transactionItemAddonsTable,
  userActivityLogs: userActivityLogsTable,
  shifts: shiftsTable
};