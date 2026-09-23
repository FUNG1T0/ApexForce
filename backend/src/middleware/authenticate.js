const jwt = require('jsonwebtoken');
const { AppError } = require('../domain/appError');
const { AUDIENCE, ISSUER } = require('../modules/auth/authService');
const { ROLE_VALUES } = require('../domain/roles');

function createAuthenticate({ jwtSecret, tokenVerifier = jwt }) {
  return function authenticate(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    if (!match) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Se requiere un token Bearer válido.'));
    }

    try {
      const claims = tokenVerifier.verify(match[1], jwtSecret, {
        algorithms: ['HS256'],
        audience: AUDIENCE,
        issuer: ISSUER,
      });
      if (!claims || typeof claims.sub !== 'string' || !ROLE_VALUES.includes(claims.role)) {
        throw new Error('Invalid token claims');
      }
      req.auth = { userId: claims.sub, role: claims.role };
      return next();
    } catch {
      return next(new AppError(401, 'INVALID_TOKEN', 'El token es inválido o ha expirado.'));
    }
  };
}

module.exports = { createAuthenticate };
