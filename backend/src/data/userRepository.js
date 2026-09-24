function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    branchId: row.branch_id,
    createdAt: row.created_at,
  };
}

class UserRepository {
  constructor(pool) {
    if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required');
    this.pool = pool;
  }

  async findByEmail(email) {
    const result = await this.pool.query(
      'SELECT id, name, email, password_hash, role, branch_id, created_at FROM users WHERE email = $1 LIMIT 1',
      [email],
    );
    return mapUser(result.rows[0]);
  }

  async findById(id) {
    const result = await this.pool.query(
      'SELECT id, name, email, password_hash, role, branch_id, created_at FROM users WHERE id = $1 LIMIT 1',
      [id],
    );
    return mapUser(result.rows[0]);
  }

  async create(user, actorUserId = null) {
    const client = await this.pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await client.query(
        `INSERT INTO users (id, name, email, password_hash, role, branch_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, email, password_hash, role, branch_id, created_at`,
        [user.id, user.name, user.email, user.passwordHash, user.role, user.branchId],
      );
      await client.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, branch_id, details)
         VALUES ($1, $2, 'users', $3, $4, $5::jsonb)`,
        [
          actorUserId,
          actorUserId ? 'USER_CREATED' : 'USER_BOOTSTRAPPED',
          user.id,
          user.branchId,
          JSON.stringify({ role: user.role }),
        ],
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return mapUser(result.rows[0]);
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePasswordHash(id, passwordHash) {
    await this.pool.query(
      'UPDATE users SET password_hash = $2 WHERE id = $1',
      [id, passwordHash],
    );
  }

  async hasAdmin() {
    const result = await this.pool.query(
      "SELECT EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN_GENERAL') AS exists",
    );
    return result.rows[0].exists;
  }
}

module.exports = { UserRepository, mapUser };
