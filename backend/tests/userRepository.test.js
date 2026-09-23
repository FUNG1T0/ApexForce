const { UserRepository, mapUser } = require('../src/data/userRepository');

const row = {
  id: 'user-id', name: 'Ana López', email: 'ana@apexforce.local', password_hash: 'hash',
  role: 'EMPLEADO_MOSTRADOR', branch_id: null, created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('UserRepository', () => {
  test('requires a query-capable pool', () => {
    expect(() => new UserRepository()).toThrow(TypeError);
  });

  test('maps database fields to the domain model and handles missing rows', () => {
    expect(mapUser(row)).toMatchObject({ passwordHash: 'hash', branchId: null });
    expect(mapUser(undefined)).toBeNull();
  });

  test('finds users by email using a parameterized query', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    const repository = new UserRepository(pool);
    expect(await repository.findByEmail('ana@apexforce.local')).toMatchObject({ id: 'user-id' });
    expect(pool.query.mock.calls[0][0]).toContain('email = $1');
    expect(pool.query.mock.calls[0][1]).toEqual(['ana@apexforce.local']);
  });

  test('returns null when no email match exists', async () => {
    const repository = new UserRepository({ query: jest.fn().mockResolvedValue({ rows: [] }) });
    expect(await repository.findByEmail('absent@apexforce.local')).toBeNull();
  });

  test('finds a user by id', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    const repository = new UserRepository(pool);
    expect(await repository.findById('user-id')).toMatchObject({ email: row.email });
    expect(pool.query.mock.calls[0][1]).toEqual(['user-id']);
  });

  test('creates users with parameterized values', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    const repository = new UserRepository(pool);
    const created = await repository.create({
      id: row.id, name: row.name, email: row.email, passwordHash: row.password_hash,
      role: row.role, branchId: row.branch_id,
    });
    expect(created.id).toBe(row.id);
    expect(pool.query.mock.calls[0][0]).toContain('INSERT INTO users');
    expect(pool.query.mock.calls[0][1]).toEqual([row.id, row.name, row.email, row.password_hash, row.role, null]);
  });

  test('checks whether an administrator exists', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ exists: true }] }) };
    const repository = new UserRepository(pool);
    expect(await repository.hasAdmin()).toBe(true);
    expect(pool.query.mock.calls[0][0]).toContain("role = 'ADMIN_GENERAL'");
  });
});
