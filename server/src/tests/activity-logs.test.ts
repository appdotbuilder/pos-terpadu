import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { userActivityLogsTable, usersTable, branchesTable } from '../db/schema';
import { 
  logUserActivity, 
  getUserActivityLogs, 
  getSystemAuditLogs, 
  getSecurityLogs 
} from '../handlers/activity-logs';
import { eq } from 'drizzle-orm';

describe('Activity Logs Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let testUserId: number;
  let testUserId2: number;

  beforeEach(async () => {
    // Create test branch first
    const branch = await db.insert(branchesTable)
      .values({
        name: 'Test Branch',
        address: '123 Test St',
        phone: '123-456-7890',
        email: 'test@branch.com'
      })
      .returning()
      .execute();

    // Create test users
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'test1@example.com',
          password_hash: 'hashed_password_1',
          full_name: 'Test User 1',
          role: 'CASHIER',
          branch_id: branch[0].id
        },
        {
          email: 'test2@example.com',
          password_hash: 'hashed_password_2',
          full_name: 'Test User 2',
          role: 'MANAGER',
          branch_id: branch[0].id
        }
      ])
      .returning()
      .execute();

    testUserId = users[0].id;
    testUserId2 = users[1].id;
  });

  describe('logUserActivity', () => {
    it('should log basic user activity', async () => {
      const result = await logUserActivity(
        testUserId,
        'LOGIN',
        'USER',
        testUserId,
        'User logged in successfully'
      );

      expect(result.user_id).toEqual(testUserId);
      expect(result.action).toEqual('LOGIN');
      expect(result.entity_type).toEqual('USER');
      expect(result.entity_id).toEqual(testUserId);
      expect(result.details).toEqual('User logged in successfully');
      expect(result.ip_address).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should log activity with IP address', async () => {
      const ipAddress = '192.168.1.100';
      const result = await logUserActivity(
        testUserId,
        'PRODUCT_CREATE',
        'PRODUCT',
        123,
        'Created new product',
        ipAddress
      );

      expect(result.user_id).toEqual(testUserId);
      expect(result.action).toEqual('PRODUCT_CREATE');
      expect(result.entity_type).toEqual('PRODUCT');
      expect(result.entity_id).toEqual(123);
      expect(result.details).toEqual('Created new product');
      expect(result.ip_address).toEqual(ipAddress);
    });

    it('should log activity with minimal data', async () => {
      const result = await logUserActivity(
        testUserId,
        'LOGOUT',
        'USER'
      );

      expect(result.user_id).toEqual(testUserId);
      expect(result.action).toEqual('LOGOUT');
      expect(result.entity_type).toEqual('USER');
      expect(result.entity_id).toBeNull();
      expect(result.details).toBeNull();
      expect(result.ip_address).toBeNull();
    });

    it('should save activity to database', async () => {
      const result = await logUserActivity(
        testUserId,
        'TRANSACTION_CREATE',
        'TRANSACTION',
        456,
        'Transaction completed'
      );

      const logs = await db.select()
        .from(userActivityLogsTable)
        .where(eq(userActivityLogsTable.id, result.id))
        .execute();

      expect(logs).toHaveLength(1);
      expect(logs[0].user_id).toEqual(testUserId);
      expect(logs[0].action).toEqual('TRANSACTION_CREATE');
      expect(logs[0].entity_type).toEqual('TRANSACTION');
      expect(logs[0].entity_id).toEqual(456);
    });
  });

  describe('getUserActivityLogs', () => {
    beforeEach(async () => {
      // Create test activity logs
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      await db.insert(userActivityLogsTable)
        .values([
          {
            user_id: testUserId,
            action: 'LOGIN',
            entity_type: 'USER',
            entity_id: testUserId,
            details: 'Login today',
            created_at: today
          },
          {
            user_id: testUserId,
            action: 'PRODUCT_VIEW',
            entity_type: 'PRODUCT',
            entity_id: 123,
            details: 'Viewed product yesterday',
            created_at: yesterday
          },
          {
            user_id: testUserId2,
            action: 'LOGOUT',
            entity_type: 'USER',
            entity_id: testUserId2,
            details: 'Logout yesterday',
            created_at: yesterday
          },
          {
            user_id: testUserId,
            action: 'TRANSACTION_CREATE',
            entity_type: 'TRANSACTION',
            entity_id: 789,
            details: 'Transaction two days ago',
            created_at: twoDaysAgo
          }
        ])
        .execute();
    });

    it('should get all activity logs when no filters applied', async () => {
      const result = await getUserActivityLogs();

      expect(result).toHaveLength(4);
      // Should be ordered by created_at desc
      expect(result[0].details).toEqual('Login today');
    });

    it('should filter by user ID', async () => {
      const result = await getUserActivityLogs(testUserId);

      expect(result).toHaveLength(3);
      result.forEach(log => {
        expect(log.user_id).toEqual(testUserId);
      });
    });

    it('should filter by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const today = new Date();

      const result = await getUserActivityLogs(undefined, yesterday, today);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(log => {
        expect(log.created_at >= yesterday).toBe(true);
        expect(log.created_at <= today).toBe(true);
      });
    });

    it('should filter by user and date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const today = new Date();

      const result = await getUserActivityLogs(testUserId, yesterday, today);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(log => {
        expect(log.user_id).toEqual(testUserId);
        expect(log.created_at >= yesterday).toBe(true);
        expect(log.created_at <= today).toBe(true);
      });
    });

    it('should return empty array when no logs match filters', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const result = await getUserActivityLogs(999, futureDate);

      expect(result).toHaveLength(0);
    });
  });

  describe('getSystemAuditLogs', () => {
    beforeEach(async () => {
      // Create test audit logs with explicit times
      const baseTime = new Date('2024-01-15T10:00:00Z');
      const todayTime = new Date(baseTime);
      const yesterdayTime = new Date(baseTime);
      yesterdayTime.setDate(yesterdayTime.getDate() - 1);

      await db.insert(userActivityLogsTable)
        .values([
          {
            user_id: testUserId,
            action: 'PRODUCT_CREATE',
            entity_type: 'PRODUCT',
            entity_id: 123,
            details: 'Created product A',
            created_at: todayTime
          },
          {
            user_id: testUserId2,
            action: 'PRODUCT_UPDATE',
            entity_type: 'PRODUCT',
            entity_id: 124,
            details: 'Updated product B',
            created_at: todayTime
          },
          {
            user_id: testUserId,
            action: 'USER_CREATE',
            entity_type: 'USER',
            entity_id: 456,
            details: 'Created new user',
            created_at: yesterdayTime
          },
          {
            user_id: testUserId2,
            action: 'TRANSACTION_CREATE',
            entity_type: 'TRANSACTION',
            entity_id: 789,
            details: 'Completed transaction',
            created_at: todayTime
          }
        ])
        .execute();
    });

    it('should get all audit logs when no filters applied', async () => {
      const result = await getSystemAuditLogs();

      expect(result).toHaveLength(4);
      // Should be ordered by created_at desc
      expect(result[0].action).toMatch(/PRODUCT_CREATE|PRODUCT_UPDATE|TRANSACTION_CREATE/);
    });

    it('should filter by action', async () => {
      const result = await getSystemAuditLogs('PRODUCT_CREATE');

      expect(result).toHaveLength(1);
      expect(result[0].action).toEqual('PRODUCT_CREATE');
      expect(result[0].details).toEqual('Created product A');
    });

    it('should filter by entity type', async () => {
      const result = await getSystemAuditLogs(undefined, 'PRODUCT');

      expect(result).toHaveLength(2);
      result.forEach(log => {
        expect(log.entity_type).toEqual('PRODUCT');
      });
    });

    it('should filter by action and entity type', async () => {
      const result = await getSystemAuditLogs('PRODUCT_UPDATE', 'PRODUCT');

      expect(result).toHaveLength(1);
      expect(result[0].action).toEqual('PRODUCT_UPDATE');
      expect(result[0].entity_type).toEqual('PRODUCT');
    });

    it('should filter by date range', async () => {
      // Use the same date range as in the test data
      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-15T23:59:59Z');

      const result = await getSystemAuditLogs(undefined, undefined, startDate, endDate);

      expect(result.length).toBeGreaterThan(0);
      // Should find logs from today (3 logs with todayTime)
      expect(result.length).toEqual(3);
      result.forEach(log => {
        expect(log.created_at >= startDate).toBe(true);
        expect(log.created_at <= endDate).toBe(true);
      });
    });
  });

  describe('getSecurityLogs', () => {
    beforeEach(async () => {
      // Create test security logs
      const today = new Date();

      await db.insert(userActivityLogsTable)
        .values([
          {
            user_id: testUserId,
            action: 'LOGIN_SUCCESS',
            entity_type: 'USER',
            entity_id: testUserId,
            details: 'Successful login',
            ip_address: '192.168.1.100',
            created_at: today
          },
          {
            user_id: testUserId2,
            action: 'LOGIN_FAILED',
            entity_type: 'USER',
            entity_id: testUserId2,
            details: 'Failed login attempt',
            ip_address: '192.168.1.200',
            created_at: today
          },
          {
            user_id: testUserId,
            action: 'LOGOUT',
            entity_type: 'USER',
            entity_id: testUserId,
            details: 'User logout',
            ip_address: '192.168.1.100',
            created_at: today
          },
          {
            user_id: testUserId,
            action: 'PRODUCT_CREATE',
            entity_type: 'PRODUCT',
            entity_id: 123,
            details: 'Non-security action',
            ip_address: '192.168.1.100',
            created_at: today
          },
          {
            user_id: testUserId2,
            action: 'AUTH_ATTEMPT',
            entity_type: 'USER',
            entity_id: testUserId2,
            details: 'Authentication attempt',
            ip_address: '192.168.1.200',
            created_at: today
          }
        ])
        .execute();
    });

    it('should get all security-related logs', async () => {
      const result = await getSecurityLogs();

      expect(result.length).toBeGreaterThan(0);
      // Should contain security actions but not PRODUCT_CREATE
      const actions = result.map(log => log.action);
      expect(actions).toContain('LOGIN_SUCCESS');
      expect(actions).toContain('LOGIN_FAILED');
      expect(actions).toContain('LOGOUT');
      expect(actions).toContain('AUTH_ATTEMPT');
      expect(actions).not.toContain('PRODUCT_CREATE');
    });

    it('should filter by IP address', async () => {
      const result = await getSecurityLogs('192.168.1.100');

      expect(result.length).toBeGreaterThan(0);
      result.forEach(log => {
        expect(log.ip_address).toEqual('192.168.1.100');
        // Should still only be security-related actions
        expect(log.action).toMatch(/(LOGIN|LOGOUT|AUTH|SECURITY|FAILED|ATTEMPT)/i);
      });
    });

    it('should filter for suspicious activities', async () => {
      const result = await getSecurityLogs(undefined, true);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(log => {
        expect(log.action).toMatch(/FAILED/i);
      });
    });

    it('should filter by IP and suspicious flag', async () => {
      const result = await getSecurityLogs('192.168.1.200', true);

      expect(result.length).toBeGreaterThan(0);
      result.forEach(log => {
        expect(log.ip_address).toEqual('192.168.1.200');
        expect(log.action).toMatch(/FAILED/i);
      });
    });

    it('should return empty array when no security logs match', async () => {
      const result = await getSecurityLogs('192.168.999.999');

      expect(result).toHaveLength(0);
    });
  });
});