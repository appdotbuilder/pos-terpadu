import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { shiftsTable, usersTable, branchesTable } from '../db/schema';
import { startShift } from '../handlers/shifts';
import { eq, and, isNull } from 'drizzle-orm';

describe('startShift', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data setup
  let testUserId: number;
  let testBranchId: number;

  beforeEach(async () => {
    // Create test branch
    const branchResult = await db.insert(branchesTable)
      .values({
        name: 'Test Branch',
        address: '123 Test St',
        phone: '555-0123',
        email: 'test@branch.com'
      })
      .returning()
      .execute();
    testBranchId = branchResult[0].id;

    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        email: 'cashier@test.com',
        password_hash: 'hashed_password',
        full_name: 'Test Cashier',
        role: 'CASHIER',
        branch_id: testBranchId
      })
      .returning()
      .execute();
    testUserId = userResult[0].id;
  });

  it('should start a new shift successfully', async () => {
    const openingCash = 100.50;

    const result = await startShift(testUserId, testBranchId, openingCash);

    // Basic field validation
    expect(result.user_id).toEqual(testUserId);
    expect(result.branch_id).toEqual(testBranchId);
    expect(result.opening_cash).toEqual(100.50);
    expect(result.closing_cash).toBeNull();
    expect(result.total_sales).toEqual(0);
    expect(result.end_time).toBeNull();
    expect(result.notes).toBeNull();
    expect(result.id).toBeDefined();
    expect(result.start_time).toBeInstanceOf(Date);

    // Verify numeric type conversions
    expect(typeof result.opening_cash).toBe('number');
    expect(typeof result.total_sales).toBe('number');
  });

  it('should save shift to database correctly', async () => {
    const openingCash = 250.75;

    const result = await startShift(testUserId, testBranchId, openingCash);

    // Query database directly to verify storage
    const shifts = await db.select()
      .from(shiftsTable)
      .where(eq(shiftsTable.id, result.id))
      .execute();

    expect(shifts).toHaveLength(1);
    const dbShift = shifts[0];
    
    expect(dbShift.user_id).toEqual(testUserId);
    expect(dbShift.branch_id).toEqual(testBranchId);
    expect(parseFloat(dbShift.opening_cash)).toEqual(250.75);
    expect(dbShift.closing_cash).toBeNull();
    expect(parseFloat(dbShift.total_sales)).toEqual(0);
    expect(dbShift.end_time).toBeNull();
    expect(dbShift.start_time).toBeInstanceOf(Date);
  });

  it('should handle zero opening cash', async () => {
    const result = await startShift(testUserId, testBranchId, 0);

    expect(result.opening_cash).toEqual(0);
    expect(typeof result.opening_cash).toBe('number');
  });

  it('should handle decimal opening cash amounts', async () => {
    const openingCash = 99.99;

    const result = await startShift(testUserId, testBranchId, openingCash);

    expect(result.opening_cash).toEqual(99.99);
    
    // Verify in database
    const shifts = await db.select()
      .from(shiftsTable)
      .where(eq(shiftsTable.id, result.id))
      .execute();

    expect(parseFloat(shifts[0].opening_cash)).toEqual(99.99);
  });

  it('should throw error when user does not exist', async () => {
    const nonExistentUserId = 99999;

    await expect(startShift(nonExistentUserId, testBranchId, 100))
      .rejects.toThrow(/User with id 99999 does not exist/i);
  });

  it('should throw error when branch does not exist', async () => {
    const nonExistentBranchId = 99999;

    await expect(startShift(testUserId, nonExistentBranchId, 100))
      .rejects.toThrow(/Branch with id 99999 does not exist/i);
  });

  it('should throw error when user already has active shift', async () => {
    // Start first shift
    await startShift(testUserId, testBranchId, 100);

    // Try to start another shift for same user
    await expect(startShift(testUserId, testBranchId, 150))
      .rejects.toThrow(/User already has an active shift/i);
  });

  it('should allow starting shift after previous shift is ended', async () => {
    // Start first shift
    const firstShift = await startShift(testUserId, testBranchId, 100);

    // End the shift by updating end_time
    await db.update(shiftsTable)
      .set({ 
        end_time: new Date(),
        closing_cash: '100.00'
      })
      .where(eq(shiftsTable.id, firstShift.id))
      .execute();

    // Should now be able to start a new shift
    const secondShift = await startShift(testUserId, testBranchId, 150);

    expect(secondShift.opening_cash).toEqual(150);
    expect(secondShift.id).not.toEqual(firstShift.id);
  });

  it('should allow different users to have concurrent active shifts', async () => {
    // Create second user
    const secondUserResult = await db.insert(usersTable)
      .values({
        email: 'cashier2@test.com',
        password_hash: 'hashed_password',
        full_name: 'Test Cashier 2',
        role: 'CASHIER',
        branch_id: testBranchId
      })
      .returning()
      .execute();
    const secondUserId = secondUserResult[0].id;

    // Start shifts for both users
    const firstShift = await startShift(testUserId, testBranchId, 100);
    const secondShift = await startShift(secondUserId, testBranchId, 200);

    expect(firstShift.user_id).toEqual(testUserId);
    expect(secondShift.user_id).toEqual(secondUserId);
    expect(firstShift.opening_cash).toEqual(100);
    expect(secondShift.opening_cash).toEqual(200);

    // Verify both shifts are active in database
    const activeShifts = await db.select()
      .from(shiftsTable)
      .where(isNull(shiftsTable.end_time))
      .execute();

    expect(activeShifts).toHaveLength(2);
  });

  it('should handle large opening cash amounts', async () => {
    const largeAmount = 9999999.99;

    const result = await startShift(testUserId, testBranchId, largeAmount);

    expect(result.opening_cash).toEqual(largeAmount);

    // Verify precision is maintained in database
    const shifts = await db.select()
      .from(shiftsTable)
      .where(eq(shiftsTable.id, result.id))
      .execute();

    expect(parseFloat(shifts[0].opening_cash)).toEqual(largeAmount);
  });

  it('should verify shift query with active shift filter works correctly', async () => {
    // Start shift
    const shift = await startShift(testUserId, testBranchId, 100);

    // Query for active shifts using same logic as handler
    const activeShifts = await db.select()
      .from(shiftsTable)
      .where(
        and(
          eq(shiftsTable.user_id, testUserId),
          isNull(shiftsTable.end_time)
        )
      )
      .execute();

    expect(activeShifts).toHaveLength(1);
    expect(activeShifts[0].id).toEqual(shift.id);
    expect(activeShifts[0].end_time).toBeNull();
  });
});