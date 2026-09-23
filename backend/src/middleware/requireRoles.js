const { AppError } = require('../domain/appError');

function requireRoles(...allowedRoles) {
  return function authorize(req, res, next) {
    if (!req.auth) {
      return next(new AppError(401, 'AUTH_REQUIRED', 'Se requiere autenticación.'));
    }
    if (!allowedRoles.includes(req.auth.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'No tienes permisos para realizar esta acción.'));
    }
    return next();
  };
}

module.exports = { requireRoles };
