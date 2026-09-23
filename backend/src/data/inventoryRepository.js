const { randomUUID } = require('node:crypto');

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

  async listProducts() {
    const result = await this.pool.query(
      `SELECT id, sku, name, description, is_active AS "isActive",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM products
       ORDER BY name ASC, sku ASC`,
    );
    return result.rows;
  }

  async createProduct({ sku, name, description, actorUserId }) {
    const client = await this.pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await client.query(
        `INSERT INTO products (id, sku, name, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, sku, name, description, is_active AS "isActive",
                   created_at AS "createdAt", updated_at AS "updatedAt"`,
        [randomUUID(), sku, name, description],
      );
      const product = result.rows[0];
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
         VALUES ($1, 'PRODUCT_CREATED', 'products', $2, $3::jsonb)`,
        [actorUserId, product.id, JSON.stringify({ sku: product.sku })],
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return product;
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setQuantity({ productId, branchId, quantity, actorUserId }) {
    const client = await this.pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await client.query(
        `INSERT INTO inventory (id, product_id, branch_id, quantity)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, branch_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = NOW()
         RETURNING id, product_id AS "productId", branch_id AS "branchId", quantity, updated_at AS "updatedAt"`,
        [randomUUID(), productId, branchId, quantity],
      );
      const item = result.rows[0];
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, branch_id, details)
         VALUES ($1, 'INVENTORY_SET', 'inventory', $2, $3, $4::jsonb)`,
        [actorUserId, item.id, branchId, JSON.stringify({ productId, quantity })],
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return item;
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { InventoryRepository };
