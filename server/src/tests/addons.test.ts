import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { addonsTable } from '../db/schema';
import { createAddon, getAddons, updateAddon, deactivateAddon } from '../handlers/addons';
import { eq } from 'drizzle-orm';

describe('Addon Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createAddon', () => {
    it('should create an addon with valid data', async () => {
      const result = await createAddon('Extra Cheese', 2.50);

      expect(result.name).toEqual('Extra Cheese');
      expect(result.price).toEqual(2.50);
      expect(typeof result.price).toEqual('number');
      expect(result.is_active).toEqual(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save addon to database correctly', async () => {
      const result = await createAddon('Bacon', 3.00);

      const addons = await db.select()
        .from(addonsTable)
        .where(eq(addonsTable.id, result.id))
        .execute();

      expect(addons).toHaveLength(1);
      expect(addons[0].name).toEqual('Bacon');
      expect(parseFloat(addons[0].price)).toEqual(3.00);
      expect(addons[0].is_active).toEqual(true);
    });

    it('should handle decimal prices correctly', async () => {
      const result = await createAddon('Premium Sauce', 1.99);

      expect(result.price).toEqual(1.99);
      expect(typeof result.price).toEqual('number');

      // Verify in database
      const addon = await db.select()
        .from(addonsTable)
        .where(eq(addonsTable.id, result.id))
        .execute();

      expect(parseFloat(addon[0].price)).toEqual(1.99);
    });
  });

  describe('getAddons', () => {
    beforeEach(async () => {
      // Create test addons - some active, some inactive
      await createAddon('Active Addon 1', 1.00);
      await createAddon('Active Addon 2', 2.00);
      
      // Create an inactive addon
      const inactiveAddon = await createAddon('Inactive Addon', 3.00);
      await db.update(addonsTable)
        .set({ is_active: false })
        .where(eq(addonsTable.id, inactiveAddon.id))
        .execute();
    });

    it('should get all addons when no filter is provided', async () => {
      const result = await getAddons();

      expect(result).toHaveLength(3);
      expect(result.every(addon => typeof addon.price === 'number')).toBe(true);
    });

    it('should get only active addons when isActive is true', async () => {
      const result = await getAddons(true);

      expect(result).toHaveLength(2);
      expect(result.every(addon => addon.is_active === true)).toBe(true);
      expect(result.every(addon => typeof addon.price === 'number')).toBe(true);
    });

    it('should get only inactive addons when isActive is false', async () => {
      const result = await getAddons(false);

      expect(result).toHaveLength(1);
      expect(result[0].is_active).toBe(false);
      expect(result[0].name).toEqual('Inactive Addon');
      expect(typeof result[0].price).toEqual('number');
    });

    it('should return empty array when no addons match filter', async () => {
      // Clear all addons first
      await db.delete(addonsTable).execute();

      const result = await getAddons(true);
      expect(result).toHaveLength(0);
    });

    it('should convert numeric price fields correctly', async () => {
      const result = await getAddons();

      result.forEach(addon => {
        expect(typeof addon.price).toEqual('number');
        expect(addon.price).toBeGreaterThan(0);
      });
    });
  });

  describe('updateAddon', () => {
    let testAddonId: number;

    beforeEach(async () => {
      const addon = await createAddon('Test Addon', 5.00);
      testAddonId = addon.id;
    });

    it('should update addon name only', async () => {
      const result = await updateAddon(testAddonId, 'Updated Name', undefined);

      expect(result.name).toEqual('Updated Name');
      expect(result.price).toEqual(5.00); // Price should remain unchanged
      expect(result.id).toEqual(testAddonId);
      expect(typeof result.price).toEqual('number');
    });

    it('should update addon price only', async () => {
      const result = await updateAddon(testAddonId, undefined, 7.99);

      expect(result.name).toEqual('Test Addon'); // Name should remain unchanged
      expect(result.price).toEqual(7.99);
      expect(result.id).toEqual(testAddonId);
      expect(typeof result.price).toEqual('number');
    });

    it('should update both name and price', async () => {
      const result = await updateAddon(testAddonId, 'Completely New', 10.50);

      expect(result.name).toEqual('Completely New');
      expect(result.price).toEqual(10.50);
      expect(result.id).toEqual(testAddonId);
      expect(typeof result.price).toEqual('number');
    });

    it('should update updated_at timestamp', async () => {
      const originalAddon = await db.select()
        .from(addonsTable)
        .where(eq(addonsTable.id, testAddonId))
        .execute();

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = await updateAddon(testAddonId, 'New Name');

      expect(result.updated_at.getTime()).toBeGreaterThan(originalAddon[0].updated_at.getTime());
    });

    it('should persist changes to database', async () => {
      await updateAddon(testAddonId, 'Persisted Name', 12.34);

      const addon = await db.select()
        .from(addonsTable)
        .where(eq(addonsTable.id, testAddonId))
        .execute();

      expect(addon[0].name).toEqual('Persisted Name');
      expect(parseFloat(addon[0].price)).toEqual(12.34);
    });

    it('should throw error when addon does not exist', async () => {
      await expect(updateAddon(99999, 'Non-existent')).rejects.toThrow(/not found/i);
    });
  });

  describe('deactivateAddon', () => {
    let activeAddonId: number;
    let inactiveAddonId: number;

    beforeEach(async () => {
      const activeAddon = await createAddon('Active Addon', 3.00);
      activeAddonId = activeAddon.id;

      // Create an already inactive addon
      const inactiveAddon = await createAddon('Inactive Addon', 4.00);
      inactiveAddonId = inactiveAddon.id;
      await db.update(addonsTable)
        .set({ is_active: false })
        .where(eq(addonsTable.id, inactiveAddonId))
        .execute();
    });

    it('should deactivate an active addon', async () => {
      const result = await deactivateAddon(activeAddonId);

      expect(result).toBe(true);

      // Verify in database
      const addon = await db.select()
        .from(addonsTable)
        .where(eq(addonsTable.id, activeAddonId))
        .execute();

      expect(addon[0].is_active).toBe(false);
    });

    it('should update updated_at timestamp when deactivating', async () => {
      const originalAddon = await db.select()
        .from(addonsTable)
        .where(eq(addonsTable.id, activeAddonId))
        .execute();

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await deactivateAddon(activeAddonId);

      const updatedAddon = await db.select()
        .from(addonsTable)
        .where(eq(addonsTable.id, activeAddonId))
        .execute();

      expect(updatedAddon[0].updated_at.getTime()).toBeGreaterThan(originalAddon[0].updated_at.getTime());
    });

    it('should return false when trying to deactivate already inactive addon', async () => {
      const result = await deactivateAddon(inactiveAddonId);

      expect(result).toBe(false);
    });

    it('should return false when addon does not exist', async () => {
      const result = await deactivateAddon(99999);

      expect(result).toBe(false);
    });

    it('should not affect other addons', async () => {
      const otherAddon = await createAddon('Other Addon', 6.00);

      await deactivateAddon(activeAddonId);

      // Verify other addon remains active
      const addon = await db.select()
        .from(addonsTable)
        .where(eq(addonsTable.id, otherAddon.id))
        .execute();

      expect(addon[0].is_active).toBe(true);
    });
  });
});