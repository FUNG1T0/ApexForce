const jwt = require('jsonwebtoken');
const argon2 = require('argon2');
const bcrypt = require('bcrypt');
const { AuthService, AUDIENCE, ISSUER } = require('../src/modules/auth/authService');
const { ROLES } = require('../src/domain/roles');
const { createMemoryUserRepository } = require('./helpers/memoryUserRepository');

const JWT_SECRET = 'test-only-secret-with-at-least-32-bytes';
const BRANCH_ID = '123e4567-e89b-42d3-a456-426614174000';

function makeHasher() {
  return {
    hash: jest.fn(async (password, rounds) => `$2b$mock$${rounds}$${password}`),
    compare: jest.fn(async (password, hash) => hash === `$2b$mock$12$${password}`),
  };
}

function validInput(overrides = {}) {
  return {
    name: 'Ana López',
    email: ' ANA@APEXFORCE.LOCAL ',
    password: 'clave-de-prueba-segura',
    role: ROLES.EMPLEADO_MOSTRADOR,
    branchId: BRANCH_ID,
    ...overrides,
  };
}

describe('AuthService', () => {
  let repository;
  let hasher;
  let service;

  beforeEach(() => {
    repository = createMemoryUserRepository();
    hasher = makeHasher();
    service = new AuthService({ userRepository: repository, jwtSecret: JWT_SECRET, passwordHasher: hasher });
  });

  test('requires a repository and a strong JWT secret', () => {
    expect(() => new AuthService({ jwtSecret: JWT_SECRET })).toThrow(TypeError);
    expect(() => new AuthService({ userRepository: repository, jwtSecret: 'short' })).toThrow(/32 bytes/);
  });

  test('normalizes email, hashes the password, and never returns the hash', async () => {
    const user = await service.register(validInput());
    expect(user.email).toBe('ana@apexforce.local');
    expect(user.role).toBe(ROLES.EMPLEADO_MOSTRADOR);
    expect(user.branchId).toBe(BRANCH_ID);
    expect(user).not.toHaveProperty('passwordHash');
    expect(hasher.hash).toHaveBeenCalledWith('clave-de-prueba-segura', 12);
    expect(repository.users[0].passwordHash).toBe('$2b$mock$12$clave-de-prueba-segura');
  });

  test('uses bcrypt for new password hashes', async () => {
    const realService = new AuthService({ userRepository: repository, jwtSecret: JWT_SECRET });
    await realService.register(validInput());
    expect(repository.users[0].passwordHash).toMatch(/^\$2[aby]\$12\$/);
    const result = await realService.login({ email: 'ana@apexforce.local', password: 'clave-de-prueba-segura' });
    expect(result.accessToken).toEqual(expect.any(String));
  });

  test('upgrades a valid legacy Argon2id hash to bcrypt after login', async () => {
    const password = 'clave-legada-segura';
    const legacyHash = await argon2.hash(password);
    const legacyRepository = createMemoryUserRepository([{
      id: 'legacy-user', name: 'Legacy', email: 'legacy@apexforce.local',
      passwordHash: legacyHash, role: ROLES.EMPLEADO_MOSTRADOR,
    }]);
    const legacyService = new AuthService({ userRepository: legacyRepository, jwtSecret: JWT_SECRET });

    const result = await legacyService.login({ email: 'legacy@apexforce.local', password });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(legacyRepository.users[0].passwordHash).toMatch(/^\$2[aby]\$12\$/);
    await expect(bcrypt.compare(password, legacyRepository.users[0].passwordHash)).resolves.toBe(true);
  });

  test.each([
    [{ name: 'A' }, 'INVALID_NAME'],
    [{ email: 'not-an-email' }, 'INVALID_EMAIL'],
    [{ password: 'short' }, 'INVALID_PASSWORD'],
    [{ password: 'á'.repeat(37) }, 'INVALID_PASSWORD'],
    [{ role: 'SUPER_ADMIN' }, 'INVALID_ROLE'],
    [{ branchId: 'not-a-uuid' }, 'INVALID_BRANCH'],
    [{ role: ROLES.ADMIN_GENERAL, branchId: BRANCH_ID }, 'INVALID_BRANCH'],
  ])('rejects invalid registration data %#', async (overrides, code) => {
    await expect(service.register(validInput(overrides))).rejects.toMatchObject({ code, status: 400 });
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  test('rejects a duplicate email before hashing', async () => {
    repository.users.push({ id: 'existing', email: 'ana@apexforce.local' });
    await expect(service.register(validInput())).rejects.toMatchObject({ code: 'EMAIL_IN_USE', status: 409 });
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  test('maps a concurrent unique-email violation to a conflict', async () => {
    repository.create = jest.fn(async () => {
      const error = new Error('unique violation');
      error.code = '23505';
      throw error;
    });
    await expect(service.register(validInput())).rejects.toMatchObject({ code: 'EMAIL_IN_USE', status: 409 });
  });

  test('propagates unexpected database errors', async () => {
    repository.create = jest.fn(async () => { throw new Error('database unavailable'); });
    await expect(service.register(validInput())).rejects.toThrow('database unavailable');
  });

  test('logs in and issues an expiring JWT with role and subject claims', async () => {
    const user = await service.register(validInput());
    const result = await service.login({ email: user.email, password: 'clave-de-prueba-segura' });
    const claims = jwt.verify(result.accessToken, JWT_SECRET, {
      algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE,
    });
    expect(result.tokenType).toBe('Bearer');
    expect(result.user.id).toBe(user.id);
    expect(claims.sub).toBe(user.id);
    expect(claims.role).toBe(ROLES.EMPLEADO_MOSTRADOR);
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  test('returns the same unauthorized error for unknown user and wrong password', async () => {
    await service.register(validInput());
    await expect(service.login({ email: 'missing@apexforce.local', password: 'clave-de-prueba-segura' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
    await expect(service.login({ email: 'ana@apexforce.local', password: 'otra-clave-incorrecta' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
  });

  test('rejects malformed login data and treats hash verification errors as invalid credentials', async () => {
    await expect(service.login({ email: 'bad', password: '' })).rejects.toMatchObject({ status: 400 });
    const user = await service.register(validInput());
    hasher.compare.mockRejectedValueOnce(new Error('bad stored hash'));
    await expect(service.login({ email: user.email, password: 'clave-de-prueba-segura' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 401 });
  });
});
