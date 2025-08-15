import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { productsTable, productCategoriesTable } from '../db/schema';
import { type CreateProductInput, type CreateProductCategoryInput } from '../schema';
import { createProduct } from '../handlers/products';
import { eq } from 'drizzle-orm';

// Test inputs with all required fields
const testProductInput: CreateProductInput = {
    sku: 'TEST-SKU-001',
    barcode: '1234567890123',
    name: 'Test Product',
    description: 'A product for testing',
    category_id: null,
    base_price: 15.50,
    selling_price: 19.99,
    unit: 'pcs',
    min_stock: 10,
    has_variants: false,
    is_raw_material: false,
    image_url: 'https://example.com/image.jpg'
};

const testCategoryInput: CreateProductCategoryInput = {
    name: 'Test Category',
    description: 'A category for testing',
    parent_id: null
};

describe('createProduct', () => {
    beforeEach(createDB);
    afterEach(resetDB);

    it('should create a product with all fields', async () => {
        const result = await createProduct(testProductInput);

        // Verify all fields are correctly set
        expect(result.sku).toEqual('TEST-SKU-001');
        expect(result.barcode).toEqual('1234567890123');
        expect(result.name).toEqual('Test Product');
        expect(result.description).toEqual('A product for testing');
        expect(result.category_id).toBeNull();
        expect(result.base_price).toEqual(15.50);
        expect(result.selling_price).toEqual(19.99);
        expect(result.unit).toEqual('pcs');
        expect(result.min_stock).toEqual(10);
        expect(result.has_variants).toEqual(false);
        expect(result.is_raw_material).toEqual(false);
        expect(result.image_url).toEqual('https://example.com/image.jpg');
        expect(result.is_active).toEqual(true);
        expect(result.id).toBeDefined();
        expect(result.created_at).toBeInstanceOf(Date);
        expect(result.updated_at).toBeInstanceOf(Date);

        // Verify numeric types are correct
        expect(typeof result.base_price).toBe('number');
        expect(typeof result.selling_price).toBe('number');
    });

    it('should save product to database correctly', async () => {
        const result = await createProduct(testProductInput);

        // Query database directly
        const products = await db.select()
            .from(productsTable)
            .where(eq(productsTable.id, result.id))
            .execute();

        expect(products).toHaveLength(1);
        const savedProduct = products[0];
        
        expect(savedProduct.sku).toEqual('TEST-SKU-001');
        expect(savedProduct.name).toEqual('Test Product');
        expect(savedProduct.description).toEqual('A product for testing');
        expect(parseFloat(savedProduct.base_price)).toEqual(15.50);
        expect(parseFloat(savedProduct.selling_price)).toEqual(19.99);
        expect(savedProduct.unit).toEqual('pcs');
        expect(savedProduct.min_stock).toEqual(10);
        expect(savedProduct.is_active).toEqual(true);
        expect(savedProduct.created_at).toBeInstanceOf(Date);
        expect(savedProduct.updated_at).toBeInstanceOf(Date);
    });

    it('should create product with valid category_id', async () => {
        // First create a category
        const categoryResult = await db.insert(productCategoriesTable)
            .values({
                name: testCategoryInput.name,
                description: testCategoryInput.description,
                parent_id: testCategoryInput.parent_id
            })
            .returning()
            .execute();

        const category = categoryResult[0];

        // Create product with category
        const productWithCategory = {
            ...testProductInput,
            category_id: category.id
        };

        const result = await createProduct(productWithCategory);

        expect(result.category_id).toEqual(category.id);

        // Verify in database
        const products = await db.select()
            .from(productsTable)
            .where(eq(productsTable.id, result.id))
            .execute();

        expect(products[0].category_id).toEqual(category.id);
    });

    it('should handle null/optional fields correctly', async () => {
        const minimalInput: CreateProductInput = {
            sku: 'MINIMAL-001',
            barcode: null,
            name: 'Minimal Product',
            description: null,
            category_id: null,
            base_price: 10.00,
            selling_price: 12.00,
            unit: 'kg',
            min_stock: 5,
            has_variants: false,
            is_raw_material: false,
            image_url: null
        };

        const result = await createProduct(minimalInput);

        expect(result.barcode).toBeNull();
        expect(result.description).toBeNull();
        expect(result.category_id).toBeNull();
        expect(result.image_url).toBeNull();
        expect(result.name).toEqual('Minimal Product');
        expect(result.base_price).toEqual(10.00);
        expect(result.selling_price).toEqual(12.00);
    });

    it('should handle variant and raw material flags', async () => {
        const variantProduct: CreateProductInput = {
            ...testProductInput,
            sku: 'VARIANT-001',
            has_variants: true,
            is_raw_material: true
        };

        const result = await createProduct(variantProduct);

        expect(result.has_variants).toEqual(true);
        expect(result.is_raw_material).toEqual(true);

        // Verify in database
        const products = await db.select()
            .from(productsTable)
            .where(eq(productsTable.id, result.id))
            .execute();

        expect(products[0].has_variants).toEqual(true);
        expect(products[0].is_raw_material).toEqual(true);
    });

    it('should throw error for invalid category_id', async () => {
        const invalidCategoryInput = {
            ...testProductInput,
            category_id: 999999 // Non-existent category
        };

        await expect(createProduct(invalidCategoryInput))
            .rejects
            .toThrow(/Category with id 999999 does not exist/i);
    });

    it('should handle decimal prices correctly', async () => {
        const decimalPriceInput: CreateProductInput = {
            ...testProductInput,
            sku: 'DECIMAL-001',
            base_price: 12.345,
            selling_price: 15.678
        };

        const result = await createProduct(decimalPriceInput);

        expect(result.base_price).toBeCloseTo(12.345, 2);
        expect(result.selling_price).toBeCloseTo(15.678, 2);

        // Verify numeric conversion is working
        expect(typeof result.base_price).toBe('number');
        expect(typeof result.selling_price).toBe('number');
    });

    it('should create multiple products with unique SKUs', async () => {
        const product1 = await createProduct({
            ...testProductInput,
            sku: 'UNIQUE-001'
        });

        const product2 = await createProduct({
            ...testProductInput,
            sku: 'UNIQUE-002',
            name: 'Second Product'
        });

        expect(product1.sku).toEqual('UNIQUE-001');
        expect(product2.sku).toEqual('UNIQUE-002');
        expect(product1.id).not.toEqual(product2.id);

        // Verify both exist in database
        const products = await db.select()
            .from(productsTable)
            .execute();

        expect(products.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle zero min_stock correctly', async () => {
        const zeroStockInput: CreateProductInput = {
            ...testProductInput,
            sku: 'ZERO-STOCK-001',
            min_stock: 0
        };

        const result = await createProduct(zeroStockInput);

        expect(result.min_stock).toEqual(0);

        // Verify in database
        const products = await db.select()
            .from(productsTable)
            .where(eq(productsTable.id, result.id))
            .execute();

        expect(products[0].min_stock).toEqual(0);
    });
});