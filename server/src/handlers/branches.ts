import { db } from '../db';
import { branchesTable } from '../db/schema';
import { type CreateBranchInput, type Branch } from '../schema';
import { eq } from 'drizzle-orm';

export const createBranch = async (input: CreateBranchInput): Promise<Branch> => {
  try {
    const result = await db.insert(branchesTable)
      .values({
        name: input.name,
        address: input.address,
        phone: input.phone,
        email: input.email
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Branch creation failed:', error);
    throw error;
  }
};

export const getBranches = async (): Promise<Branch[]> => {
  try {
    const results = await db.select()
      .from(branchesTable)
      .where(eq(branchesTable.is_active, true))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to fetch branches:', error);
    throw error;
  }
};

export const getBranchById = async (branchId: number): Promise<Branch | null> => {
  try {
    const results = await db.select()
      .from(branchesTable)
      .where(eq(branchesTable.id, branchId))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to fetch branch by ID:', error);
    throw error;
  }
};

export const updateBranch = async (branchId: number, input: Partial<CreateBranchInput>): Promise<Branch> => {
  try {
    const result = await db.update(branchesTable)
      .set({
        ...input,
        updated_at: new Date()
      })
      .where(eq(branchesTable.id, branchId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`Branch with ID ${branchId} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('Branch update failed:', error);
    throw error;
  }
};

export const deactivateBranch = async (branchId: number): Promise<boolean> => {
  try {
    const result = await db.update(branchesTable)
      .set({
        is_active: false,
        updated_at: new Date()
      })
      .where(eq(branchesTable.id, branchId))
      .returning()
      .execute();

    return result.length > 0;
  } catch (error) {
    console.error('Branch deactivation failed:', error);
    throw error;
  }
};