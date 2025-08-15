import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  branchesTable, 
  usersTable, 
  customersTable, 
  productCategoriesTable,
  productsTable, 
  transactionsTable,
  transactionItemsTable
} from '../db/schema';
import { type ReportFilter } from '../schema';
import { getSalesReport } from '../handlers/reports';

describe('getSalesReport', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should generate comprehensive sales report', async () => {
    // Create test data
    const [branch] = await db.insert(branchesTable)
      .values({ name: 'Main Branch' })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        email: 'cashier@test.com',
        password_hash: 'hash123',
        full_name: 'Test Cashier',
        role: 'CASHIER',
        branch_id: branch.id
      })
      .returning()
      .execute();

    const [customer] = await db.insert(customersTable)
      .values({
        customer_code: 'CUST001',
        name: 'Test Customer',
        membership_type: 'BASIC'
      })
      .returning()
      .execute();

    const [category] = await db.insert(productCategoriesTable)
      .values({ name: 'Electronics' })
      .returning()
      .execute();

    const [product1] = await db.insert(productsTable)
      .values({
        sku: 'PROD001',
        name: 'Smartphone',
        category_id: category.id,
        base_price: '500.00',
        selling_price: '699.99',
        unit: 'pcs',
        min_stock: 10
      })
      .returning()
      .execute();

    const [product2] = await db.insert(productsTable)
      .values({
        sku: 'PROD002',
        name: 'Laptop',
        category_id: category.id,
        base_price: '800.00',
        selling_price: '999.99',
        unit: 'pcs',
        min_stock: 5
      })
      .returning()
      .execute();

    // Create transactions with different dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [transaction1] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN001',
        branch_id: branch.id,
        customer_id: customer.id,
        user_id: user.id,
        subtotal: '699.99',
        discount_amount: '0.00',
        tax_amount: '69.99',
        total_amount: '769.98',
        status: 'COMPLETED',
        created_at: yesterday
      })
      .returning()
      .execute();

    const [transaction2] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN002',
        branch_id: branch.id,
        user_id: user.id,
        subtotal: '1999.98',
        discount_amount: '100.00',
        tax_amount: '199.99',
        total_amount: '2099.97',
        status: 'COMPLETED',
        created_at: today
      })
      .returning()
      .execute();

    // Create transaction items
    await db.insert(transactionItemsTable)
      .values({
        transaction_id: transaction1.id,
        product_id: product1.id,
        quantity: 1,
        unit_price: '699.99',
        discount_amount: '0.00',
        total_amount: '699.99'
      })
      .execute();

    await db.insert(transactionItemsTable)
      .values([
        {
          transaction_id: transaction2.id,
          product_id: product2.id,
          quantity: 2,
          unit_price: '999.99',
          discount_amount: '0.00',
          total_amount: '1999.98'
        }
      ])
      .execute();

    // Test report generation
    const startDate = new Date(yesterday);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    const filter: ReportFilter = {
      branch_id: branch.id,
      start_date: startDate,
      end_date: endDate,
      category_id: null,
      user_id: null
    };

    const report = await getSalesReport(filter);

    // Validate report structure and calculations
    expect(report.total_sales).toEqual(2869.95); // 769.98 + 2099.97
    expect(report.total_transactions).toEqual(2);
    expect(report.average_transaction_value).toBeCloseTo(1434.975, 2);
    expect(report.top_products).toHaveLength(2);
    expect(report.daily_sales).toHaveLength(2);

    // Validate top products
    const topProduct = report.top_products[0];
    expect(topProduct.product_id).toEqual(product2.id);
    expect(topProduct.product_name).toEqual('Laptop');
    expect(topProduct.quantity_sold).toEqual(2);
    expect(topProduct.total_revenue).toEqual(1999.98);

    // Validate daily sales
    const dailySales = report.daily_sales.sort((a, b) => a.date.getTime() - b.date.getTime());
    expect(dailySales[0].total_sales).toEqual(769.98);
    expect(dailySales[0].transaction_count).toEqual(1);
    expect(dailySales[1].total_sales).toEqual(2099.97);
    expect(dailySales[1].transaction_count).toEqual(1);
  });

  it('should filter by branch correctly', async () => {
    // Create two branches
    const [branch1] = await db.insert(branchesTable)
      .values({ name: 'Branch 1' })
      .returning()
      .execute();

    const [branch2] = await db.insert(branchesTable)
      .values({ name: 'Branch 2' })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        email: 'cashier@test.com',
        password_hash: 'hash123',
        full_name: 'Test Cashier',
        role: 'CASHIER',
        branch_id: branch1.id
      })
      .returning()
      .execute();

    const [product] = await db.insert(productsTable)
      .values({
        sku: 'PROD001',
        name: 'Test Product',
        base_price: '100.00',
        selling_price: '120.00',
        unit: 'pcs',
        min_stock: 5
      })
      .returning()
      .execute();

    // Create transactions in different branches
    const [transaction1] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN001',
        branch_id: branch1.id,
        user_id: user.id,
        subtotal: '120.00',
        discount_amount: '0.00',
        tax_amount: '12.00',
        total_amount: '132.00',
        status: 'COMPLETED'
      })
      .returning()
      .execute();

    const [transaction2] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN002',
        branch_id: branch2.id,
        user_id: user.id,
        subtotal: '240.00',
        discount_amount: '0.00',
        tax_amount: '24.00',
        total_amount: '264.00',
        status: 'COMPLETED'
      })
      .returning()
      .execute();

    await db.insert(transactionItemsTable)
      .values([
        {
          transaction_id: transaction1.id,
          product_id: product.id,
          quantity: 1,
          unit_price: '120.00',
          discount_amount: '0.00',
          total_amount: '120.00'
        },
        {
          transaction_id: transaction2.id,
          product_id: product.id,
          quantity: 2,
          unit_price: '120.00',
          discount_amount: '0.00',
          total_amount: '240.00'
        }
      ])
      .execute();

    const today = new Date();
    const startDate = new Date(today);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    const filter: ReportFilter = {
      branch_id: branch1.id,
      start_date: startDate,
      end_date: endDate,
      category_id: null,
      user_id: null
    };

    const report = await getSalesReport(filter);

    // Should only include branch1 transactions
    expect(report.total_sales).toEqual(132.00);
    expect(report.total_transactions).toEqual(1);
  });

  it('should filter by category correctly', async () => {
    // Create test data
    const [branch] = await db.insert(branchesTable)
      .values({ name: 'Main Branch' })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        email: 'cashier@test.com',
        password_hash: 'hash123',
        full_name: 'Test Cashier',
        role: 'CASHIER',
        branch_id: branch.id
      })
      .returning()
      .execute();

    const [category1] = await db.insert(productCategoriesTable)
      .values({ name: 'Electronics' })
      .returning()
      .execute();

    const [category2] = await db.insert(productCategoriesTable)
      .values({ name: 'Books' })
      .returning()
      .execute();

    const [product1] = await db.insert(productsTable)
      .values({
        sku: 'PROD001',
        name: 'Phone',
        category_id: category1.id,
        base_price: '400.00',
        selling_price: '500.00',
        unit: 'pcs',
        min_stock: 5
      })
      .returning()
      .execute();

    const [product2] = await db.insert(productsTable)
      .values({
        sku: 'PROD002',
        name: 'Novel',
        category_id: category2.id,
        base_price: '15.00',
        selling_price: '20.00',
        unit: 'pcs',
        min_stock: 10
      })
      .returning()
      .execute();

    const [transaction] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN001',
        branch_id: branch.id,
        user_id: user.id,
        subtotal: '520.00',
        discount_amount: '0.00',
        tax_amount: '52.00',
        total_amount: '572.00',
        status: 'COMPLETED'
      })
      .returning()
      .execute();

    await db.insert(transactionItemsTable)
      .values([
        {
          transaction_id: transaction.id,
          product_id: product1.id,
          quantity: 1,
          unit_price: '500.00',
          discount_amount: '0.00',
          total_amount: '500.00'
        },
        {
          transaction_id: transaction.id,
          product_id: product2.id,
          quantity: 1,
          unit_price: '20.00',
          discount_amount: '0.00',
          total_amount: '20.00'
        }
      ])
      .execute();

    const today = new Date();
    const startDate = new Date(today);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    const filter: ReportFilter = {
      branch_id: null,
      start_date: startDate,
      end_date: endDate,
      category_id: category1.id, // Filter by Electronics category
      user_id: null
    };

    const report = await getSalesReport(filter);

    // Should only include electronics products in top_products
    expect(report.top_products).toHaveLength(1);
    expect(report.top_products[0].product_name).toEqual('Phone');
    expect(report.top_products[0].total_revenue).toEqual(500.00);
  });

  it('should only include completed transactions', async () => {
    // Create test data
    const [branch] = await db.insert(branchesTable)
      .values({ name: 'Main Branch' })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        email: 'cashier@test.com',
        password_hash: 'hash123',
        full_name: 'Test Cashier',
        role: 'CASHIER',
        branch_id: branch.id
      })
      .returning()
      .execute();

    const [product] = await db.insert(productsTable)
      .values({
        sku: 'PROD001',
        name: 'Test Product',
        base_price: '100.00',
        selling_price: '120.00',
        unit: 'pcs',
        min_stock: 5
      })
      .returning()
      .execute();

    // Create transactions with different statuses
    const [completedTx] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN001',
        branch_id: branch.id,
        user_id: user.id,
        subtotal: '120.00',
        discount_amount: '0.00',
        tax_amount: '12.00',
        total_amount: '132.00',
        status: 'COMPLETED'
      })
      .returning()
      .execute();

    const [pendingTx] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN002',
        branch_id: branch.id,
        user_id: user.id,
        subtotal: '120.00',
        discount_amount: '0.00',
        tax_amount: '12.00',
        total_amount: '132.00',
        status: 'PENDING'
      })
      .returning()
      .execute();

    const [cancelledTx] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN003',
        branch_id: branch.id,
        user_id: user.id,
        subtotal: '120.00',
        discount_amount: '0.00',
        tax_amount: '12.00',
        total_amount: '132.00',
        status: 'CANCELLED'
      })
      .returning()
      .execute();

    await db.insert(transactionItemsTable)
      .values([
        {
          transaction_id: completedTx.id,
          product_id: product.id,
          quantity: 1,
          unit_price: '120.00',
          discount_amount: '0.00',
          total_amount: '120.00'
        },
        {
          transaction_id: pendingTx.id,
          product_id: product.id,
          quantity: 1,
          unit_price: '120.00',
          discount_amount: '0.00',
          total_amount: '120.00'
        },
        {
          transaction_id: cancelledTx.id,
          product_id: product.id,
          quantity: 1,
          unit_price: '120.00',
          discount_amount: '0.00',
          total_amount: '120.00'
        }
      ])
      .execute();

    const today = new Date();
    const startDate = new Date(today);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    const filter: ReportFilter = {
      branch_id: null,
      start_date: startDate,
      end_date: endDate,
      category_id: null,
      user_id: null
    };

    const report = await getSalesReport(filter);

    // Should only include completed transaction
    expect(report.total_sales).toEqual(132.00);
    expect(report.total_transactions).toEqual(1);
  });

  it('should handle empty results correctly', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const filter: ReportFilter = {
      branch_id: null,
      start_date: tomorrow, // Future date with no data
      end_date: tomorrow,
      category_id: null,
      user_id: null
    };

    const report = await getSalesReport(filter);

    expect(report.total_sales).toEqual(0);
    expect(report.total_transactions).toEqual(0);
    expect(report.average_transaction_value).toEqual(0);
    expect(report.top_products).toHaveLength(0);
    expect(report.daily_sales).toHaveLength(0);
  });

  it('should filter by user correctly', async () => {
    // Create test data
    const [branch] = await db.insert(branchesTable)
      .values({ name: 'Main Branch' })
      .returning()
      .execute();

    const [user1] = await db.insert(usersTable)
      .values({
        email: 'cashier1@test.com',
        password_hash: 'hash123',
        full_name: 'Cashier 1',
        role: 'CASHIER',
        branch_id: branch.id
      })
      .returning()
      .execute();

    const [user2] = await db.insert(usersTable)
      .values({
        email: 'cashier2@test.com',
        password_hash: 'hash123',
        full_name: 'Cashier 2',
        role: 'CASHIER',
        branch_id: branch.id
      })
      .returning()
      .execute();

    const [product] = await db.insert(productsTable)
      .values({
        sku: 'PROD001',
        name: 'Test Product',
        base_price: '100.00',
        selling_price: '120.00',
        unit: 'pcs',
        min_stock: 5
      })
      .returning()
      .execute();

    // Create transactions by different users
    const [transaction1] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN001',
        branch_id: branch.id,
        user_id: user1.id,
        subtotal: '120.00',
        discount_amount: '0.00',
        tax_amount: '12.00',
        total_amount: '132.00',
        status: 'COMPLETED'
      })
      .returning()
      .execute();

    const [transaction2] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN002',
        branch_id: branch.id,
        user_id: user2.id,
        subtotal: '240.00',
        discount_amount: '0.00',
        tax_amount: '24.00',
        total_amount: '264.00',
        status: 'COMPLETED'
      })
      .returning()
      .execute();

    await db.insert(transactionItemsTable)
      .values([
        {
          transaction_id: transaction1.id,
          product_id: product.id,
          quantity: 1,
          unit_price: '120.00',
          discount_amount: '0.00',
          total_amount: '120.00'
        },
        {
          transaction_id: transaction2.id,
          product_id: product.id,
          quantity: 2,
          unit_price: '120.00',
          discount_amount: '0.00',
          total_amount: '240.00'
        }
      ])
      .execute();

    const today = new Date();
    const startDate = new Date(today);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    const filter: ReportFilter = {
      branch_id: null,
      start_date: startDate,
      end_date: endDate,
      category_id: null,
      user_id: user1.id // Filter by first user
    };

    const report = await getSalesReport(filter);

    // Should only include user1 transactions
    expect(report.total_sales).toEqual(132.00);
    expect(report.total_transactions).toEqual(1);
  });

  it('should handle date range filtering correctly', async () => {
    // Create test data
    const [branch] = await db.insert(branchesTable)
      .values({ name: 'Main Branch' })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        email: 'cashier@test.com',
        password_hash: 'hash123',
        full_name: 'Test Cashier',
        role: 'CASHIER',
        branch_id: branch.id
      })
      .returning()
      .execute();

    const [product] = await db.insert(productsTable)
      .values({
        sku: 'PROD001',
        name: 'Test Product',
        base_price: '100.00',
        selling_price: '120.00',
        unit: 'pcs',
        min_stock: 5
      })
      .returning()
      .execute();

    // Create transactions on different dates
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBeforeYesterday = new Date(yesterday);
    dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 1);

    await db.insert(transactionsTable)
      .values([
        {
          transaction_number: 'TXN001',
          branch_id: branch.id,
          user_id: user.id,
          subtotal: '120.00',
          discount_amount: '0.00',
          tax_amount: '12.00',
          total_amount: '132.00',
          status: 'COMPLETED',
          created_at: dayBeforeYesterday
        },
        {
          transaction_number: 'TXN002',
          branch_id: branch.id,
          user_id: user.id,
          subtotal: '120.00',
          discount_amount: '0.00',
          tax_amount: '12.00',
          total_amount: '132.00',
          status: 'COMPLETED',
          created_at: yesterday
        },
        {
          transaction_number: 'TXN003',
          branch_id: branch.id,
          user_id: user.id,
          subtotal: '120.00',
          discount_amount: '0.00',
          tax_amount: '12.00',
          total_amount: '132.00',
          status: 'COMPLETED',
          created_at: today
        }
      ])
      .execute();

    // Test filtering by date range (yesterday only)
    const filter: ReportFilter = {
      branch_id: null,
      start_date: yesterday,
      end_date: yesterday,
      category_id: null,
      user_id: null
    };

    const report = await getSalesReport(filter);

    // Should only include yesterday's transaction
    expect(report.total_sales).toEqual(132.00);
    expect(report.total_transactions).toEqual(1);
    expect(report.daily_sales).toHaveLength(1);
  });

  it('should calculate numeric values correctly', async () => {
    // Create test data
    const [branch] = await db.insert(branchesTable)
      .values({ name: 'Main Branch' })
      .returning()
      .execute();

    const [user] = await db.insert(usersTable)
      .values({
        email: 'cashier@test.com',
        password_hash: 'hash123',
        full_name: 'Test Cashier',
        role: 'CASHIER',
        branch_id: branch.id
      })
      .returning()
      .execute();

    const [product] = await db.insert(productsTable)
      .values({
        sku: 'PROD001',
        name: 'Test Product',
        base_price: '100.00',
        selling_price: '120.50',
        unit: 'pcs',
        min_stock: 5
      })
      .returning()
      .execute();

    const [transaction] = await db.insert(transactionsTable)
      .values({
        transaction_number: 'TXN001',
        branch_id: branch.id,
        user_id: user.id,
        subtotal: '241.00',
        discount_amount: '10.50',
        tax_amount: '24.10',
        total_amount: '254.60',
        status: 'COMPLETED'
      })
      .returning()
      .execute();

    await db.insert(transactionItemsTable)
      .values({
        transaction_id: transaction.id,
        product_id: product.id,
        quantity: 2,
        unit_price: '120.50',
        discount_amount: '0.00',
        total_amount: '241.00'
      })
      .execute();

    const today = new Date();
    const startDate = new Date(today);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    const filter: ReportFilter = {
      branch_id: null,
      start_date: startDate,
      end_date: endDate,
      category_id: null,
      user_id: null
    };

    const report = await getSalesReport(filter);

    // Verify numeric type conversions
    expect(typeof report.total_sales).toBe('number');
    expect(typeof report.average_transaction_value).toBe('number');
    expect(typeof report.top_products[0].total_revenue).toBe('number');
    expect(typeof report.daily_sales[0].total_sales).toBe('number');

    // Verify calculated values
    expect(report.total_sales).toEqual(254.60);
    expect(report.average_transaction_value).toEqual(254.60);
    expect(report.top_products[0].total_revenue).toEqual(241.00);
  });
});