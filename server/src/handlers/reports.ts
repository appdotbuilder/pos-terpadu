import { db } from '../db';
import { transactionsTable, transactionItemsTable, productsTable, branchesTable, usersTable, productCategoriesTable } from '../db/schema';
import { type ReportFilter, type SalesReport, type InventoryReport } from '../schema';
import { eq, and, gte, lte, between, desc, sum, count, SQL } from 'drizzle-orm';

export async function getSalesReport(filter: ReportFilter): Promise<SalesReport> {
  try {
    // Build base conditions array for transactions
    const conditions: SQL<unknown>[] = [];
    
    // Date range filter (required)
    conditions.push(gte(transactionsTable.created_at, filter.start_date));
    conditions.push(lte(transactionsTable.created_at, filter.end_date));
    
    // Status filter - only completed transactions
    conditions.push(eq(transactionsTable.status, 'COMPLETED'));
    
    // Optional branch filter
    if (filter.branch_id !== null) {
      conditions.push(eq(transactionsTable.branch_id, filter.branch_id));
    }
    
    // Optional user filter
    if (filter.user_id !== null) {
      conditions.push(eq(transactionsTable.user_id, filter.user_id));
    }

    // Get total sales and transaction count
    const totalSalesQuery = db
      .select({
        total_sales: sum(transactionsTable.total_amount),
        total_transactions: count(transactionsTable.id)
      })
      .from(transactionsTable)
      .where(and(...conditions));

    const [totalSalesResult] = await totalSalesQuery.execute();
    
    const total_sales = parseFloat(totalSalesResult.total_sales || '0');
    const total_transactions = totalSalesResult.total_transactions || 0;
    const average_transaction_value = total_transactions > 0 ? total_sales / total_transactions : 0;

    // Build conditions for transaction items query (includes transaction join conditions)
    const itemsConditions: SQL<unknown>[] = [];
    itemsConditions.push(gte(transactionsTable.created_at, filter.start_date));
    itemsConditions.push(lte(transactionsTable.created_at, filter.end_date));
    itemsConditions.push(eq(transactionsTable.status, 'COMPLETED'));
    
    if (filter.branch_id !== null) {
      itemsConditions.push(eq(transactionsTable.branch_id, filter.branch_id));
    }
    
    if (filter.user_id !== null) {
      itemsConditions.push(eq(transactionsTable.user_id, filter.user_id));
    }

    // Add category filter if specified
    if (filter.category_id !== null) {
      itemsConditions.push(eq(productsTable.category_id, filter.category_id));
    }

    // Get top products - build query with consistent type chain
    const baseTopProductsQuery = db
      .select({
        product_id: transactionItemsTable.product_id,
        product_name: productsTable.name,
        quantity_sold: sum(transactionItemsTable.quantity).as('quantity_sold'),
        total_revenue: sum(transactionItemsTable.total_amount).as('total_revenue')
      })
      .from(transactionItemsTable)
      .innerJoin(transactionsTable, eq(transactionItemsTable.transaction_id, transactionsTable.id))
      .innerJoin(productsTable, eq(transactionItemsTable.product_id, productsTable.id));

    // Execute query with or without category join
    let topProductsResults;
    if (filter.category_id !== null) {
      topProductsResults = await baseTopProductsQuery
        .innerJoin(productCategoriesTable, eq(productsTable.category_id, productCategoriesTable.id))
        .where(and(...itemsConditions))
        .groupBy(transactionItemsTable.product_id, productsTable.name)
        .orderBy(desc(sum(transactionItemsTable.total_amount)))
        .limit(10)
        .execute();
    } else {
      topProductsResults = await baseTopProductsQuery
        .where(and(...itemsConditions))
        .groupBy(transactionItemsTable.product_id, productsTable.name)
        .orderBy(desc(sum(transactionItemsTable.total_amount)))
        .limit(10)
        .execute();
    }

    const top_products = topProductsResults.map(product => ({
      product_id: product.product_id,
      product_name: product.product_name,
      quantity_sold: parseInt(product.quantity_sold?.toString() || '0'),
      total_revenue: parseFloat(product.total_revenue || '0')
    }));

    // Get daily sales breakdown
    const dailySalesQuery = db
      .select({
        date: transactionsTable.created_at,
        total_sales: sum(transactionsTable.total_amount),
        transaction_count: count(transactionsTable.id)
      })
      .from(transactionsTable)
      .where(and(...conditions))
      .groupBy(transactionsTable.created_at)
      .orderBy(transactionsTable.created_at);

    const dailySalesResults = await dailySalesQuery.execute();

    // Group by date (removing time component)
    const dailySalesMap = new Map<string, { total_sales: number, transaction_count: number }>();
    
    dailySalesResults.forEach(row => {
      const dateKey = row.date.toISOString().split('T')[0]; // Get YYYY-MM-DD format
      const existing = dailySalesMap.get(dateKey);
      const sales = parseFloat(row.total_sales || '0');
      const count = row.transaction_count || 0;
      
      if (existing) {
        existing.total_sales += sales;
        existing.transaction_count += count;
      } else {
        dailySalesMap.set(dateKey, {
          total_sales: sales,
          transaction_count: count
        });
      }
    });

    const daily_sales = Array.from(dailySalesMap.entries())
      .map(([dateStr, data]) => ({
        date: new Date(dateStr + 'T00:00:00.000Z'),
        total_sales: data.total_sales,
        transaction_count: data.transaction_count
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return {
      total_sales,
      total_transactions,
      average_transaction_value,
      top_products,
      daily_sales
    };
  } catch (error) {
    console.error('Sales report generation failed:', error);
    throw error;
  }
}

export async function getInventoryReport(branchId?: number): Promise<InventoryReport> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is generating inventory report with stock levels and alerts.
    return Promise.resolve({
        total_products: 0,
        low_stock_items: [],
        stock_value: 0,
        stock_movements: []
    } as InventoryReport);
}

export async function getProfitLossReport(filter: ReportFilter): Promise<any> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is generating profit & loss report with revenue and costs.
    return Promise.resolve({
        revenue: 0,
        cost_of_goods_sold: 0,
        gross_profit: 0,
        operating_expenses: 0,
        net_profit: 0
    });
}

export async function getCashFlowReport(branchId: number, date: Date): Promise<any> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is generating daily cash flow report for reconciliation.
    return Promise.resolve({
        opening_cash: 0,
        cash_sales: 0,
        cash_expenses: 0,
        closing_cash: 0,
        variance: 0
    });
}

