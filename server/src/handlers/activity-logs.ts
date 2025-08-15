import { db } from '../db';
import { userActivityLogsTable, usersTable } from '../db/schema';
import { type UserActivityLog } from '../schema';
import { eq, gte, lte, and, or, desc, like, SQL } from 'drizzle-orm';

export async function logUserActivity(
  userId: number,
  action: string,
  entityType: string,
  entityId?: number,
  details?: string,
  ipAddress?: string
): Promise<UserActivityLog> {
  try {
    const result = await db.insert(userActivityLogsTable)
      .values({
        user_id: userId,
        action: action,
        entity_type: entityType,
        entity_id: entityId || null,
        details: details || null,
        ip_address: ipAddress || null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Activity logging failed:', error);
    throw error;
  }
}

export async function getUserActivityLogs(
  userId?: number,
  startDate?: Date,
  endDate?: Date
): Promise<UserActivityLog[]> {
  try {
    const conditions: SQL<unknown>[] = [];

    if (userId !== undefined) {
      conditions.push(eq(userActivityLogsTable.user_id, userId));
    }

    if (startDate !== undefined) {
      conditions.push(gte(userActivityLogsTable.created_at, startDate));
    }

    if (endDate !== undefined) {
      conditions.push(lte(userActivityLogsTable.created_at, endDate));
    }

    const baseQuery = db.select()
      .from(userActivityLogsTable);

    const results = await (conditions.length > 0
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery)
      .orderBy(desc(userActivityLogsTable.created_at))
      .execute();
      
    return results;
  } catch (error) {
    console.error('Failed to fetch user activity logs:', error);
    throw error;
  }
}

export async function getSystemAuditLogs(
  action?: string,
  entityType?: string,
  startDate?: Date,
  endDate?: Date
): Promise<UserActivityLog[]> {
  try {
    const conditions: SQL<unknown>[] = [];

    if (action !== undefined) {
      conditions.push(eq(userActivityLogsTable.action, action));
    }

    if (entityType !== undefined) {
      conditions.push(eq(userActivityLogsTable.entity_type, entityType));
    }

    if (startDate !== undefined) {
      conditions.push(gte(userActivityLogsTable.created_at, startDate));
    }

    if (endDate !== undefined) {
      conditions.push(lte(userActivityLogsTable.created_at, endDate));
    }

    const baseQuery = db.select()
      .from(userActivityLogsTable);

    const results = await (conditions.length > 0
      ? baseQuery.where(conditions.length === 1 ? conditions[0] : and(...conditions))
      : baseQuery)
      .orderBy(desc(userActivityLogsTable.created_at))
      .execute();
      
    return results;
  } catch (error) {
    console.error('Failed to fetch system audit logs:', error);
    throw error;
  }
}

export async function getSecurityLogs(
  ipAddress?: string,
  suspicious?: boolean
): Promise<UserActivityLog[]> {
  try {
    // Start with base query and always apply security filters
    let query = db.select()
      .from(userActivityLogsTable)
      .where(
        or(
          like(userActivityLogsTable.action, '%LOGIN%'),
          like(userActivityLogsTable.action, '%LOGOUT%'),
          like(userActivityLogsTable.action, '%AUTH%'),
          like(userActivityLogsTable.action, '%SECURITY%'),
          like(userActivityLogsTable.action, '%FAILED%'),
          like(userActivityLogsTable.action, '%ATTEMPT%')
        )
      );

    // Apply additional filters if needed
    const additionalConditions: SQL<unknown>[] = [];

    if (ipAddress !== undefined) {
      additionalConditions.push(eq(userActivityLogsTable.ip_address, ipAddress));
    }

    if (suspicious === true) {
      additionalConditions.push(
        like(userActivityLogsTable.action, '%FAILED%')
      );
    }

    // If we have additional conditions, combine them with the security filter
    if (additionalConditions.length > 0) {
      const securityFilter = or(
        like(userActivityLogsTable.action, '%LOGIN%'),
        like(userActivityLogsTable.action, '%LOGOUT%'),
        like(userActivityLogsTable.action, '%AUTH%'),
        like(userActivityLogsTable.action, '%SECURITY%'),
        like(userActivityLogsTable.action, '%FAILED%'),
        like(userActivityLogsTable.action, '%ATTEMPT%')
      );
      
      const allConditions = [securityFilter, ...additionalConditions];
      query = db.select()
        .from(userActivityLogsTable)
        .where(and(...allConditions));
    }

    const results = await query
      .orderBy(desc(userActivityLogsTable.created_at))
      .execute();
      
    return results;
  } catch (error) {
    console.error('Failed to fetch security logs:', error);
    throw error;
  }
}