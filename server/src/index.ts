import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  createUserInputSchema,
  createBranchInputSchema,
  createProductInputSchema,
  createProductCategoryInputSchema,
  createCustomerInputSchema,
  createTransactionInputSchema,
  reportFilterSchema,
  userRoleSchema
} from './schema';

// Import handlers
import { createUser, authenticateUser, getUsers, updateUserRole, deactivateUser } from './handlers/auth';
import { createBranch, getBranches, getBranchById, updateBranch, deactivateBranch } from './handlers/branches';
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  searchProducts,
  getLowStockProducts,
  createProductCategory,
  getProductCategories,
  importProductsFromCSV,
  exportProductsToCSV
} from './handlers/products';
import {
  getStockByBranch,
  updateStock,
  transferStock,
  getStockMovements,
  adjustStock,
  reserveStock,
  releaseReservedStock,
  getStockAlerts,
  bulkStockUpdate
} from './handlers/inventory';
import {
  createTransaction,
  completeTransaction,
  holdTransaction,
  cancelTransaction,
  getTransactions,
  getTransactionById,
  splitBill,
  applyDiscount,
  generateReceipt,
  sendReceiptWhatsApp,
  sendReceiptEmail
} from './handlers/transactions';
import {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  addLoyaltyPoints,
  redeemLoyaltyPoints,
  getCustomerTransactionHistory,
  upgradeMembership,
  getTopCustomers,
  searchCustomerByPhone
} from './handlers/customers';
import {
  getSalesReport,
  getInventoryReport,
  getProfitLossReport,
  getCashFlowReport,
  getEmployeePerformanceReport,
  getTaxReport,
  getCustomerAnalytics,
  getProductPerformanceReport,
  exportReportToExcel,
  getDashboardMetrics
} from './handlers/reports';
import {
  startShift,
  endShift,
  getCurrentShift,
  getShiftHistory,
  getShiftSummary,
  updateShiftNotes
} from './handlers/shifts';
import { createAddon, getAddons, updateAddon, deactivateAddon } from './handlers/addons';
import { logUserActivity, getUserActivityLogs, getSystemAuditLogs, getSecurityLogs } from './handlers/activity-logs';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    createUser: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    
    authenticate: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string() }))
      .mutation(({ input }) => authenticateUser(input.email, input.password)),
    
    getUsers: publicProcedure.query(() => getUsers()),
    
    updateUserRole: publicProcedure
      .input(z.object({ userId: z.number(), role: userRoleSchema }))
      .mutation(({ input }) => updateUserRole(input.userId, input.role)),
    
    deactivateUser: publicProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(({ input }) => deactivateUser(input.userId))
  }),

  // Branch management routes
  branches: router({
    create: publicProcedure
      .input(createBranchInputSchema)
      .mutation(({ input }) => createBranch(input)),
    
    getAll: publicProcedure.query(() => getBranches()),
    
    getById: publicProcedure
      .input(z.object({ branchId: z.number() }))
      .query(({ input }) => getBranchById(input.branchId)),
    
    update: publicProcedure
      .input(z.object({ branchId: z.number(), data: createBranchInputSchema.partial() }))
      .mutation(({ input }) => updateBranch(input.branchId, input.data)),
    
    deactivate: publicProcedure
      .input(z.object({ branchId: z.number() }))
      .mutation(({ input }) => deactivateBranch(input.branchId))
  }),

  // Product management routes
  products: router({
    create: publicProcedure
      .input(createProductInputSchema)
      .mutation(({ input }) => createProduct(input)),
    
    getAll: publicProcedure
      .input(z.object({ categoryId: z.number().optional(), isActive: z.boolean().optional() }).optional())
      .query(({ input }) => getProducts(input?.categoryId, input?.isActive)),
    
    getById: publicProcedure
      .input(z.object({ productId: z.number() }))
      .query(({ input }) => getProductById(input.productId)),
    
    update: publicProcedure
      .input(z.object({ productId: z.number(), data: createProductInputSchema.partial() }))
      .mutation(({ input }) => updateProduct(input.productId, input.data)),
    
    search: publicProcedure
      .input(z.object({ query: z.string(), branchId: z.number().optional() }))
      .query(({ input }) => searchProducts(input.query, input.branchId)),
    
    getLowStock: publicProcedure
      .input(z.object({ branchId: z.number().optional() }).optional())
      .query(({ input }) => getLowStockProducts(input?.branchId)),
    
    importCSV: publicProcedure
      .input(z.object({ csvData: z.string(), branchId: z.number() }))
      .mutation(({ input }) => importProductsFromCSV(input.csvData, input.branchId)),
    
    exportCSV: publicProcedure
      .input(z.object({ branchId: z.number().optional() }).optional())
      .query(({ input }) => exportProductsToCSV(input?.branchId))
  }),

  // Product categories routes
  categories: router({
    create: publicProcedure
      .input(createProductCategoryInputSchema)
      .mutation(({ input }) => createProductCategory(input)),
    
    getAll: publicProcedure.query(() => getProductCategories())
  }),

  // Inventory management routes
  inventory: router({
    getStock: publicProcedure
      .input(z.object({ branchId: z.number(), productId: z.number().optional() }))
      .query(({ input }) => getStockByBranch(input.branchId, input.productId)),
    
    updateStock: publicProcedure
      .input(z.object({
        productId: z.number(),
        branchId: z.number(),
        quantity: z.number(),
        movementType: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT']),
        userId: z.number(),
        notes: z.string().optional()
      }))
      .mutation(({ input }) => updateStock(input.productId, input.branchId, input.quantity, input.movementType, input.userId, input.notes)),
    
    transfer: publicProcedure
      .input(z.object({
        productId: z.number(),
        fromBranchId: z.number(),
        toBranchId: z.number(),
        quantity: z.number(),
        userId: z.number()
      }))
      .mutation(({ input }) => transferStock(input.productId, input.fromBranchId, input.toBranchId, input.quantity, input.userId)),
    
    getMovements: publicProcedure
      .input(z.object({
        branchId: z.number(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional()
      }))
      .query(({ input }) => getStockMovements(input.branchId, input.startDate, input.endDate)),
    
    adjust: publicProcedure
      .input(z.object({
        productId: z.number(),
        branchId: z.number(),
        newQuantity: z.number(),
        userId: z.number(),
        reason: z.string()
      }))
      .mutation(({ input }) => adjustStock(input.productId, input.branchId, input.newQuantity, input.userId, input.reason)),
    
    getAlerts: publicProcedure
      .input(z.object({ branchId: z.number().optional() }).optional())
      .query(({ input }) => getStockAlerts(input?.branchId))
  }),

  // Transaction routes
  transactions: router({
    create: publicProcedure
      .input(createTransactionInputSchema.extend({
        userId: z.number(),
        branchId: z.number()
      }))
      .mutation(({ input }) => createTransaction(input, input.userId, input.branchId)),
    
    complete: publicProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(({ input }) => completeTransaction(input.transactionId)),
    
    hold: publicProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(({ input }) => holdTransaction(input.transactionId)),
    
    cancel: publicProcedure
      .input(z.object({ transactionId: z.number(), reason: z.string() }))
      .mutation(({ input }) => cancelTransaction(input.transactionId, input.reason)),
    
    getAll: publicProcedure
      .input(z.object({
        branchId: z.number(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional()
      }))
      .query(({ input }) => getTransactions(input.branchId, input.startDate, input.endDate)),
    
    getById: publicProcedure
      .input(z.object({ transactionId: z.number() }))
      .query(({ input }) => getTransactionById(input.transactionId)),
    
    splitBill: publicProcedure
      .input(z.object({
        transactionId: z.number(),
        splitData: z.array(z.object({
          items: z.array(z.number()),
          customer_id: z.number().optional()
        }))
      }))
      .mutation(({ input }) => splitBill(input.transactionId, input.splitData)),
    
    generateReceipt: publicProcedure
      .input(z.object({ transactionId: z.number() }))
      .query(({ input }) => generateReceipt(input.transactionId)),
    
    sendReceiptWhatsApp: publicProcedure
      .input(z.object({ transactionId: z.number(), phoneNumber: z.string() }))
      .mutation(({ input }) => sendReceiptWhatsApp(input.transactionId, input.phoneNumber)),
    
    sendReceiptEmail: publicProcedure
      .input(z.object({ transactionId: z.number(), email: z.string().email() }))
      .mutation(({ input }) => sendReceiptEmail(input.transactionId, input.email))
  }),

  // Customer management routes
  customers: router({
    create: publicProcedure
      .input(createCustomerInputSchema)
      .mutation(({ input }) => createCustomer(input)),
    
    getAll: publicProcedure
      .input(z.object({ searchQuery: z.string().optional() }).optional())
      .query(({ input }) => getCustomers(input?.searchQuery)),
    
    getById: publicProcedure
      .input(z.object({ customerId: z.number() }))
      .query(({ input }) => getCustomerById(input.customerId)),
    
    update: publicProcedure
      .input(z.object({ customerId: z.number(), data: createCustomerInputSchema.partial() }))
      .mutation(({ input }) => updateCustomer(input.customerId, input.data)),
    
    addLoyaltyPoints: publicProcedure
      .input(z.object({ customerId: z.number(), points: z.number(), transactionId: z.number() }))
      .mutation(({ input }) => addLoyaltyPoints(input.customerId, input.points, input.transactionId)),
    
    redeemLoyaltyPoints: publicProcedure
      .input(z.object({ customerId: z.number(), points: z.number(), transactionId: z.number() }))
      .mutation(({ input }) => redeemLoyaltyPoints(input.customerId, input.points, input.transactionId)),
    
    getTransactionHistory: publicProcedure
      .input(z.object({ customerId: z.number(), limit: z.number().optional() }))
      .query(({ input }) => getCustomerTransactionHistory(input.customerId, input.limit)),
    
    getTopCustomers: publicProcedure
      .input(z.object({ branchId: z.number().optional(), limit: z.number().optional() }).optional())
      .query(({ input }) => getTopCustomers(input?.branchId, input?.limit)),
    
    searchByPhone: publicProcedure
      .input(z.object({ phone: z.string() }))
      .query(({ input }) => searchCustomerByPhone(input.phone))
  }),

  // Reports routes
  reports: router({
    sales: publicProcedure
      .input(reportFilterSchema)
      .query(({ input }) => getSalesReport(input)),
    
    inventory: publicProcedure
      .input(z.object({ branchId: z.number().optional() }).optional())
      .query(({ input }) => getInventoryReport(input?.branchId)),
    
    profitLoss: publicProcedure
      .input(reportFilterSchema)
      .query(({ input }) => getProfitLossReport(input)),
    
    cashFlow: publicProcedure
      .input(z.object({ branchId: z.number(), date: z.coerce.date() }))
      .query(({ input }) => getCashFlowReport(input.branchId, input.date)),
    
    employeePerformance: publicProcedure
      .input(z.object({
        branchId: z.number().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional()
      }).optional())
      .query(({ input }) => getEmployeePerformanceReport(input?.branchId, input?.startDate, input?.endDate)),
    
    tax: publicProcedure
      .input(reportFilterSchema)
      .query(({ input }) => getTaxReport(input)),
    
    customerAnalytics: publicProcedure
      .input(z.object({ branchId: z.number().optional() }).optional())
      .query(({ input }) => getCustomerAnalytics(input?.branchId)),
    
    productPerformance: publicProcedure
      .input(reportFilterSchema)
      .query(({ input }) => getProductPerformanceReport(input)),
    
    exportToExcel: publicProcedure
      .input(z.object({ reportType: z.string(), filter: reportFilterSchema }))
      .mutation(({ input }) => exportReportToExcel(input.reportType, input.filter)),
    
    dashboard: publicProcedure
      .input(z.object({ branchId: z.number().optional() }).optional())
      .query(({ input }) => getDashboardMetrics(input?.branchId))
  }),

  // Shift management routes
  shifts: router({
    start: publicProcedure
      .input(z.object({ userId: z.number(), branchId: z.number(), openingCash: z.number() }))
      .mutation(({ input }) => startShift(input.userId, input.branchId, input.openingCash)),
    
    end: publicProcedure
      .input(z.object({ shiftId: z.number(), closingCash: z.number(), notes: z.string().optional() }))
      .mutation(({ input }) => endShift(input.shiftId, input.closingCash, input.notes)),
    
    getCurrent: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => getCurrentShift(input.userId)),
    
    getHistory: publicProcedure
      .input(z.object({
        userId: z.number().optional(),
        branchId: z.number().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional()
      }).optional())
      .query(({ input }) => getShiftHistory(input?.userId, input?.branchId, input?.startDate, input?.endDate)),
    
    getSummary: publicProcedure
      .input(z.object({ shiftId: z.number() }))
      .query(({ input }) => getShiftSummary(input.shiftId))
  }),

  // Addons routes
  addons: router({
    create: publicProcedure
      .input(z.object({ name: z.string(), price: z.number() }))
      .mutation(({ input }) => createAddon(input.name, input.price)),
    
    getAll: publicProcedure
      .input(z.object({ isActive: z.boolean().optional() }).optional())
      .query(({ input }) => getAddons(input?.isActive)),
    
    update: publicProcedure
      .input(z.object({ addonId: z.number(), name: z.string().optional(), price: z.number().optional() }))
      .mutation(({ input }) => updateAddon(input.addonId, input.name, input.price)),
    
    deactivate: publicProcedure
      .input(z.object({ addonId: z.number() }))
      .mutation(({ input }) => deactivateAddon(input.addonId))
  }),

  // Activity logs routes
  activityLogs: router({
    log: publicProcedure
      .input(z.object({
        userId: z.number(),
        action: z.string(),
        entityType: z.string(),
        entityId: z.number().optional(),
        details: z.string().optional(),
        ipAddress: z.string().optional()
      }))
      .mutation(({ input }) => logUserActivity(input.userId, input.action, input.entityType, input.entityId, input.details, input.ipAddress)),
    
    getUserLogs: publicProcedure
      .input(z.object({
        userId: z.number().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional()
      }).optional())
      .query(({ input }) => getUserActivityLogs(input?.userId, input?.startDate, input?.endDate)),
    
    getAuditLogs: publicProcedure
      .input(z.object({
        action: z.string().optional(),
        entityType: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional()
      }).optional())
      .query(({ input }) => getSystemAuditLogs(input?.action, input?.entityType, input?.startDate, input?.endDate)),
    
    getSecurityLogs: publicProcedure
      .input(z.object({ ipAddress: z.string().optional(), suspicious: z.boolean().optional() }).optional())
      .query(({ input }) => getSecurityLogs(input?.ipAddress, input?.suspicious))
  })
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC POS Server listening at port: ${port}`);
  console.log(`Available routes: auth, branches, products, categories, inventory, transactions, customers, reports, shifts, addons, activityLogs`);
}

start();