export async function getEmployeePerformanceReport(branchId?: number, startDate?: Date, endDate?: Date): Promise<any[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is generating employee performance report with sales metrics.
    return Promise.resolve([]);
}

export async function getTaxReport(filter: ReportFilter): Promise<any> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is generating tax report for compliance and filing.
    return Promise.resolve({
        taxable_sales: 0,
        tax_collected: 0,
        tax_rate: 0,
        transactions: []
    });
}

export async function getCustomerAnalytics(branchId?: number): Promise<any> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is generating customer analytics for CRM insights.
    return Promise.resolve({
        total_customers: 0,
        new_customers: 0,
        repeat_customers: 0,
        customer_retention_rate: 0,
        average_customer_value: 0
    });
}

export async function getProductPerformanceReport(filter: ReportFilter): Promise<any[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is analyzing product performance and trends.
    return Promise.resolve([]);
}

export async function exportReportToExcel(reportType: string, filter: ReportFilter): Promise<string> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is exporting reports to Excel format for external analysis.
    return Promise.resolve('excel_file_path.xlsx');
}

export async function getDashboardMetrics(branchId?: number): Promise<any> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is fetching key metrics for dashboard overview.
    return Promise.resolve({
        today_sales: 0,
        today_transactions: 0,
        low_stock_count: 0,
        active_customers: 0,
        monthly_growth: 0
    });
}