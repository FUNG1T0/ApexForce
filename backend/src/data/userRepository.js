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

  async create(user) {
    const result = await this.pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, password_hash, role, branch_id, created_at`,
      [user.id, user.name, user.email, user.passwordHash, user.role, user.branchId],
    );
    return mapUser(result.rows[0]);
  }

  async hasAdmin() {
    const result = await this.pool.query(
      "SELECT EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN_GENERAL') AS exists",
    );
    return result.rows[0].exists;
  }
}

module.exports = { UserRepository, mapUser };
