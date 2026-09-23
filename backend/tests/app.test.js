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
      passwordHash: 'hashed:admin-password-very-long', role: ROLES.ADMIN_GENERAL,
      branchId: null, createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: EMPLOYEE_ID, name: 'Empleado Uno', email: 'empleado@apexforce.local',
      passwordHash: 'hashed:employee-password-very-long', role: ROLES.EMPLEADO_MOSTRADOR,
      branchId: BRANCH_ID, createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ]);
  const passwordHasher = {
    argon2id: 2,
    hash: async (password) => `hashed:${password}`,
    verify: async (storedHash, password) => storedHash === `hashed:${password}`,
  };
  const inventoryRepository = {
    list: jest.fn().mockResolvedValue([
      {
        productId: '223e4567-e89b-42d3-a456-426614174000',
        sku: 'AF-001',
        productName: 'Producto de prueba',
        branchId: BRANCH_ID,
        quantity: 12,
        updatedAt: '2026-09-23T12:00:00.000Z',
      },
    ]),
    listProducts: jest.fn().mockResolvedValue([]),
    createProduct: jest.fn(async (input) => ({
      id: '223e4567-e89b-42d3-a456-426614174003',
      sku: input.sku,
      name: input.name,
      description: input.description,
      isActive: true,
      createdAt: '2026-09-23T12:00:00.000Z',
      updatedAt: '2026-09-23T12:00:00.000Z',
    })),
    setQuantity: jest.fn(async (input) => ({
      id: '323e4567-e89b-42d3-a456-426614174000',
      productId: input.productId,
      branchId: input.branchId,
      quantity: input.quantity,
      updatedAt: '2026-09-23T12:00:00.000Z',
    })),
  };
  return {
    repository,
    inventoryRepository,
    app: createApp({ userRepository: repository, inventoryRepository, jwtSecret: JWT_SECRET, passwordHasher }),
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
  });

  test('allows an administrator to register a user with a valid role', async () => {
    const { app, adminToken, repository } = setup();
    const response = await request(app).post('/api/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Gerente de Sucursal', email: ' GERENTE@APEXFORCE.LOCAL ',
        password: 'clave-larga-de-gerente', role: ROLES.GERENTE_SUCURSAL, branchId: BRANCH_ID,
      }).expect(201);
    expect(response.body.user.email).toBe('gerente@apexforce.local');
    expect(response.body.user.role).toBe(ROLES.GERENTE_SUCURSAL);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(repository.users).toHaveLength(3);
    expect(repository.auditLogs[0]).toMatchObject({
      actorUserId: ADMIN_ID,
      action: 'USER_CREATED',
      entityId: repository.users[2].id,
    });
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

  test('protects inventory from unauthenticated requests and returns items to an authenticated user', async () => {
    const { app, employeeToken, inventoryRepository } = setup();
    await request(app).get('/api/inventory').expect(401);
    expect(inventoryRepository.list).not.toHaveBeenCalled();

    const response = await request(app).get('/api/inventory')
      .set('Authorization', `Bearer ${employeeToken}`).expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({ sku: 'AF-001', quantity: 12, branchId: BRANCH_ID });
    expect(inventoryRepository.list).toHaveBeenCalledTimes(1);
  });

  test('allows authenticated users to list products but restricts product creation to administrators', async () => {
    const { app, adminToken, employeeToken, inventoryRepository } = setup();
    await request(app).get('/api/products').expect(401);
    await request(app).get('/api/products')
      .set('Authorization', `Bearer ${employeeToken}`).expect(200);
    await request(app).post('/api/products').send({ sku: 'AF-002', name: 'Producto nuevo' }).expect(401);
    await request(app).post('/api/products')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ sku: 'AF-002', name: 'Producto nuevo' }).expect(403);

    const response = await request(app).post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'af-002', name: 'Producto nuevo' }).expect(201);
    expect(response.body.product).toMatchObject({ sku: 'AF-002', name: 'Producto nuevo' });
    expect(inventoryRepository.createProduct).toHaveBeenCalledWith({
      sku: 'AF-002', name: 'Producto nuevo', description: null, actorUserId: ADMIN_ID,
    });
  });

  test('validates inventory writes and records the authenticated actor, not a body-supplied actor', async () => {
    const { app, adminToken, employeeToken, inventoryRepository } = setup();
    const payload = {
      productId: '223e4567-e89b-42d3-a456-426614174000',
      branchId: BRANCH_ID,
      quantity: 8,
      actorUserId: EMPLOYEE_ID,
    };

    await request(app).put('/api/inventory').set('Authorization', `Bearer ${employeeToken}`)
      .send(payload).expect(403);
    await request(app).put('/api/inventory').set('Authorization', `Bearer ${adminToken}`)
      .send({ ...payload, quantity: -1 }).expect(400);
    expect(inventoryRepository.setQuantity).not.toHaveBeenCalled();

    const response = await request(app).put('/api/inventory')
      .set('Authorization', `Bearer ${adminToken}`).send(payload).expect(200);
    expect(response.body.item).toMatchObject({ quantity: 8, branchId: BRANCH_ID });
    expect(inventoryRepository.setQuantity).toHaveBeenCalledWith({
      productId: payload.productId,
      branchId: BRANCH_ID,
      quantity: 8,
      actorUserId: ADMIN_ID,
    });
  });

  test('returns safe database errors for product and inventory writes', async () => {
    const { app, adminToken, inventoryRepository } = setup();
    inventoryRepository.createProduct.mockRejectedValueOnce(new Error('private database detail'));
    const response = await request(app).post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sku: 'AF-009', name: 'Producto de error' }).expect(500);
    expect(response.body.error.message).toBe('Ocurrió un error interno.');
    expect(JSON.stringify(response.body)).not.toContain('private database detail');
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
    const brokenApp = createApp({
      userRepository: brokenRepository,
      inventoryRepository: {
        list: async () => [],
        listProducts: async () => [],
        createProduct: async () => null,
        setQuantity: async () => null,
      },
      jwtSecret: JWT_SECRET,
    });
    const response = await request(brokenApp).get('/api/users/me')
      .set('Authorization', `Bearer ${adminToken}`).expect(500);
    expect(response.body.error.message).toBe('Ocurrió un error interno.');
    expect(JSON.stringify(response.body)).not.toContain('private database detail');
  });
});
