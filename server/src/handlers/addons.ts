import { db } from '../db';
import { addonsTable } from '../db/schema';
import { type Addon } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createAddon(name: string, price: number): Promise<Addon> {
  try {
    const result = await db.insert(addonsTable)
      .values({
        name: name,
        price: price.toString() // Convert number to string for numeric column
      })
      .returning()
      .execute();

    const addon = result[0];
    return {
      ...addon,
      price: parseFloat(addon.price) // Convert string back to number
    };
  } catch (error) {
    console.error('Addon creation failed:', error);
    throw error;
  }
}

export async function getAddons(isActive?: boolean): Promise<Addon[]> {
  try {
    // Build query with conditional where clause
    const query = isActive !== undefined
      ? db.select().from(addonsTable).where(eq(addonsTable.is_active, isActive))
      : db.select().from(addonsTable);

    const results = await query.execute();

    // Convert numeric fields back to numbers
    return results.map(addon => ({
      ...addon,
      price: parseFloat(addon.price)
    }));
  } catch (error) {
    console.error('Get addons failed:', error);
    throw error;
  }
}

export async function updateAddon(addonId: number, name?: string, price?: number): Promise<Addon> {
  try {
    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (name !== undefined) {
      updateData.name = name;
    }

    if (price !== undefined) {
      updateData.price = price.toString(); // Convert number to string for numeric column
    }

    const result = await db.update(addonsTable)
      .set(updateData)
      .where(eq(addonsTable.id, addonId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Addon not found');
    }

    const addon = result[0];
    return {
      ...addon,
      price: parseFloat(addon.price) // Convert string back to number
    };
  } catch (error) {
    console.error('Addon update failed:', error);
    throw error;
  }
}

export async function deactivateAddon(addonId: number): Promise<boolean> {
  try {
    const result = await db.update(addonsTable)
      .set({
        is_active: false,
        updated_at: new Date()
      })
      .where(and(
        eq(addonsTable.id, addonId),
        eq(addonsTable.is_active, true) // Only deactivate if currently active
      ))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Addon deactivation failed:', error);
    throw error;
  }
}