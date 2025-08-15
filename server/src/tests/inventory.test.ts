import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { branchesTable, usersTable, productsTable, productCategoriesTable, stockTable, stockMovementsTable } from '../db/schema';
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
} from '../handlers/inventory';
import { eq, and } from 'drizzle-orm';

describe('Inventory Management', () => {
  let branchId: number;
  let secondBranchId: number;
  let userId: number;
  let productId: number;
  let categoryId: number;

  beforeEach(async () => {
    await createDB();

    // Create test branch
    const branchResult = await db.insert(branchesTable)
      .values({
        name: 'Test Branch',
        address: '123 Test St',
        phone: '123-456-7890',
        email: 'test@branch.com',
        is_active: true
      })
      .returning()
      .execute();
    branchId = branchResult[0].id;

    // Create second test branch for transfers
    const secondBranchResult = await db.insert(branchesTable)
      .values({
        name: 'Second Branch',
        address: '456 Test Ave',
        phone: '098-765-4321',
        email: 'second@branch.com',
        is_active: true
      })
      .returning()
      .execute();
    secondBranchId = secondBranchResult[0].id;

    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'test@user.com',
        password_hash: 'hashedpassword',
        full_name: 'Test User',
        role: 'MANAGER',
        branch_id: branchId,
        is_active: true,
        two_factor_enabled: false
      })
      .returning()
      .execute();
    userId = userResult[0].id;

    // Create test category
    const categoryResult = await db.insert(productCategoriesTable)
      .values({
        name: 'Test Category',
        description: 'A category for testing',
        is_active: true
      })
      .returning()
      .execute();
    categoryId = categoryResult[0].id;

    // Create test product
    const productResult = await db.insert(productsTable)
      .values({
        sku: 'TEST-001',
        name: 'Test Product',
        description: 'A product for testing inventory',
        category_id: categoryId,
        base_price: '10.00',
        selling_price: '15.00',
        unit: 'pcs',
        min_stock: 10,
        is_active: true,
        has_variants: false,
        is_raw_material: false
      })
      .returning()
      .execute();
    productId = productResult[0].id;
  });

  afterEach(resetDB);

  describe('getStockByBranch', () => {
    it('should return empty array when no stock exists', async () => {
      const result = await getStockByBranch(branchId);
      expect(result).toEqual([]);
    });

    it('should return stock for branch', async () => {
      // Create stock record
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 100,
          reserved_quantity: 10
        })
        .execute();

      const result = await getStockByBranch(branchId);
      
      expect(result).toHaveLength(1);
      expect(result[0].product_id).toEqual(productId);
      expect(result[0].branch_id).toEqual(branchId);
      expect(result[0].quantity).toEqual(100);
      expect(result[0].reserved_quantity).toEqual(10);
      expect(result[0].last_updated).toBeInstanceOf(Date);
    });

    it('should filter by product ID when provided', async () => {
      // Create stock for multiple products
      const secondProductResult = await db.insert(productsTable)
        .values({
          sku: 'TEST-002',
          name: 'Second Product',
          category_id: categoryId,
          base_price: '5.00',
          selling_price: '8.00',
          unit: 'pcs',
          min_stock: 5,
          is_active: true,
          has_variants: false,
          is_raw_material: false
        })
        .returning()
        .execute();

      await db.insert(stockTable)
        .values([
          {
            product_id: productId,
            branch_id: branchId,
            quantity: 100,
            reserved_quantity: 0
          },
          {
            product_id: secondProductResult[0].id,
            branch_id: branchId,
            quantity: 50,
            reserved_quantity: 0
          }
        ])
        .execute();

      const result = await getStockByBranch(branchId, productId);
      
      expect(result).toHaveLength(1);
      expect(result[0].product_id).toEqual(productId);
    });
  });

  describe('updateStock', () => {
    it('should create new stock record for IN movement', async () => {
      const result = await updateStock(productId, branchId, 50, 'IN', userId, 'Initial stock');
      
      expect(result.product_id).toEqual(productId);
      expect(result.branch_id).toEqual(branchId);
      expect(result.quantity).toEqual(50);
      expect(result.reserved_quantity).toEqual(0);
      expect(result.last_updated).toBeInstanceOf(Date);

      // Verify stock movement was created
      const movements = await db.select()
        .from(stockMovementsTable)
        .where(eq(stockMovementsTable.product_id, productId))
        .execute();

      expect(movements).toHaveLength(1);
      expect(movements[0].movement_type).toEqual('IN');
      expect(movements[0].quantity).toEqual(50);
    });

    it('should update existing stock for IN movement', async () => {
      // Create initial stock
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 30,
          reserved_quantity: 0
        })
        .execute();

      const result = await updateStock(productId, branchId, 20, 'IN', userId);
      
      expect(result.quantity).toEqual(50);
    });

    it('should decrease stock for OUT movement', async () => {
      // Create initial stock
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 30,
          reserved_quantity: 0
        })
        .execute();

      const result = await updateStock(productId, branchId, 10, 'OUT', userId);
      
      expect(result.quantity).toEqual(20);

      // Verify movement record
      const movements = await db.select()
        .from(stockMovementsTable)
        .where(eq(stockMovementsTable.product_id, productId))
        .execute();

      expect(movements[0].quantity).toEqual(-10);
    });

    it('should throw error for insufficient stock on OUT movement', async () => {
      // Create initial stock
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 5,
          reserved_quantity: 0
        })
        .execute();

      await expect(updateStock(productId, branchId, 10, 'OUT', userId))
        .rejects.toThrow(/insufficient stock/i);
    });

    it('should set exact quantity for ADJUSTMENT movement', async () => {
      // Create initial stock
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 30,
          reserved_quantity: 0
        })
        .execute();

      const result = await updateStock(productId, branchId, 100, 'ADJUSTMENT', userId, 'Inventory count');
      
      expect(result.quantity).toEqual(100);
    });
  });

  describe('transferStock', () => {
    it('should transfer stock between branches', async () => {
      // Create stock in source branch
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 50,
          reserved_quantity: 0
        })
        .execute();

      const result = await transferStock(productId, branchId, secondBranchId, 20, userId);
      
      expect(result).toBe(true);

      // Check source branch stock
      const sourceStock = await db.select()
        .from(stockTable)
        .where(and(eq(stockTable.product_id, productId), eq(stockTable.branch_id, branchId)))
        .execute();

      expect(sourceStock[0].quantity).toEqual(30);

      // Check destination branch stock
      const destStock = await db.select()
        .from(stockTable)
        .where(and(eq(stockTable.product_id, productId), eq(stockTable.branch_id, secondBranchId)))
        .execute();

      expect(destStock[0].quantity).toEqual(20);
    });

    it('should throw error for insufficient stock', async () => {
      // Create insufficient stock
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 5,
          reserved_quantity: 0
        })
        .execute();

      await expect(transferStock(productId, branchId, secondBranchId, 10, userId))
        .rejects.toThrow(/insufficient stock/i);
    });

    it('should throw error when source stock does not exist', async () => {
      await expect(transferStock(productId, branchId, secondBranchId, 10, userId))
        .rejects.toThrow(/insufficient stock/i);
    });
  });

  describe('getStockMovements', () => {
    it('should return movements for branch', async () => {
      // Create some stock movements
      await updateStock(productId, branchId, 50, 'IN', userId, 'Initial stock');
      await updateStock(productId, branchId, 10, 'OUT', userId, 'Sale');

      const result = await getStockMovements(branchId);
      
      expect(result).toHaveLength(2);
      expect(result[0].movement_type).toEqual('IN');
      expect(result[1].movement_type).toEqual('OUT');
    });

    it('should filter by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await updateStock(productId, branchId, 50, 'IN', userId);

      const result = await getStockMovements(branchId, yesterday, tomorrow);
      
      expect(result.length).toBeGreaterThan(0);
      result.forEach(movement => {
        expect(movement.created_at >= yesterday).toBe(true);
        expect(movement.created_at <= tomorrow).toBe(true);
      });
    });
  });

  describe('adjustStock', () => {
    it('should adjust stock to new quantity', async () => {
      // Create initial stock
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 30,
          reserved_quantity: 0
        })
        .execute();

      const result = await adjustStock(productId, branchId, 75, userId, 'Inventory adjustment');
      
      expect(result.quantity).toEqual(75);
    });
  });

  describe('reserveStock', () => {
    it('should reserve available stock', async () => {
      // Create stock
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 50,
          reserved_quantity: 0
        })
        .execute();

      const result = await reserveStock(productId, branchId, 20);
      
      expect(result).toBe(true);

      // Check reserved quantity updated
      const stock = await db.select()
        .from(stockTable)
        .where(and(eq(stockTable.product_id, productId), eq(stockTable.branch_id, branchId)))
        .execute();

      expect(stock[0].reserved_quantity).toEqual(20);
    });

    it('should throw error for insufficient available stock', async () => {
      // Create stock with some already reserved
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 50,
          reserved_quantity: 40
        })
        .execute();

      await expect(reserveStock(productId, branchId, 20))
        .rejects.toThrow(/insufficient available stock/i);
    });

    it('should throw error when stock record not found', async () => {
      await expect(reserveStock(productId, branchId, 10))
        .rejects.toThrow(/stock record not found/i);
    });
  });

  describe('releaseReservedStock', () => {
    it('should release reserved stock', async () => {
      // Create stock with reserved quantity
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 50,
          reserved_quantity: 20
        })
        .execute();

      const result = await releaseReservedStock(productId, branchId, 10);
      
      expect(result).toBe(true);

      // Check reserved quantity updated
      const stock = await db.select()
        .from(stockTable)
        .where(and(eq(stockTable.product_id, productId), eq(stockTable.branch_id, branchId)))
        .execute();

      expect(stock[0].reserved_quantity).toEqual(10);
    });

    it('should throw error when releasing more than reserved', async () => {
      // Create stock with reserved quantity
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 50,
          reserved_quantity: 10
        })
        .execute();

      await expect(releaseReservedStock(productId, branchId, 20))
        .rejects.toThrow(/cannot release more than reserved/i);
    });

    it('should throw error when stock record not found', async () => {
      await expect(releaseReservedStock(productId, branchId, 10))
        .rejects.toThrow(/stock record not found/i);
    });
  });

  describe('getStockAlerts', () => {
    it('should return products with low stock', async () => {
      // Create stock below minimum
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 5, // Below min_stock of 10
          reserved_quantity: 0
        })
        .execute();

      const result = await getStockAlerts();
      
      expect(result).toHaveLength(1);
      expect(result[0].product_id).toEqual(productId);
      expect(result[0].product_name).toEqual('Test Product');
      expect(result[0].current_stock).toEqual(5);
      expect(result[0].min_stock).toEqual(10);
      expect(result[0].branch_name).toEqual('Test Branch');
    });

    it('should filter by branch when provided', async () => {
      // Create stock below minimum in both branches
      await db.insert(stockTable)
        .values([
          {
            product_id: productId,
            branch_id: branchId,
            quantity: 5,
            reserved_quantity: 0
          },
          {
            product_id: productId,
            branch_id: secondBranchId,
            quantity: 3,
            reserved_quantity: 0
          }
        ])
        .execute();

      const result = await getStockAlerts(branchId);
      
      expect(result).toHaveLength(1);
      expect(result[0].branch_name).toEqual('Test Branch');
    });

    it('should not return inactive products', async () => {
      // Deactivate the product
      await db.update(productsTable)
        .set({ is_active: false })
        .where(eq(productsTable.id, productId))
        .execute();

      // Create stock below minimum
      await db.insert(stockTable)
        .values({
          product_id: productId,
          branch_id: branchId,
          quantity: 5,
          reserved_quantity: 0
        })
        .execute();

      const result = await getStockAlerts();
      
      expect(result).toHaveLength(0);
    });
  });

  describe('bulkStockUpdate', () => {
    it('should update multiple stock records', async () => {
      // Create second product
      const secondProductResult = await db.insert(productsTable)
        .values({
          sku: 'TEST-002',
          name: 'Second Product',
          category_id: categoryId,
          base_price: '5.00',
          selling_price: '8.00',
          unit: 'pcs',
          min_stock: 5,
          is_active: true,
          has_variants: false,
          is_raw_material: false
        })
        .returning()
        .execute();

      const updates = [
        { product_id: productId, branch_id: branchId, quantity: 100 },
        { product_id: secondProductResult[0].id, branch_id: branchId, quantity: 75 }
      ];

      const result = await bulkStockUpdate(updates, userId);
      
      expect(result).toBe(true);

      // Verify stock records were created/updated
      const stocks = await db.select()
        .from(stockTable)
        .where(eq(stockTable.branch_id, branchId))
        .execute();

      expect(stocks).toHaveLength(2);
      
      const product1Stock = stocks.find(s => s.product_id === productId);
      const product2Stock = stocks.find(s => s.product_id === secondProductResult[0].id);
      
      expect(product1Stock?.quantity).toEqual(100);
      expect(product2Stock?.quantity).toEqual(75);

      // Verify movement records were created
      const movements = await db.select()
        .from(stockMovementsTable)
        .where(eq(stockMovementsTable.branch_id, branchId))
        .execute();

      expect(movements).toHaveLength(2);
      expect(movements.every(m => m.movement_type === 'ADJUSTMENT')).toBe(true);
      expect(movements.every(m => m.notes === 'Bulk stock update')).toBe(true);
    });
  });
});