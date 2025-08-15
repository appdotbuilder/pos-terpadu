import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, branchesTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/auth';
import { eq } from 'drizzle-orm';
import { pbkdf2Sync } from 'crypto';

// Test branch data
const testBranch = {
    name: 'Main Branch',
    address: '123 Main St',
    phone: '+1234567890',
    email: 'main@test.com'
};

// Test user input
const testUserInput: CreateUserInput = {
    email: 'test@example.com',
    password: 'SecurePassword123!',
    full_name: 'John Doe',
    role: 'CASHIER',
    branch_id: null
};

describe('createUser', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    it('should create a user with valid input', async () => {
        const result = await createUser(testUserInput);

        // Basic field validation
        expect(result.email).toEqual('test@example.com');
        expect(result.full_name).toEqual('John Doe');
        expect(result.role).toEqual('CASHIER');
        expect(result.branch_id).toBeNull();
        expect(result.is_active).toBe(true);
        expect(result.two_factor_enabled).toBe(false);
        expect(result.last_login).toBeNull();
        expect(result.id).toBeDefined();
        expect(result.created_at).toBeInstanceOf(Date);
        expect(result.updated_at).toBeInstanceOf(Date);

        // Password should be hashed (not plain text)
        expect(result.password_hash).not.toEqual('SecurePassword123!');
        expect(result.password_hash.length).toBeGreaterThan(50);
    });

    it('should hash the password correctly', async () => {
        const result = await createUser(testUserInput);

        // Extract salt and hash from stored format (salt:hash)
        const [salt, storedHash] = result.password_hash.split(':');
        expect(salt).toBeDefined();
        expect(storedHash).toBeDefined();

        // Verify password can be validated with same salt and parameters
        const iterations = 100000;
        const keyLength = 64;
        const digest = 'sha256';
        
        const testHash = pbkdf2Sync('SecurePassword123!', salt, iterations, keyLength, digest).toString('hex');
        expect(testHash).toEqual(storedHash);

        // Verify wrong password fails validation
        const wrongHash = pbkdf2Sync('WrongPassword', salt, iterations, keyLength, digest).toString('hex');
        expect(wrongHash).not.toEqual(storedHash);
    });

    it('should save user to database', async () => {
        const result = await createUser(testUserInput);

        // Query database directly to verify user was saved
        const users = await db.select()
            .from(usersTable)
            .where(eq(usersTable.id, result.id))
            .execute();

        expect(users).toHaveLength(1);
        expect(users[0].email).toEqual('test@example.com');
        expect(users[0].full_name).toEqual('John Doe');
        expect(users[0].role).toEqual('CASHIER');
        expect(users[0].is_active).toBe(true);
        expect(users[0].created_at).toBeInstanceOf(Date);
    });

    it('should create a user with valid branch_id', async () => {
        // Create a test branch first
        const branchResult = await db.insert(branchesTable)
            .values(testBranch)
            .returning()
            .execute();
        const branchId = branchResult[0].id;

        const userWithBranch: CreateUserInput = {
            ...testUserInput,
            branch_id: branchId
        };

        const result = await createUser(userWithBranch);

        expect(result.branch_id).toEqual(branchId);
        expect(result.email).toEqual(testUserInput.email);
        expect(result.role).toEqual('CASHIER');
    });

    it('should create users with different roles', async () => {
        const ownerInput: CreateUserInput = {
            ...testUserInput,
            email: 'owner@test.com',
            role: 'OWNER'
        };

        const managerInput: CreateUserInput = {
            ...testUserInput,
            email: 'manager@test.com',
            role: 'MANAGER'
        };

        const warehouseInput: CreateUserInput = {
            ...testUserInput,
            email: 'warehouse@test.com',
            role: 'WAREHOUSE_STAFF'
        };

        const ownerResult = await createUser(ownerInput);
        const managerResult = await createUser(managerInput);
        const warehouseResult = await createUser(warehouseInput);

        expect(ownerResult.role).toEqual('OWNER');
        expect(managerResult.role).toEqual('MANAGER');
        expect(warehouseResult.role).toEqual('WAREHOUSE_STAFF');
    });

    it('should enforce unique email constraint', async () => {
        // Create first user
        await createUser(testUserInput);

        // Try to create another user with same email
        const duplicateUser: CreateUserInput = {
            ...testUserInput,
            full_name: 'Jane Doe'
        };

        await expect(createUser(duplicateUser)).rejects.toThrow(/duplicate key value violates unique constraint|UNIQUE constraint failed/i);
    });

    it('should throw error for invalid branch_id', async () => {
        const userWithInvalidBranch: CreateUserInput = {
            ...testUserInput,
            branch_id: 99999 // Non-existent branch ID
        };

        await expect(createUser(userWithInvalidBranch)).rejects.toThrow(/Branch not found/i);
    });

    it('should handle multiple users in same branch', async () => {
        // Create a test branch
        const branchResult = await db.insert(branchesTable)
            .values(testBranch)
            .returning()
            .execute();
        const branchId = branchResult[0].id;

        // Create multiple users in same branch
        const user1: CreateUserInput = {
            ...testUserInput,
            email: 'user1@test.com',
            branch_id: branchId
        };

        const user2: CreateUserInput = {
            ...testUserInput,
            email: 'user2@test.com',
            full_name: 'Jane Smith',
            role: 'MANAGER',
            branch_id: branchId
        };

        const result1 = await createUser(user1);
        const result2 = await createUser(user2);

        expect(result1.branch_id).toEqual(branchId);
        expect(result2.branch_id).toEqual(branchId);
        expect(result1.id).not.toEqual(result2.id);
    });

    it('should properly set default values', async () => {
        const result = await createUser(testUserInput);

        expect(result.is_active).toBe(true);
        expect(result.two_factor_enabled).toBe(false);
        expect(result.last_login).toBeNull();
        expect(result.created_at).toBeInstanceOf(Date);
        expect(result.updated_at).toBeInstanceOf(Date);
    });
});