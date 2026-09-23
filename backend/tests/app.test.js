const jwt = require('jsonwebtoken');
const request = require('supertest');
const { createApp } = require('../src/app');
const { AUDIENCE, ISSUER } = require('../src/modules/auth/authService');
const { ROLES } = require('../src/domain/roles');
const { createMemoryUserRepository } = require('./helpers/memoryUserRepository');

const JWT_SECRET = 'test-only-secret-with-at-least-32-bytes';
const ADMIN_ID = '123e4567-e89b-42d3-a456-426614174000';
const EMPLOYEE_ID = '123e4567-e89b-42d3-a456-426614174001';
const BRANCH_ID = '123e4567-e89b-42d3-a456-426614174002';

function makeToken(userId, role) {
  return jwt.sign({ role }, JWT_SECRET, {
    algorithm: 'HS256', audience: AUDIENCE, expiresIn: '1h', issuer: ISSUER, subject: userId,
  });
}

function setup() {
  const repository = createMemoryUserRepository([
    {
      id: ADMIN_ID, name: 'Admin General', email: 'admin@apexforce.local',
      passwordHash: '$2b$mock$12$admin-password-very-long', role: ROLES.ADMIN_GENERAL,
      branchId: null, createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: EMPLOYEE_ID, name: 'Empleado Uno', email: 'empleado@apexforce.local',
      passwordHash: '$2b$mock$12$employee-password-very-long', role: ROLES.EMPLEADO_MOSTRADOR,
      branchId: BRANCH_ID, createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ]);
  const passwordHasher = {
    hash: async (password, rounds) => `$2b$mock$${rounds}$${password}`,
    compare: async (password, storedHash) => storedHash === `$2b$mock$12$${password}`,
  };
  return {
    repository,
    app: createApp({ userRepository: repository, jwtSecret: JWT_SECRET, passwordHasher }),
    adminToken: makeToken(ADMIN_ID, ROLES.ADMIN_GENERAL),
    employeeToken: makeToken(EMPLOYEE_ID, ROLES.EMPLEADO_MOSTRADOR),
  };
}

describe('Apex Force API', () => {
  test('validates required app dependencies and the JWT secret', () => {
    expect(() => createApp({ jwtSecret: JWT_SECRET })).toThrow(/userRepository/);
    expect(() => createApp({ userRepository: {}, jwtSecret: 'short' })).toThrow(/32 bytes/);
  });

  test('exposes a health check and security headers', async () => {
    const { app } = setup();
    const response = await request(app).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  test('logs in and omits password hashes from the response', async () => {
    const { app } = setup();
    const response = await request(app).post('/api/auth/login').send({
      email: ' ADMIN@APEXFORCE.LOCAL ', password: 'admin-password-very-long',
    }).expect(200);
    expect(response.body.tokenType).toBe('Bearer');
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user.email).toBe('admin@apexforce.local');
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  test('also exposes the assignment auth paths and uses the stored role, not a client-supplied role', async () => {
    const { app } = setup();
    const response = await request(app).post('/auth/login').send({
      email: 'empleado@apexforce.local',
      password: 'employee-password-very-long',
      role: ROLES.ADMIN_GENERAL,
    }).expect(200);
    const claims = jwt.verify(response.body.accessToken, JWT_SECRET, {
      algorithms: ['HS256'], audience: AUDIENCE, issuer: ISSUER,
    });
    expect(claims.role).toBe(ROLES.EMPLEADO_MOSTRADOR);
  });

  test('rejects invalid and unknown login credentials', async () => {
    const { app } = setup();
    await request(app).post('/api/auth/login').send({ email: 'bad', password: '' }).expect(400);
    const unknown = await request(app).post('/api/auth/login').send({
      email: 'unknown@apexforce.local', password: 'some-password',
    }).expect(401);
    const wrong = await request(app).post('/api/auth/login').send({
      email: 'admin@apexforce.local', password: 'incorrect-password',
    }).expect(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  test('requires authentication and restricts user creation to general administrators', async () => {
    const { app, employeeToken } = setup();
    const newUser = {
      name: 'Gerente de Sucursal', email: 'gerente@apexforce.local',
      password: 'clave-larga-de-gerente', role: ROLES.GERENTE_SUCURSAL, branchId: BRANCH_ID,
    };
    await request(app).post('/api/auth/register').send(newUser).expect(401);
    await request(app).post('/api/auth/register').set('Authorization', `Bearer ${employeeToken}`)
      .send(newUser).expect(403);
    await request(app).post('/auth/register').send(newUser).expect(401);
  });

  test('allows an administrator to register a user with a valid role', async () => {
    const { app, adminToken, repository } = setup();
    const response = await request(app).post('/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Gerente de Sucursal', email: ' GERENTE@APEXFORCE.LOCAL ',
        password: 'clave-larga-de-gerente', role: ROLES.GERENTE_SUCURSAL, branchId: BRANCH_ID,
      }).expect(201);
    expect(response.body.user.email).toBe('gerente@apexforce.local');
    expect(response.body.user.role).toBe(ROLES.GERENTE_SUCURSAL);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(repository.users).toHaveLength(3);
  });

  test('rejects an expired JWT', async () => {
    const { app } = setup();
    const expiredToken = jwt.sign({ role: ROLES.ADMIN_GENERAL }, JWT_SECRET, {
      algorithm: 'HS256', audience: AUDIENCE, expiresIn: -1, issuer: ISSUER, subject: ADMIN_ID,
    });
    await request(app).get('/api/users/me')
      .set('Authorization', `Bearer ${expiredToken}`).expect(401);
  });

  test('rejects privilege escalation and duplicate email during registration', async () => {
    const { app, adminToken } = setup();
    await request(app).post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Hacker', email: 'hacker@apexforce.local', password: 'clave-larga-y-valida', role: 'SUPER_ADMIN' })
      .expect(400);
    await request(app).post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Duplicado', email: 'admin@apexforce.local', password: 'clave-larga-y-valida', role: ROLES.ADMIN_GENERAL })
      .expect(409);
  });

  test('returns only the authenticated user profile and handles removed accounts', async () => {
    const { app, adminToken } = setup();
    const profile = await request(app).get('/api/users/me')
      .set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(profile.body.user.email).toBe('admin@apexforce.local');
    expect(profile.body.user).not.toHaveProperty('passwordHash');

    const removedAccountToken = makeToken('123e4567-e89b-42d3-a456-426614174003', ROLES.EMPLEADO_MOSTRADOR);
    await request(app).get('/api/users/me')
      .set('Authorization', `Bearer ${removedAccountToken}`).expect(401);
  });

  test('rejects missing, malformed, and role-tampered tokens', async () => {
    const { app } = setup();
    await request(app).get('/api/users/me').expect(401);
    await request(app).get('/api/users/me').set('Authorization', 'Bearer broken.token.value').expect(401);
    const invalidRoleToken = jwt.sign({ role: 'ROOT' }, JWT_SECRET, {
      algorithm: 'HS256', audience: AUDIENCE, expiresIn: '1h', issuer: ISSUER, subject: ADMIN_ID,
    });
    await request(app).get('/api/users/me')
      .set('Authorization', `Bearer ${invalidRoleToken}`).expect(401);
  });

  test('returns safe client errors for bad JSON and oversized payloads', async () => {
    const { app } = setup();
    await request(app).post('/api/auth/login')
      .set('Content-Type', 'application/json').send('{').expect(400);
    await request(app).post('/api/auth/login')
      .send({ padding: 'x'.repeat(12_000) }).expect(413);
  });

  test('returns structured not-found and generic server errors', async () => {
    const { app, adminToken } = setup();
    await request(app).get('/not-a-route').expect(404);

    const brokenRepository = createMemoryUserRepository();
    brokenRepository.findById = async () => { throw new Error('private database detail'); };
    const brokenApp = createApp({ userRepository: brokenRepository, jwtSecret: JWT_SECRET });
    const response = await request(brokenApp).get('/api/users/me')
      .set('Authorization', `Bearer ${adminToken}`).expect(500);
    expect(response.body.error.message).toBe('Ocurrió un error interno.');
    expect(JSON.stringify(response.body)).not.toContain('private database detail');
  });
});
