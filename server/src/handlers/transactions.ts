import { db } from '../db';
import { 
  transactionsTable, 
  transactionItemsTable, 
  transactionPaymentsTable, 
  transactionItemAddonsTable,
  stockTable,
  addonsTable,
  productsTable,
  customersTable
} from '../db/schema';
import { type CreateTransactionInput, type Transaction } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createTransaction(
  input: CreateTransactionInput, 
  userId: number, 
  branchId: number
): Promise<Transaction> {
  try {
    // Generate unique transaction number
    const transactionNumber = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Calculate amounts
    let subtotal = 0;
    
    // Validate customer exists if provided
    if (input.customer_id) {
      const customers = await db.select()
        .from(customersTable)
        .where(eq(customersTable.id, input.customer_id))
        .execute();
      
      if (customers.length === 0) {
        throw new Error('Customer not found');
      }
    }

    // Validate products and calculate subtotal
    for (const item of input.items) {
      const products = await db.select()
        .from(productsTable)
        .where(eq(productsTable.id, item.product_id))
        .execute();
      
      if (products.length === 0) {
        throw new Error(`Product with id ${item.product_id} not found`);
      }

      const itemTotal = item.quantity * item.unit_price - item.discount_amount;
      subtotal += itemTotal;

      // Validate addons if any
      for (const addon of item.addons) {
        const addonRecords = await db.select()
          .from(addonsTable)
          .where(eq(addonsTable.id, addon.addon_id))
          .execute();
        
        if (addonRecords.length === 0) {
          throw new Error(`Addon with id ${addon.addon_id} not found`);
        }

        const addonPrice = parseFloat(addonRecords[0].price);
        subtotal += addon.quantity * addonPrice;
      }
    }

    const totalAmount = subtotal - input.discount_amount + input.tax_amount;

    // Start transaction
    const result = await db.transaction(async (tx) => {
      // Insert transaction record
      const transactionResult = await tx.insert(transactionsTable)
        .values({
          transaction_number: transactionNumber,
          branch_id: branchId,
          customer_id: input.customer_id,
          user_id: userId,
          subtotal: subtotal.toString(),
          discount_amount: input.discount_amount.toString(),
          tax_amount: input.tax_amount.toString(),
          total_amount: totalAmount.toString(),
          status: 'PENDING',
          notes: input.notes
        })
        .returning()
        .execute();

      const transaction = transactionResult[0];

      // Insert transaction items and addons
      for (const item of input.items) {
        const itemTotal = item.quantity * item.unit_price - item.discount_amount;
        
        const itemResult = await tx.insert(transactionItemsTable)
          .values({
            transaction_id: transaction.id,
            product_id: item.product_id,
            product_variant_id: item.product_variant_id,
            quantity: item.quantity,
            unit_price: item.unit_price.toString(),
            discount_amount: item.discount_amount.toString(),
            total_amount: itemTotal.toString(),
            notes: item.notes
          })
          .returning()
          .execute();

        const transactionItem = itemResult[0];

        // Insert addons for this item
        for (const addon of item.addons) {
          // Get addon price
          const addonRecords = await tx.select()
            .from(addonsTable)
            .where(eq(addonsTable.id, addon.addon_id))
            .execute();

          const addonPrice = parseFloat(addonRecords[0].price);
          const addonTotal = addon.quantity * addonPrice;

          await tx.insert(transactionItemAddonsTable)
            .values({
              transaction_item_id: transactionItem.id,
              addon_id: addon.addon_id,
              quantity: addon.quantity,
              unit_price: addonPrice.toString(),
              total_price: addonTotal.toString()
            })
            .execute();
        }

        // Reserve stock
        const stockRecords = await tx.select()
          .from(stockTable)
          .where(and(
            eq(stockTable.product_id, item.product_id),
            eq(stockTable.branch_id, branchId)
          ))
          .execute();

        if (stockRecords.length > 0) {
          const currentStock = stockRecords[0];
          const newReservedQty = currentStock.reserved_quantity + item.quantity;
          
          if (newReservedQty > currentStock.quantity) {
            throw new Error(`Insufficient stock for product ${item.product_id}. Available: ${currentStock.quantity - currentStock.reserved_quantity}, Required: ${item.quantity}`);
          }

          await tx.update(stockTable)
            .set({ 
              reserved_quantity: newReservedQty,
              last_updated: new Date()
            })
            .where(eq(stockTable.id, currentStock.id))
            .execute();
        } else {
          throw new Error(`No stock record found for product ${item.product_id} in branch ${branchId}`);
        }
      }

      // Insert payments
      for (const payment of input.payments) {
        await tx.insert(transactionPaymentsTable)
          .values({
            transaction_id: transaction.id,
            payment_method: payment.payment_method,
            amount: payment.amount.toString(),
            reference_number: payment.reference_number
          })
          .execute();
      }

      return transaction;
    });

    // Return with proper numeric conversions
    return {
      ...result,
      subtotal: parseFloat(result.subtotal),
      discount_amount: parseFloat(result.discount_amount),
      tax_amount: parseFloat(result.tax_amount),
      total_amount: parseFloat(result.total_amount)
    };

  } catch (error) {
    console.error('Transaction creation failed:', error);
    throw error;
  }
}

export async function completeTransaction(transactionId: number): Promise<Transaction> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is completing a transaction by updating stock and customer points.
    return Promise.resolve({} as Transaction);
}

export async function holdTransaction(transactionId: number): Promise<boolean> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is putting a transaction on hold for later completion.
    return Promise.resolve(true);
}

export async function cancelTransaction(transactionId: number, reason: string): Promise<boolean> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is cancelling a transaction and restoring reserved stock.
    return Promise.resolve(true);
}

export async function getTransactions(branchId: number, startDate?: Date, endDate?: Date): Promise<Transaction[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is fetching transactions with date filtering and pagination.
    return Promise.resolve([]);
}

export async function getTransactionById(transactionId: number): Promise<Transaction | null> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is fetching a specific transaction with all related data.
    return Promise.resolve(null);
}

export async function splitBill(transactionId: number, splitData: Array<{ items: number[]; customer_id?: number }>): Promise<Transaction[]> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is splitting a transaction into multiple separate transactions.
    return Promise.resolve([]);
}

export async function applyDiscount(transactionId: number, discountAmount: number, discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'): Promise<Transaction> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is applying discount to a transaction or specific items.
    return Promise.resolve({} as Transaction);
}

export async function generateReceipt(transactionId: number): Promise<{ receipt_data: any; receipt_html: string }> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is generating receipt data for printing or digital sharing.
    return Promise.resolve({ receipt_data: {}, receipt_html: '' });
}

export async function sendReceiptWhatsApp(transactionId: number, phoneNumber: string): Promise<boolean> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is sending receipt via WhatsApp integration.
    return Promise.resolve(true);
}

export async function sendReceiptEmail(transactionId: number, email: string): Promise<boolean> {
    // This is a placeholder declaration! Real code should be implemented here.
    // The goal of this handler is sending receipt via email.
    return Promise.resolve(true);
}