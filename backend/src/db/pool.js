const { Pool } = require('pg');

function createPool(env = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
}

module.exports = { createPool };
