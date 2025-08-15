import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { customersTable } from '../db/schema';
import { type CreateCustomerInput } from '../schema';
import { createCustomer } from '../handlers/customers';
import { eq } from 'drizzle-orm';

// Complete test input with all fields
const testInput: CreateCustomerInput = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  phone: '+1234567890',
  address: '123 Main St, City, State 12345',
  membership_type: 'SILVER'
};

// Minimal test input
const minimalInput: CreateCustomerInput = {
  name: 'Jane Smith',
  email: null,
  phone: null,
  address: null,
  membership_type: 'BASIC' // Default value from Zod schema
};

describe('createCustomer', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a customer with all fields', async () => {
    const result = await createCustomer(testInput);

    // Basic field validation
    expect(result.name).toEqual('John Doe');
    expect(result.email).toEqual('john.doe@example.com');
    expect(result.phone).toEqual('+1234567890');
    expect(result.address).toEqual('123 Main St, City, State 12345');
    expect(result.membership_type).toEqual('SILVER');
    
    // Default values validation
    expect(result.loyalty_points).toEqual(0);
    expect(result.total_spent).toEqual(0);
    expect(typeof result.total_spent).toEqual('number');
    expect(result.is_active).toEqual(true);
    expect(result.last_visit).toBeNull();
    
    // Auto-generated fields validation
    expect(result.id).toBeDefined();
    expect(typeof result.id).toEqual('number');
    expect(result.customer_code).toMatch(/^CUST-\d+-\d{3}$/);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a customer with minimal fields', async () => {
    const result = await createCustomer(minimalInput);

    // Basic field validation
    expect(result.name).toEqual('Jane Smith');
    expect(result.email).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.address).toBeNull();
    expect(result.membership_type).toEqual('BASIC');
    
    // Default values validation
    expect(result.loyalty_points).toEqual(0);
    expect(result.total_spent).toEqual(0);
    expect(result.is_active).toEqual(true);
    expect(result.last_visit).toBeNull();
    
    // Auto-generated fields validation
    expect(result.id).toBeDefined();
    expect(result.customer_code).toMatch(/^CUST-\d+-\d{3}$/);
  });

  it('should save customer to database', async () => {
    const result = await createCustomer(testInput);

    // Query the customer from database
    const customers = await db.select()
      .from(customersTable)
      .where(eq(customersTable.id, result.id))
      .execute();

    expect(customers).toHaveLength(1);
    const dbCustomer = customers[0];
    
    expect(dbCustomer.name).toEqual('John Doe');
    expect(dbCustomer.email).toEqual('john.doe@example.com');
    expect(dbCustomer.phone).toEqual('+1234567890');
    expect(dbCustomer.address).toEqual('123 Main St, City, State 12345');
    expect(dbCustomer.membership_type).toEqual('SILVER');
    expect(dbCustomer.loyalty_points).toEqual(0);
    expect(parseFloat(dbCustomer.total_spent)).toEqual(0); // Convert from stored string
    expect(dbCustomer.is_active).toEqual(true);
    expect(dbCustomer.last_visit).toBeNull();
    expect(dbCustomer.customer_code).toMatch(/^CUST-\d+-\d{3}$/);
    expect(dbCustomer.created_at).toBeInstanceOf(Date);
    expect(dbCustomer.updated_at).toBeInstanceOf(Date);
  });

  it('should generate unique customer codes', async () => {
    // Create multiple customers
    const customer1 = await createCustomer({ ...testInput, name: 'Customer 1' });
    const customer2 = await createCustomer({ ...testInput, name: 'Customer 2' });
    const customer3 = await createCustomer({ ...testInput, name: 'Customer 3' });

    // Verify customer codes are unique
    expect(customer1.customer_code).not.toEqual(customer2.customer_code);
    expect(customer2.customer_code).not.toEqual(customer3.customer_code);
    expect(customer1.customer_code).not.toEqual(customer3.customer_code);
    
    // Verify all follow the expected pattern
    expect(customer1.customer_code).toMatch(/^CUST-\d+-\d{3}$/);
    expect(customer2.customer_code).toMatch(/^CUST-\d+-\d{3}$/);
    expect(customer3.customer_code).toMatch(/^CUST-\d+-\d{3}$/);
  });

  it('should handle different membership types', async () => {
    const basicCustomer = await createCustomer({ 
      ...testInput, 
      name: 'Basic Customer',
      membership_type: 'BASIC' 
    });
    
    const goldCustomer = await createCustomer({ 
      ...testInput, 
      name: 'Gold Customer',
      membership_type: 'GOLD' 
    });
    
    const platinumCustomer = await createCustomer({ 
      ...testInput, 
      name: 'Platinum Customer',
      membership_type: 'PLATINUM' 
    });

    expect(basicCustomer.membership_type).toEqual('BASIC');
    expect(goldCustomer.membership_type).toEqual('GOLD');
    expect(platinumCustomer.membership_type).toEqual('PLATINUM');
  });

  it('should handle null values correctly', async () => {
    const customerWithNulls = await createCustomer({
      name: 'Null Customer',
      email: null,
      phone: null,
      address: null,
      membership_type: 'BASIC'
    });

    expect(customerWithNulls.email).toBeNull();
    expect(customerWithNulls.phone).toBeNull();
    expect(customerWithNulls.address).toBeNull();
    expect(customerWithNulls.last_visit).toBeNull();
    
    // Verify in database as well
    const dbCustomers = await db.select()
      .from(customersTable)
      .where(eq(customersTable.id, customerWithNulls.id))
      .execute();
      
    const dbCustomer = dbCustomers[0];
    expect(dbCustomer.email).toBeNull();
    expect(dbCustomer.phone).toBeNull();
    expect(dbCustomer.address).toBeNull();
    expect(dbCustomer.last_visit).toBeNull();
  });

  it('should handle numeric field conversions correctly', async () => {
    const result = await createCustomer(testInput);
    
    // Verify returned data has correct numeric types
    expect(typeof result.total_spent).toEqual('number');
    expect(typeof result.loyalty_points).toEqual('number');
    expect(result.total_spent).toEqual(0);
    expect(result.loyalty_points).toEqual(0);
    
    // Verify database stores numeric fields as strings (PostgreSQL numeric type behavior)
    const dbCustomers = await db.select()
      .from(customersTable)
      .where(eq(customersTable.id, result.id))
      .execute();
    
    const dbCustomer = dbCustomers[0];
    expect(typeof dbCustomer.total_spent).toEqual('string');
    expect(typeof dbCustomer.loyalty_points).toEqual('number'); // Integer columns stay as numbers
    expect(parseFloat(dbCustomer.total_spent)).toEqual(0);
    expect(dbCustomer.loyalty_points).toEqual(0);
  });

  it('should create multiple customers successfully', async () => {
    const customers = await Promise.all([
      createCustomer({ ...testInput, name: 'Customer A' }),
      createCustomer({ ...testInput, name: 'Customer B' }),
      createCustomer({ ...testInput, name: 'Customer C' })
    ]);

    expect(customers).toHaveLength(3);
    
    // Verify all have unique IDs and customer codes
    const ids = customers.map(c => c.id);
    const codes = customers.map(c => c.customer_code);
    
    expect(new Set(ids).size).toEqual(3); // All IDs unique
    expect(new Set(codes).size).toEqual(3); // All codes unique
    
    // Verify all customers exist in database
    const allCustomers = await db.select()
      .from(customersTable)
      .execute();
    
    expect(allCustomers.length).toBeGreaterThanOrEqual(3);
  });
});