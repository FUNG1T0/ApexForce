const path = require('node:path');
const dotenv = require('dotenv');
const { createPool } = require('../src/db/pool');
const { UserRepository } = require('../src/data/userRepository');
const { AuthService } = require('../src/modules/auth/authService');
const { ROLES } = require('../src/domain/roles');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function bootstrapAdmin() {
  const required = ['BOOTSTRAP_ADMIN_NAME', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD', 'JWT_SECRET'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Missing required environment values: ${missing.join(', ')}`);

  const pool = createPool();
  try {
    const repository = new UserRepository(pool);
    if (await repository.hasAdmin()) {
      throw new Error('An ADMIN_GENERAL account already exists; bootstrap is one-time only.');
    }
    const authService = new AuthService({ userRepository: repository, jwtSecret: process.env.JWT_SECRET });
    const user = await authService.register({
      name: process.env.BOOTSTRAP_ADMIN_NAME,
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
      role: ROLES.ADMIN_GENERAL,
      branchId: null,
    });
    process.stdout.write(`Initial administrator created: ${user.email}\n`);
  } finally {
    await pool.end();
  }
}

bootstrapAdmin().catch((error) => {
  process.stderr.write(`Administrator bootstrap failed: ${error.message}\n`);
  process.exitCode = 1;
});
