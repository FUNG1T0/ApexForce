const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { AppError } = require('./domain/appError');
const { AuthService } = require('./modules/auth/authService');
const { InventoryService } = require('./modules/inventory/inventoryService');
const { createAuthenticate } = require('./middleware/authenticate');
const { requireRoles } = require('./middleware/requireRoles');
const { ROLES } = require('./domain/roles');

function createApp({
  userRepository,
  inventoryRepository,
  jwtSecret,
  tokenExpiresIn = '1h',
  passwordHasher,
  loginLimiter,
} = {}) {
  if (!userRepository) throw new TypeError('userRepository is required');
  if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new TypeError('JWT_SECRET must contain at least 32 bytes');
  }
  const inventoryMethods = ['list', 'listProducts', 'createProduct', 'setQuantity'];
  if (!inventoryRepository || inventoryMethods.some((method) => typeof inventoryRepository[method] !== 'function')) {
    throw new TypeError(`inventoryRepository must implement: ${inventoryMethods.join(', ')}`);
  }

  const app = express();
  const authService = new AuthService({ userRepository, jwtSecret, tokenExpiresIn, passwordHasher });
  const inventoryService = new InventoryService({ inventoryRepository });
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

  const login = async (req, res, next) => {
    try {
      const result = await authService.login(req.body);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  };
  app.post('/auth/login', signInLimit, login);
  app.post('/api/auth/login', signInLimit, login);

  const register = async (req, res, next) => {
    try {
      const user = await authService.register(req.body, req.auth.userId);
      return res.status(201).json({ user });
    } catch (error) {
      return next(error);
    }
  };
  app.post('/auth/register', authenticate, requireRoles(ROLES.ADMIN_GENERAL), register);
  app.post('/api/auth/register', authenticate, requireRoles(ROLES.ADMIN_GENERAL), register);

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

  app.get('/api/inventory', authenticate, async (req, res, next) => {
    try {
      const items = await inventoryService.listInventory();
      return res.status(200).json({ items });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/products', authenticate, async (req, res, next) => {
    try {
      const products = await inventoryService.listProducts();
      return res.status(200).json({ products });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/products', authenticate, requireRoles(ROLES.ADMIN_GENERAL), async (req, res, next) => {
    try {
      const product = await inventoryService.createProduct(req.body, req.auth.userId);
      return res.status(201).json({ product });
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/inventory', authenticate, requireRoles(ROLES.ADMIN_GENERAL), async (req, res, next) => {
    try {
      const item = await inventoryService.setQuantity(req.body, req.auth.userId);
      return res.status(200).json({ item });
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
