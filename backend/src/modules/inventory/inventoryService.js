const { AppError } = require('../../domain/appError');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

function validateProduct(input = {}) {
  const sku = typeof input.sku === 'string' ? input.sku.trim().toUpperCase() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const description = input.description === undefined || input.description === null
    ? null
    : typeof input.description === 'string' ? input.description.trim() : undefined;

  if (!SKU_PATTERN.test(sku)) {
    throw new AppError(400, 'INVALID_SKU', 'El SKU es obligatorio y debe tener de 2 a 64 caracteres válidos.');
  }
  if (name.length < 2 || name.length > 160) {
    throw new AppError(400, 'INVALID_PRODUCT_NAME', 'El nombre es obligatorio y debe tener de 2 a 160 caracteres.');
  }
  if (description === undefined || (description !== null && description.length > 2000)) {
    throw new AppError(400, 'INVALID_DESCRIPTION', 'La descripción debe ser texto de hasta 2000 caracteres.');
  }
  return { sku, name, description };
}

function validateInventoryUpdate(input = {}) {
  const { productId, branchId, quantity } = input;
  if (typeof productId !== 'string' || !UUID_PATTERN.test(productId)) {
    throw new AppError(400, 'INVALID_PRODUCT_ID', 'productId debe ser un UUID válido.');
  }
  if (typeof branchId !== 'string' || !UUID_PATTERN.test(branchId)) {
    throw new AppError(400, 'INVALID_BRANCH_ID', 'branchId debe ser un UUID válido.');
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_POSTGRES_INTEGER) {
    throw new AppError(400, 'INVALID_QUANTITY', 'quantity debe ser un entero entre 0 y 2147483647.');
  }
  return { productId, branchId, quantity };
}

class InventoryService {
  constructor({ inventoryRepository }) {
    if (!inventoryRepository) throw new TypeError('inventoryRepository is required');
    this.inventoryRepository = inventoryRepository;
  }

  async listInventory() {
    return this.inventoryRepository.list();
  }

  async listProducts() {
    return this.inventoryRepository.listProducts();
  }

  async createProduct(input, actorUserId) {
    const product = validateProduct(input);
    try {
      return await this.inventoryRepository.createProduct({ ...product, actorUserId });
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError(409, 'SKU_IN_USE', 'Ya existe un producto con ese SKU.');
      }
      throw error;
    }
  }

  async setQuantity(input, actorUserId) {
    const update = validateInventoryUpdate(input);
    try {
      return await this.inventoryRepository.setQuantity({ ...update, actorUserId });
    } catch (error) {
      if (error.code === '23503') {
        throw new AppError(404, 'PRODUCT_NOT_FOUND', 'El producto indicado no existe.');
      }
      throw error;
    }
  }
}

module.exports = { InventoryService, validateInventoryUpdate, validateProduct };
