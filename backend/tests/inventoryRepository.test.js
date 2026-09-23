const { InventoryRepository } = require('../src/data/inventoryRepository');

describe('InventoryRepository', () => {
  test('lists inventory with product details using the relational schema', async () => {
    const rows = [{ productId: 'product-1', sku: 'AF-001', productName: 'Producto', quantity: 3 }];
    const pool = { query: jest.fn().mockResolvedValue({ rows }) };
    const repository = new InventoryRepository(pool);

    await expect(repository.list()).resolves.toEqual(rows);
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('FROM inventory AS i');
    expect(pool.query.mock.calls[0][0]).toContain('INNER JOIN products AS p ON p.id = i.product_id');
  });

  test('requires a PostgreSQL pool', () => {
    expect(() => new InventoryRepository()).toThrow(/PostgreSQL pool/);
  });

  test('lists products by name', async () => {
    const rows = [{ id: 'product-id', sku: 'AF-001', name: 'Producto' }];
    const pool = { query: jest.fn().mockResolvedValue({ rows }) };
    const repository = new InventoryRepository(pool);
    await expect(repository.listProducts()).resolves.toEqual(rows);
    expect(pool.query.mock.calls[0][0]).toContain('FROM products');
  });

  test('creates a product and audit record in one transaction', async () => {
    const product = { id: 'product-id', sku: 'AF-001', name: 'Producto' };
    const client = {
      query: jest.fn().mockImplementation((query) => Promise.resolve({
        rows: query.includes('INSERT INTO products') ? [product] : [],
      })),
      release: jest.fn(),
    };
    const repository = new InventoryRepository({ query: jest.fn(), connect: jest.fn().mockResolvedValue(client) });

    await expect(repository.createProduct({
      sku: product.sku, name: product.name, description: null, actorUserId: 'admin-id',
    })).resolves.toEqual(product);

    expect(client.query.mock.calls[2][0]).toContain("'PRODUCT_CREATED'");
    expect(client.query.mock.calls[2][1]).toEqual(['admin-id', product.id, JSON.stringify({ sku: product.sku })]);
    expect(client.query.mock.calls[3][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('sets inventory quantity and audits the actor in the same transaction', async () => {
    const item = { id: 'inventory-id', productId: 'product-id', branchId: 'branch-id', quantity: 3 };
    const client = {
      query: jest.fn().mockImplementation((query) => Promise.resolve({
        rows: query.includes('INSERT INTO inventory') ? [item] : [],
      })),
      release: jest.fn(),
    };
    const repository = new InventoryRepository({ query: jest.fn(), connect: jest.fn().mockResolvedValue(client) });

    await expect(repository.setQuantity({
      productId: item.productId, branchId: item.branchId, quantity: 3, actorUserId: 'admin-id',
    })).resolves.toEqual(item);

    expect(client.query.mock.calls[2][0]).toContain("'INVENTORY_SET'");
    expect(client.query.mock.calls[2][1]).toEqual([
      'admin-id', item.id, item.branchId, JSON.stringify({ productId: item.productId, quantity: 3 }),
    ]);
    expect(client.query.mock.calls[3][0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('rolls back writes when PostgreSQL returns an error', async () => {
    const databaseError = new Error('database unavailable');
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(databaseError)
        .mockResolvedValueOnce({ rows: [] }),
      release: jest.fn(),
    };
    const repository = new InventoryRepository({ query: jest.fn(), connect: jest.fn().mockResolvedValue(client) });

    await expect(repository.createProduct({
      sku: 'AF-001', name: 'Producto', description: null, actorUserId: 'admin-id',
    })).rejects.toBe(databaseError);
    expect(client.query.mock.calls[2][0]).toBe('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
