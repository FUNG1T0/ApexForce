const { InventoryService } = require('../src/modules/inventory/inventoryService');

const PRODUCT_ID = '223e4567-e89b-42d3-a456-426614174000';
const BRANCH_ID = '123e4567-e89b-42d3-a456-426614174002';

function setup() {
  const inventoryRepository = {
    list: jest.fn().mockResolvedValue([]),
    listProducts: jest.fn().mockResolvedValue([]),
    createProduct: jest.fn().mockResolvedValue({ id: PRODUCT_ID, sku: 'AF-001', name: 'Producto' }),
    setQuantity: jest.fn().mockResolvedValue({ productId: PRODUCT_ID, branchId: BRANCH_ID, quantity: 4 }),
  };
  return { inventoryRepository, service: new InventoryService({ inventoryRepository }) };
}

describe('InventoryService', () => {
  test('normalizes product data and passes the authenticated actor to persistence', async () => {
    const { service, inventoryRepository } = setup();
    await service.createProduct({ sku: ' af-001 ', name: ' Producto ', description: ' Inicial ' }, 'admin-id');
    expect(inventoryRepository.createProduct).toHaveBeenCalledWith({
      sku: 'AF-001', name: 'Producto', description: 'Inicial', actorUserId: 'admin-id',
    });
  });

  test.each([
    [{ name: 'Producto' }, 'INVALID_SKU'],
    [{ sku: 'AF-001' }, 'INVALID_PRODUCT_NAME'],
    [{ sku: 'AF-001', name: 'Producto', description: 5 }, 'INVALID_DESCRIPTION'],
  ])('rejects incomplete or malformed product data %#', async (product, code) => {
    const { service, inventoryRepository } = setup();
    await expect(service.createProduct(product, 'admin-id')).rejects.toMatchObject({ status: 400, code });
    expect(inventoryRepository.createProduct).not.toHaveBeenCalled();
  });

  test('rejects duplicate SKUs as a conflict', async () => {
    const { service, inventoryRepository } = setup();
    inventoryRepository.createProduct.mockRejectedValueOnce({ code: '23505' });
    await expect(service.createProduct({ sku: 'AF-001', name: 'Producto' }, 'admin-id'))
      .rejects.toMatchObject({ status: 409, code: 'SKU_IN_USE' });
  });

  test('accepts zero quantity and rejects negative, fractional, excessive, and malformed values', async () => {
    const { service, inventoryRepository } = setup();
    await service.setQuantity({ productId: PRODUCT_ID, branchId: BRANCH_ID, quantity: 0 }, 'admin-id');
    expect(inventoryRepository.setQuantity).toHaveBeenCalledWith({
      productId: PRODUCT_ID, branchId: BRANCH_ID, quantity: 0, actorUserId: 'admin-id',
    });

    for (const quantity of [-1, 1.5, 2_147_483_648, '3']) {
      await expect(service.setQuantity({ productId: PRODUCT_ID, branchId: BRANCH_ID, quantity }, 'admin-id'))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_QUANTITY' });
    }
    await expect(service.setQuantity({ productId: 'bad-id', branchId: BRANCH_ID, quantity: 1 }, 'admin-id'))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_PRODUCT_ID' });
    expect(inventoryRepository.setQuantity).toHaveBeenCalledTimes(1);
  });

  test('maps missing products from PostgreSQL to not found', async () => {
    const { service, inventoryRepository } = setup();
    inventoryRepository.setQuantity.mockRejectedValueOnce({ code: '23503' });
    await expect(service.setQuantity({ productId: PRODUCT_ID, branchId: BRANCH_ID, quantity: 4 }, 'admin-id'))
      .rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' });
  });
});
