class InventoryRepository {
  constructor(pool) {
    if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required');
    this.pool = pool;
  }

  async list() {
    const result = await this.pool.query(
      `SELECT i.product_id AS "productId",
              p.sku,
              p.name AS "productName",
              i.branch_id AS "branchId",
              i.quantity,
              i.updated_at AS "updatedAt"
       FROM inventory AS i
       INNER JOIN products AS p ON p.id = i.product_id
       ORDER BY p.name ASC, i.branch_id ASC`,
    );
    return result.rows;
  }
}

module.exports = { InventoryRepository };
