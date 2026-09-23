const { createAuthenticate } = require('../src/middleware/authenticate');
const { requireRoles } = require('../src/middleware/requireRoles');
const { ROLES } = require('../src/domain/roles');

const JWT_SECRET = 'test-only-secret-with-at-least-32-bytes';

function makeResponse() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('authorization middleware', () => {
  test('requires a Bearer token before verifying', () => {
    const verifier = { verify: jest.fn() };
    const middleware = createAuthenticate({ jwtSecret: JWT_SECRET, tokenVerifier: verifier });
    const req = { get: () => 'Basic abc' };
    const next = jest.fn();
    middleware(req, makeResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, code: 'AUTH_REQUIRED' }));
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  test('rejects token claims without a subject or known role', () => {
    const verifier = { verify: jest.fn().mockReturnValue({ sub: 'id', role: 'ROOT' }) };
    const middleware = createAuthenticate({ jwtSecret: JWT_SECRET, tokenVerifier: verifier });
    const next = jest.fn();
    middleware({ get: () => 'Bearer token' }, makeResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401, code: 'INVALID_TOKEN' }));
  });

  test('accepts a verified known-role token and attaches only authorization claims', () => {
    const verifier = { verify: jest.fn().mockReturnValue({ sub: 'user-1', role: ROLES.ADMIN_GENERAL }) };
    const middleware = createAuthenticate({ jwtSecret: JWT_SECRET, tokenVerifier: verifier });
    const req = { get: () => 'Bearer valid' };
    const next = jest.fn();
    middleware(req, makeResponse(), next);
    expect(req.auth).toEqual({ userId: 'user-1', role: ROLES.ADMIN_GENERAL });
    expect(next).toHaveBeenCalledWith();
  });

  test('handles token-verification failures as unauthorized', () => {
    const verifier = { verify: jest.fn(() => { throw new Error('bad signature'); }) };
    const middleware = createAuthenticate({ jwtSecret: JWT_SECRET, tokenVerifier: verifier });
    const next = jest.fn();
    middleware({ get: () => 'Bearer invalid' }, makeResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_TOKEN' }));
  });

  test('requires authentication and enforces the allowed role list', () => {
    const authorize = requireRoles(ROLES.ADMIN_GENERAL);
    const noAuthNext = jest.fn();
    authorize({}, makeResponse(), noAuthNext);
    expect(noAuthNext).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));

    const employeeNext = jest.fn();
    authorize({ auth: { role: ROLES.EMPLEADO_MOSTRADOR } }, makeResponse(), employeeNext);
    expect(employeeNext).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));

    const adminNext = jest.fn();
    authorize({ auth: { role: ROLES.ADMIN_GENERAL } }, makeResponse(), adminNext);
    expect(adminNext).toHaveBeenCalledWith();
  });
});
