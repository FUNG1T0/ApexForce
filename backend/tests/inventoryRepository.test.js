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
});
