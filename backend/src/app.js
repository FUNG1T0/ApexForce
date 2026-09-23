const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { AppError } = require('./domain/appError');
const { AuthService } = require('./modules/auth/authService');
const { createAuthenticate } = require('./middleware/authenticate');
const { requireRoles } = require('./middleware/requireRoles');
const { ROLES } = require('./domain/roles');

function createApp({ userRepository, jwtSecret, tokenExpiresIn = '1h', passwordHasher, loginLimiter } = {}) {
  if (!userRepository) throw new TypeError('userRepository is required');
  if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new TypeError('JWT_SECRET must contain at least 32 bytes');
  }

  const app = express();
  const authService = new AuthService({ userRepository, jwtSecret, tokenExpiresIn, passwordHasher });
  const authenticate = createAuthenticate({ jwtSecret });
  const signInLimit = loginLimiter || rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { code: 'LOGIN_RATE_LIMIT', message: 'Demasiados intentos; inténtalo más tarde.' } },
  });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.post('/api/auth/login', signInLimit, async (req, res, next) => {
    try {
      const result = await authService.login(req.body);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/register', authenticate, requireRoles(ROLES.ADMIN_GENERAL), async (req, res, next) => {
    try {
      const user = await authService.register(req.body);
      return res.status(201).json({ user });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/users/me', authenticate, async (req, res, next) => {
    try {
      const user = await userRepository.findById(req.auth.userId);
      if (!user) throw new AppError(401, 'ACCOUNT_NOT_FOUND', 'La cuenta asociada al token ya no existe.');
      const { passwordHash, ...safeUser } = user;
      return res.status(200).json({ user: safeUser });
    } catch (error) {
      return next(error);
    }
  });

  app.use((req, res, next) => next(new AppError(404, 'NOT_FOUND', 'La ruta solicitada no existe.')));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo JSON no es válido.' } });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'El cuerpo excede el límite permitido.' } });
    }
    if (error instanceof AppError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno.' } });
  });

  return app;
}

module.exports = { createApp };
