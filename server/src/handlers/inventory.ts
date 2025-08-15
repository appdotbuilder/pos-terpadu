import { db } from '../db';
import { stockTable, stockMovementsTable, productsTable, branchesTable } from '../db/schema';
import { type Stock, type StockMovement, type StockMovementType } from '../schema';
import { eq, and, gte, lte, lt, SQL } from 'drizzle-orm';

export async function getStockByBranch(branchId: number, productId?: number): Promise<Stock[]> {
  try {
    const conditions: SQL<unknown>[] = [eq(stockTable.branch_id, branchId)];
    
    if (productId !== undefined) {
      conditions.push(eq(stockTable.product_id, productId));
    }
    
    const results = await db.select()
      .from(stockTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .execute();
    
    return results.map(stock => ({
      ...stock,
      last_updated: new Date(stock.last_updated)
    }));
  } catch (error) {
    console.error('Get stock by branch failed:', error);
    throw error;
  }
}

export async function updateStock(productId: number, branchId: number, quantity: number, movementType: StockMovementType, userId: number, notes?: string): Promise<Stock> {
  try {
    // Check if stock record exists
    const existingStock = await db.select()
      .from(stockTable)
      .where(and(eq(stockTable.product_id, productId), eq(stockTable.branch_id, branchId)))
      .execute();

    let stockResult;
    
    if (existingStock.length === 0) {
      // Create new stock record
      let initialQuantity = 0;
      if (movementType === 'IN') {
        initialQuantity = quantity;
      } else if (movementType === 'ADJUSTMENT') {
        initialQuantity = quantity;
      }
      
      stockResult = await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: initialQuantity,
          reserved_quantity: 0,
          last_updated: new Date()
        })
        .returning()
        .execute();
    } else {
      // Update existing stock
      const currentStock = existingStock[0];
      let newQuantity = currentStock.quantity;
      
      if (movementType === 'IN') {
        newQuantity += quantity;
      } else if (movementType === 'OUT') {
        newQuantity -= quantity;
        if (newQuantity < 0) {
          throw new Error('Insufficient stock');
        }
      } else if (movementType === 'ADJUSTMENT') {
        newQuantity = quantity;
      }
      
      stockResult = await db.update(stockTable)
        .set({
          quantity: newQuantity,
          last_updated: new Date()
        })
        .where(eq(stockTable.id, currentStock.id))
        .returning()
        .execute();
    }

    // Create stock movement record
    await db.insert(stockMovementsTable)
      .values({
        product_id: productId,
        branch_id: branchId,
        movement_type: movementType,
        quantity: movementType === 'OUT' ? -quantity : quantity,
        notes: notes || null,
        user_id: userId,
        created_at: new Date()
      })
      .execute();

    const stock = stockResult[0];
    return {
      ...stock,
      last_updated: new Date(stock.last_updated)
    };
  } catch (error) {
    console.error('Update stock failed:', error);
    throw error;
  }
}

export async function transferStock(productId: number, fromBranchId: number, toBranchId: number, quantity: number, userId: number): Promise<boolean> {
  try {
    // Check source stock availability
    const sourceStock = await db.select()
      .from(stockTable)
      .where(and(eq(stockTable.product_id, productId), eq(stockTable.branch_id, fromBranchId)))
      .execute();

    if (sourceStock.length === 0 || sourceStock[0].quantity < quantity) {
      throw new Error('Insufficient stock for transfer');
    }

    // Remove stock from source branch
    await updateStock(productId, fromBranchId, quantity, 'OUT', userId, `Transfer to branch ${toBranchId}`);
    
    // Add stock to destination branch
    await updateStock(productId, toBranchId, quantity, 'IN', userId, `Transfer from branch ${fromBranchId}`);

    return true;
  } catch (error) {
    console.error('Transfer stock failed:', error);
    throw error;
  }
}

