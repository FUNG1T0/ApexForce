const path = require('node:path');
const dotenv = require('dotenv');
const { createPool } = require('./db/pool');
const { UserRepository } = require('./data/userRepository');
const { InventoryRepository } = require('./data/inventoryRepository');
const { createApp } = require('./app');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const port = Number(process.env.PORT || 3000);
const pool = createPool();
const userRepository = new UserRepository(pool);
const inventoryRepository = new InventoryRepository(pool);
const app = createApp({
  userRepository,
  inventoryRepository,
  jwtSecret: process.env.JWT_SECRET,
  tokenExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
});

const server = app.listen(port, () => {
  process.stdout.write(`Apex Force API listening on port ${port}\n`);
});

function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
