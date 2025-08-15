import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { branchesTable } from '../db/schema';
import { type CreateBranchInput } from '../schema';
import { 
  createBranch, 
  getBranches, 
  getBranchById, 
  updateBranch, 
  deactivateBranch 
} from '../handlers/branches';
import { eq } from 'drizzle-orm';

// Test inputs
const testBranchInput: CreateBranchInput = {
  name: 'Main Branch',
  address: '123 Business Street, City Center',
  phone: '+1234567890',
  email: 'main@business.com'
};

const testBranchInput2: CreateBranchInput = {
  name: 'Downtown Branch',
  address: '456 Commerce Ave, Downtown',
  phone: '+0987654321',
  email: 'downtown@business.com'
};

describe('Branch Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createBranch', () => {
    it('should create a branch with all fields', async () => {
      const result = await createBranch(testBranchInput);

      expect(result.name).toEqual('Main Branch');
      expect(result.address).toEqual('123 Business Street, City Center');
      expect(result.phone).toEqual('+1234567890');
      expect(result.email).toEqual('main@business.com');
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a branch with minimal fields', async () => {
      const minimalInput: CreateBranchInput = {
        name: 'Minimal Branch',
        address: null,
        phone: null,
        email: null
      };

      const result = await createBranch(minimalInput);

      expect(result.name).toEqual('Minimal Branch');
      expect(result.address).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.email).toBeNull();
      expect(result.is_active).toBe(true);
      expect(result.id).toBeDefined();
    });

    it('should save branch to database', async () => {
      const result = await createBranch(testBranchInput);

      const branches = await db.select()
        .from(branchesTable)
        .where(eq(branchesTable.id, result.id))
        .execute();

      expect(branches).toHaveLength(1);
      expect(branches[0].name).toEqual('Main Branch');
      expect(branches[0].address).toEqual('123 Business Street, City Center');
      expect(branches[0].is_active).toBe(true);
    });
  });

  describe('getBranches', () => {
    it('should return empty array when no branches exist', async () => {
      const result = await getBranches();
      expect(result).toHaveLength(0);
    });

    it('should return all active branches', async () => {
      await createBranch(testBranchInput);
      await createBranch(testBranchInput2);

      const result = await getBranches();

      expect(result).toHaveLength(2);
      expect(result[0].name).toEqual('Main Branch');
      expect(result[1].name).toEqual('Downtown Branch');
      expect(result[0].is_active).toBe(true);
      expect(result[1].is_active).toBe(true);
    });

    it('should not return deactivated branches', async () => {
      const branch1 = await createBranch(testBranchInput);
      const branch2 = await createBranch(testBranchInput2);

      // Deactivate one branch
      await deactivateBranch(branch1.id);

      const result = await getBranches();

      expect(result).toHaveLength(1);
      expect(result[0].name).toEqual('Downtown Branch');
    });
  });

  describe('getBranchById', () => {
    it('should return null for non-existent branch', async () => {
      const result = await getBranchById(999);
      expect(result).toBeNull();
    });

    it('should return branch by ID', async () => {
      const createdBranch = await createBranch(testBranchInput);

      const result = await getBranchById(createdBranch.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdBranch.id);
      expect(result!.name).toEqual('Main Branch');
      expect(result!.address).toEqual('123 Business Street, City Center');
    });

    it('should return deactivated branch by ID', async () => {
      const createdBranch = await createBranch(testBranchInput);
      await deactivateBranch(createdBranch.id);

      const result = await getBranchById(createdBranch.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdBranch.id);
      expect(result!.is_active).toBe(false);
    });
  });

  describe('updateBranch', () => {
    it('should update all fields', async () => {
      const createdBranch = await createBranch(testBranchInput);

      const updateData: Partial<CreateBranchInput> = {
        name: 'Updated Main Branch',
        address: '789 New Address, Updated City',
        phone: '+1111111111',
        email: 'updated@business.com'
      };

      const result = await updateBranch(createdBranch.id, updateData);

      expect(result.id).toEqual(createdBranch.id);
      expect(result.name).toEqual('Updated Main Branch');
      expect(result.address).toEqual('789 New Address, Updated City');
      expect(result.phone).toEqual('+1111111111');
      expect(result.email).toEqual('updated@business.com');
      expect(result.updated_at.getTime()).toBeGreaterThan(result.created_at.getTime());
    });

    it('should update partial fields', async () => {
      const createdBranch = await createBranch(testBranchInput);

      const updateData: Partial<CreateBranchInput> = {
        name: 'Partially Updated Branch'
      };

      const result = await updateBranch(createdBranch.id, updateData);

      expect(result.name).toEqual('Partially Updated Branch');
      expect(result.address).toEqual(testBranchInput.address); // Should remain unchanged
      expect(result.phone).toEqual(testBranchInput.phone); // Should remain unchanged
    });

    it('should throw error for non-existent branch', async () => {
      const updateData: Partial<CreateBranchInput> = {
        name: 'Non-existent Branch'
      };

      await expect(updateBranch(999, updateData)).rejects.toThrow(/not found/i);
    });

    it('should save changes to database', async () => {
      const createdBranch = await createBranch(testBranchInput);

      const updateData: Partial<CreateBranchInput> = {
        name: 'Database Updated Branch'
      };

      await updateBranch(createdBranch.id, updateData);

      const branches = await db.select()
        .from(branchesTable)
        .where(eq(branchesTable.id, createdBranch.id))
        .execute();

      expect(branches).toHaveLength(1);
      expect(branches[0].name).toEqual('Database Updated Branch');
    });
  });

  describe('deactivateBranch', () => {
    it('should deactivate existing branch', async () => {
      const createdBranch = await createBranch(testBranchInput);

      const result = await deactivateBranch(createdBranch.id);

      expect(result).toBe(true);

      // Verify in database
      const branches = await db.select()
        .from(branchesTable)
        .where(eq(branchesTable.id, createdBranch.id))
        .execute();

      expect(branches).toHaveLength(1);
      expect(branches[0].is_active).toBe(false);
      expect(branches[0].updated_at.getTime()).toBeGreaterThan(branches[0].created_at.getTime());
    });

    it('should return false for non-existent branch', async () => {
      const result = await deactivateBranch(999);
      expect(result).toBe(false);
    });

    it('should work on already deactivated branch', async () => {
      const createdBranch = await createBranch(testBranchInput);
      await deactivateBranch(createdBranch.id); // First deactivation

      const result = await deactivateBranch(createdBranch.id); // Second deactivation

      expect(result).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete branch lifecycle', async () => {
      // Create
      const createdBranch = await createBranch(testBranchInput);
      expect(createdBranch.id).toBeDefined();

      // Read by ID
      const fetchedBranch = await getBranchById(createdBranch.id);
      expect(fetchedBranch).not.toBeNull();

      // Update
      const updatedBranch = await updateBranch(createdBranch.id, { name: 'Lifecycle Branch' });
      expect(updatedBranch.name).toEqual('Lifecycle Branch');

      // Verify in list
      let branches = await getBranches();
      expect(branches).toHaveLength(1);
      expect(branches[0].name).toEqual('Lifecycle Branch');

      // Deactivate
      const deactivated = await deactivateBranch(createdBranch.id);
      expect(deactivated).toBe(true);

      // Should not appear in active list
      branches = await getBranches();
      expect(branches).toHaveLength(0);

      // But should still be fetchable by ID
      const deactivatedBranch = await getBranchById(createdBranch.id);
      expect(deactivatedBranch).not.toBeNull();
      expect(deactivatedBranch!.is_active).toBe(false);
    });

    it('should handle multiple branches correctly', async () => {
      const branch1 = await createBranch(testBranchInput);
      const branch2 = await createBranch(testBranchInput2);

      let branches = await getBranches();
      expect(branches).toHaveLength(2);

      // Deactivate one
      await deactivateBranch(branch1.id);
      branches = await getBranches();
      expect(branches).toHaveLength(1);
      expect(branches[0].id).toEqual(branch2.id);
    });
  });
});