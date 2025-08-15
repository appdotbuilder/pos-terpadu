import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  transactionsTable, 
  transactionItemsTable, 
  transactionPaymentsTable,
  transactionItemAddonsTable,
  stockTable,
  branchesTable,
  usersTable,
  productsTable,
  customersTable,
  addonsTable,
  productCategoriesTable
} from '../db/schema';
import { type CreateTransactionInput } from '../schema';
import { createTransaction } from '../handlers/transactions';
import { eq, and } from 'drizzle-orm';

// Test data
let testBranchId: number;
let testUserId: number;
let testCustomerId: number;
let testProductId: number;
let testAddonId: number;

describe('createTransaction', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create test branch
    const branchResult = await db.insert(branchesTable)
      .values({
        name: 'Test Branch',
        address: '123 Test St',
        phone: '+1234567890',
        email: 'test@branch.com'
      })
      .returning()
      .execute();
    testBranchId = branchResult[0].id;

    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@user.com',
        password_hash: 'hashedpassword',
        full_name: 'Test User',
        role: 'CASHIER',
        branch_id: testBranchId
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;

    // Create test customer
    const customerResult = await db.insert(customersTable)
      .values({
        customer_code: 'CUST001',
        name: 'Test Customer',
        email: 'customer@test.com',
        phone: '+1234567890',
        membership_type: 'BASIC'
      })
      .returning()
      .execute();
    testCustomerId = customerResult[0].id;

    // Create test category
    const categoryResult = await db.insert(productCategoriesTable)
      .values({
        name: 'Test Category',
        description: 'Test category description'
      })
      .returning()
      .execute();

    // Create test product
    const productResult = await db.insert(productsTable)
      .values({
        sku: 'TEST001',
        name: 'Test Product',
        description: 'A test product',
        category_id: categoryResult[0].id,
        base_price: '10.00',
        selling_price: '15.00',
        unit: 'pcs',
        min_stock: 5
      })
      .returning()
      .execute();
    testProductId = productResult[0].id;

    // Create stock for the product
    await db.insert(stockTable)
      .values({
        product_id: testProductId,
        branch_id: testBranchId,
        quantity: 100,
        reserved_quantity: 0
      })
      .execute();

    // Create test addon
    const addonResult = await db.insert(addonsTable)
      .values({
        name: 'Extra Cheese',
        price: '2.50'
      })
      .returning()
      .execute();
    testAddonId = addonResult[0].id;
  });

  afterEach(resetDB);

  const createTestInput = (overrides?: Partial<CreateTransactionInput>): CreateTransactionInput => ({
    customer_id: testCustomerId,
    items: [{
      product_id: testProductId,
      product_variant_id: null,
      quantity: 2,
      unit_price: 15.00,
      discount_amount: 0,
      notes: null,
      addons: []
    }],
    discount_amount: 0,
    tax_amount: 1.50,
    payments: [{
      payment_method: 'CASH',
      amount: 31.50,
      reference_number: null
    }],
    notes: 'Test transaction',
    ...overrides
  });

  it('should create a transaction successfully', async () => {
    const input = createTestInput();
    
    const result = await createTransaction(input, testUserId, testBranchId);

    // Verify transaction properties
    expect(result.id).toBeDefined();
    expect(result.transaction_number).toMatch(/^TXN-\d+-[A-Z0-9]+$/);
    expect(result.branch_id).toBe(testBranchId);
    expect(result.customer_id).toBe(testCustomerId);
    expect(result.user_id).toBe(testUserId);
    expect(result.subtotal).toBe(30.00); // 2 * 15.00
    expect(result.discount_amount).toBe(0);
    expect(result.tax_amount).toBe(1.50);
    expect(result.total_amount).toBe(31.50); // 30 - 0 + 1.50
    expect(result.status).toBe('PENDING');
    expect(result.notes).toBe('Test transaction');
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save transaction to database', async () => {
    const input = createTestInput();
    
    const result = await createTransaction(input, testUserId, testBranchId);

    // Verify transaction is saved
    const transactions = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, result.id))
      .execute();

    expect(transactions).toHaveLength(1);
    expect(transactions[0].transaction_number).toBe(result.transaction_number);
    expect(parseFloat(transactions[0].subtotal)).toBe(30.00);
    expect(parseFloat(transactions[0].total_amount)).toBe(31.50);
  });

  it('should create transaction items', async () => {
    const input = createTestInput();
    
    const result = await createTransaction(input, testUserId, testBranchId);

    // Verify transaction items are created
    const items = await db.select()
      .from(transactionItemsTable)
      .where(eq(transactionItemsTable.transaction_id, result.id))
      .execute();

    expect(items).toHaveLength(1);
    expect(items[0].product_id).toBe(testProductId);
    expect(items[0].quantity).toBe(2);
    expect(parseFloat(items[0].unit_price)).toBe(15.00);
    expect(parseFloat(items[0].total_amount)).toBe(30.00);
  });

  it('should create transaction payments', async () => {
    const input = createTestInput();
    
    const result = await createTransaction(input, testUserId, testBranchId);

    // Verify payments are created
    const payments = await db.select()
      .from(transactionPaymentsTable)
      .where(eq(transactionPaymentsTable.transaction_id, result.id))
      .execute();

    expect(payments).toHaveLength(1);
    expect(payments[0].payment_method).toBe('CASH');
    expect(parseFloat(payments[0].amount)).toBe(31.50);
  });

  it('should reserve stock correctly', async () => {
    const input = createTestInput();
    
    await createTransaction(input, testUserId, testBranchId);

    // Check stock reservation
    const stock = await db.select()
      .from(stockTable)
      .where(and(
        eq(stockTable.product_id, testProductId),
        eq(stockTable.branch_id, testBranchId)
      ))
      .execute();

    expect(stock).toHaveLength(1);
    expect(stock[0].quantity).toBe(100); // Original quantity unchanged
    expect(stock[0].reserved_quantity).toBe(2); // Reserved the ordered quantity
  });

  it('should handle transaction with addons', async () => {
    const input = createTestInput({
      items: [{
        product_id: testProductId,
        product_variant_id: null,
        quantity: 1,
        unit_price: 15.00,
        discount_amount: 0,
        notes: null,
        addons: [{
          addon_id: testAddonId,
          quantity: 2
        }]
      }]
    });
    
    const result = await createTransaction(input, testUserId, testBranchId);

    // Verify subtotal includes addon cost (15.00 + 2 * 2.50 = 20.00)
    expect(result.subtotal).toBe(20.00);

    // Check addon records are created
    const items = await db.select()
      .from(transactionItemsTable)
      .where(eq(transactionItemsTable.transaction_id, result.id))
      .execute();

    const itemAddons = await db.select()
      .from(transactionItemAddonsTable)
      .where(eq(transactionItemAddonsTable.transaction_item_id, items[0].id))
      .execute();

    expect(itemAddons).toHaveLength(1);
    expect(itemAddons[0].addon_id).toBe(testAddonId);
    expect(itemAddons[0].quantity).toBe(2);
    expect(parseFloat(itemAddons[0].unit_price)).toBe(2.50);
    expect(parseFloat(itemAddons[0].total_price)).toBe(5.00);
  });

  it('should handle transaction with discount', async () => {
    const input = createTestInput({
      discount_amount: 5.00,
      payments: [{
        payment_method: 'CASH',
        amount: 26.50, // 30 - 5 + 1.50
        reference_number: null
      }]
    });
    
    const result = await createTransaction(input, testUserId, testBranchId);

    expect(result.subtotal).toBe(30.00);
    expect(result.discount_amount).toBe(5.00);
    expect(result.total_amount).toBe(26.50); // 30 - 5 + 1.50
  });

  it('should handle transaction without customer', async () => {
    const input = createTestInput({
      customer_id: null
    });
    
    const result = await createTransaction(input, testUserId, testBranchId);

    expect(result.customer_id).toBeNull();
  });

  it('should handle multiple payment methods', async () => {
    const input = createTestInput({
      payments: [
        {
          payment_method: 'CASH',
          amount: 20.00,
          reference_number: null
        },
        {
          payment_method: 'CARD',
          amount: 11.50,
          reference_number: 'CARD123'
        }
      ]
    });
    
    const result = await createTransaction(input, testUserId, testBranchId);

    const payments = await db.select()
      .from(transactionPaymentsTable)
      .where(eq(transactionPaymentsTable.transaction_id, result.id))
      .execute();

    expect(payments).toHaveLength(2);
    expect(payments.find(p => p.payment_method === 'CASH')?.amount).toBe('20.00');
    expect(payments.find(p => p.payment_method === 'CARD')?.amount).toBe('11.50');
    expect(payments.find(p => p.payment_method === 'CARD')?.reference_number).toBe('CARD123');
  });

  it('should throw error for non-existent customer', async () => {
    const input = createTestInput({
      customer_id: 99999 // Non-existent customer
    });
    
    expect(createTransaction(input, testUserId, testBranchId))
      .rejects.toThrow(/customer not found/i);
  });

  it('should throw error for non-existent product', async () => {
    const input = createTestInput({
      items: [{
        product_id: 99999, // Non-existent product
        product_variant_id: null,
        quantity: 1,
        unit_price: 15.00,
        discount_amount: 0,
        notes: null,
        addons: []
      }]
    });
    
    expect(createTransaction(input, testUserId, testBranchId))
      .rejects.toThrow(/product with id 99999 not found/i);
  });

  it('should throw error for insufficient stock', async () => {
    const input = createTestInput({
      items: [{
        product_id: testProductId,
        product_variant_id: null,
        quantity: 150, // More than available (100)
        unit_price: 15.00,
        discount_amount: 0,
        notes: null,
        addons: []
      }]
    });
    
    expect(createTransaction(input, testUserId, testBranchId))
      .rejects.toThrow(/insufficient stock/i);
  });

  it('should throw error for non-existent addon', async () => {
    const input = createTestInput({
      items: [{
        product_id: testProductId,
        product_variant_id: null,
        quantity: 1,
        unit_price: 15.00,
        discount_amount: 0,
        notes: null,
        addons: [{
          addon_id: 99999, // Non-existent addon
          quantity: 1
        }]
      }]
    });
    
    expect(createTransaction(input, testUserId, testBranchId))
      .rejects.toThrow(/addon with id 99999 not found/i);
  });

  it('should handle product without stock record', async () => {
    // Create another product without stock
    const productResult = await db.insert(productsTable)
      .values({
        sku: 'TEST002',
        name: 'Test Product 2',
        base_price: '5.00',
        selling_price: '10.00',
        unit: 'pcs',
        min_stock: 1
      })
      .returning()
      .execute();

    const input = createTestInput({
      items: [{
        product_id: productResult[0].id,
        product_variant_id: null,
        quantity: 1,
        unit_price: 10.00,
        discount_amount: 0,
        notes: null,
        addons: []
      }]
    });
    
    expect(createTransaction(input, testUserId, testBranchId))
      .rejects.toThrow(/no stock record found/i);
  });

  it('should calculate complex transaction correctly', async () => {
    const input: CreateTransactionInput = {
      customer_id: testCustomerId,
      items: [
        {
          product_id: testProductId,
          product_variant_id: null,
          quantity: 3,
          unit_price: 15.00,
          discount_amount: 5.00, // Item discount
          notes: 'First item',
          addons: [{
            addon_id: testAddonId,
            quantity: 1
          }]
        },
        {
          product_id: testProductId,
          product_variant_id: null,
          quantity: 1,
          unit_price: 12.00,
          discount_amount: 0,
          notes: 'Second item',
          addons: []
        }
      ],
      discount_amount: 10.00, // Transaction discount
      tax_amount: 3.20,
      payments: [{
        payment_method: 'CASH',
        amount: 45.70,
        reference_number: null
      }],
      notes: 'Complex transaction'
    };
    
    const result = await createTransaction(input, testUserId, testBranchId);

    // Expected calculation:
    // Item 1: (3 * 15.00) - 5.00 + (1 * 2.50) = 45.00 - 5.00 + 2.50 = 42.50
    // Item 2: (1 * 12.00) - 0 = 12.00
    // Subtotal: 42.50 + 12.00 = 54.50
    // Total: 54.50 - 10.00 + 3.20 = 47.70
    
    expect(result.subtotal).toBe(54.50);
    expect(result.discount_amount).toBe(10.00);
    expect(result.tax_amount).toBe(3.20);
    expect(result.total_amount).toBe(47.70);

    // Verify stock reservation (3 + 1 = 4 total reserved)
    const stock = await db.select()
      .from(stockTable)
      .where(and(
        eq(stockTable.product_id, testProductId),
        eq(stockTable.branch_id, testBranchId)
      ))
      .execute();

    expect(stock[0].reserved_quantity).toBe(4);
  });
});