export async function getStockMovements(branchId: number, startDate?: Date, endDate?: Date): Promise<StockMovement[]> {
  try {
    const conditions: SQL<unknown>[] = [eq(stockMovementsTable.branch_id, branchId)];
    
    if (startDate) {
      conditions.push(gte(stockMovementsTable.created_at, startDate));
    }
    
    if (endDate) {
      conditions.push(lte(stockMovementsTable.created_at, endDate));
    }
    
    const results = await db.select()
      .from(stockMovementsTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .execute();
    
    return results.map(movement => ({
      ...movement,
      created_at: new Date(movement.created_at)
    }));
  } catch (error) {
    console.error('Get stock movements failed:', error);
    throw error;
  }
}

export async function adjustStock(productId: number, branchId: number, newQuantity: number, userId: number, reason: string): Promise<Stock> {
  try {
    return await updateStock(productId, branchId, newQuantity, 'ADJUSTMENT', userId, reason);
  } catch (error) {
    console.error('Adjust stock failed:', error);
    throw error;
  }
}

export async function reserveStock(productId: number, branchId: number, quantity: number): Promise<boolean> {
  try {
    // Check if enough stock is available
    const stock = await db.select()
      .from(stockTable)
      .where(and(eq(stockTable.product_id, productId), eq(stockTable.branch_id, branchId)))
      .execute();

    if (stock.length === 0) {
      throw new Error('Stock record not found');
    }

    const currentStock = stock[0];
    const availableQuantity = currentStock.quantity - currentStock.reserved_quantity;
    
    if (availableQuantity < quantity) {
      throw new Error('Insufficient available stock for reservation');
    }

    // Update reserved quantity
    await db.update(stockTable)
      .set({
        reserved_quantity: currentStock.reserved_quantity + quantity,
        last_updated: new Date()
      })
      .where(eq(stockTable.id, currentStock.id))
      .execute();

    return true;
  } catch (error) {
    console.error('Reserve stock failed:', error);
    throw error;
  }
}

export async function releaseReservedStock(productId: number, branchId: number, quantity: number): Promise<boolean> {
  try {
    const stock = await db.select()
      .from(stockTable)
      .where(and(eq(stockTable.product_id, productId), eq(stockTable.branch_id, branchId)))
      .execute();

    if (stock.length === 0) {
      throw new Error('Stock record not found');
    }

    const currentStock = stock[0];
    
    if (currentStock.reserved_quantity < quantity) {
      throw new Error('Cannot release more than reserved quantity');
    }

    // Update reserved quantity
    await db.update(stockTable)
      .set({
        reserved_quantity: currentStock.reserved_quantity - quantity,
        last_updated: new Date()
      })
      .where(eq(stockTable.id, currentStock.id))
      .execute();

    return true;
  } catch (error) {
    console.error('Release reserved stock failed:', error);
    throw error;
  }
}

export async function getStockAlerts(branchId?: number): Promise<Array<{ product_id: number; product_name: string; current_stock: number; min_stock: number; branch_name: string }>> {
  try {
    const conditions: SQL<unknown>[] = [
      lt(stockTable.quantity, productsTable.min_stock),
      eq(productsTable.is_active, true)
    ];

    if (branchId !== undefined) {
      conditions.push(eq(stockTable.branch_id, branchId));
    }

    const results = await db.select({
      product_id: stockTable.product_id,
      product_name: productsTable.name,
      current_stock: stockTable.quantity,
      min_stock: productsTable.min_stock,
      branch_name: branchesTable.name
    })
    .from(stockTable)
    .innerJoin(productsTable, eq(stockTable.product_id, productsTable.id))
    .innerJoin(branchesTable, eq(stockTable.branch_id, branchesTable.id))
    .where(and(...conditions))
    .execute();
    
    return results;
  } catch (error) {
    console.error('Get stock alerts failed:', error);
    throw error;
  }
}

export async function bulkStockUpdate(updates: Array<{ product_id: number; branch_id: number; quantity: number }>, userId: number): Promise<boolean> {
  try {
    for (const update of updates) {
      await updateStock(
        update.product_id,
        update.branch_id,
        update.quantity,
        'ADJUSTMENT',
        userId,
        'Bulk stock update'
      );
    }
    
    return true;
  } catch (error) {
    console.error('Bulk stock update failed:', error);
    throw error;
  }
}