const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('node:crypto');
const { AppError } = require('../../domain/appError');
const { ROLES, ROLE_VALUES } = require('../../domain/roles');

const ISSUER = 'apex-force-api';
const AUDIENCE = 'apex-force-api';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    branchId: user.branchId ?? null,
    createdAt: user.createdAt,
  };
}

function validateRegistration(input = {}) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = input.password;
  const role = input.role;
  const branchId = input.branchId ?? null;

  if (name.length < 2 || name.length > 120) {
    throw new AppError(400, 'INVALID_NAME', 'El nombre debe tener entre 2 y 120 caracteres.');
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new AppError(400, 'INVALID_EMAIL', 'Ingresa un correo electrónico válido.');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new AppError(400, 'INVALID_PASSWORD', 'La contraseña debe tener entre 12 y 128 caracteres.');
  }
  if (!ROLE_VALUES.includes(role)) {
    throw new AppError(400, 'INVALID_ROLE', 'El rol solicitado no es válido.');
  }
  if (branchId !== null && (typeof branchId !== 'string' || !UUID_PATTERN.test(branchId))) {
    throw new AppError(400, 'INVALID_BRANCH', 'branchId debe ser un UUID válido o null.');
  }
  if (role === ROLES.ADMIN_GENERAL && branchId !== null) {
    throw new AppError(400, 'INVALID_BRANCH', 'El Administrador General no se asigna a una sucursal.');
  }

  return { name, email, password, role, branchId };
}

class AuthService {
  constructor({ userRepository, jwtSecret, tokenExpiresIn = '1h', passwordHasher = argon2, tokenSigner = jwt }) {
    if (!userRepository) throw new TypeError('userRepository is required');
    if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
      throw new TypeError('JWT secret must contain at least 32 bytes');
    }
    this.userRepository = userRepository;
    this.jwtSecret = jwtSecret;
    this.tokenExpiresIn = tokenExpiresIn;
    this.passwordHasher = passwordHasher;
    this.tokenSigner = tokenSigner;
  }

  async register(input, actorUserId = null) {
    const userInput = validateRegistration(input);
    const existing = await this.userRepository.findByEmail(userInput.email);
    if (existing) {
      throw new AppError(409, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese correo.');
    }

    const passwordHash = await this.passwordHasher.hash(userInput.password, {
      type: this.passwordHasher.argon2id,
    });

    try {
      const user = await this.userRepository.create({
        id: randomUUID(),
        name: userInput.name,
        email: userInput.email,
        passwordHash,
        role: userInput.role,
        branchId: userInput.branchId,
      }, actorUserId);
      return publicUser(user);
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError(409, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese correo.');
      }
      throw error;
    }
  }

  async login(input = {}) {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    const password = input.password;
    if (!EMAIL_PATTERN.test(email) || typeof password !== 'string' || password.length === 0) {
      throw new AppError(400, 'INVALID_CREDENTIALS', 'Correo o contraseña inválidos.');
    }

    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña inválidos.');

    let passwordMatches = false;
    try {
      passwordMatches = await this.passwordHasher.verify(user.passwordHash, password);
    } catch {
      passwordMatches = false;
    }
    if (!passwordMatches) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña inválidos.');
    }

    const accessToken = this.tokenSigner.sign(
      { role: user.role },
      this.jwtSecret,
      {
        algorithm: 'HS256',
        audience: AUDIENCE,
        expiresIn: this.tokenExpiresIn,
        issuer: ISSUER,
        subject: user.id,
      },
    );

    return { accessToken, tokenType: 'Bearer', expiresIn: this.tokenExpiresIn, user: publicUser(user) };
  }
}

module.exports = { AuthService, AUDIENCE, ISSUER, publicUser, validateRegistration };
