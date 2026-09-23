# API de productos, inventario y auditoría

Todas las rutas requieren `Authorization: Bearer <token>`, excepto los endpoints de autenticación documentados en el README.

## Consultas

- `GET /api/products`: devuelve el catálogo de productos para cualquier usuario autenticado.
- `GET /api/inventory`: devuelve las existencias por producto y sucursal para cualquier usuario autenticado.

## Escrituras

Las escrituras requieren el rol `ADMIN_GENERAL`.

### `POST /api/products`

```json
{"sku":"AF-001","name":"Producto de ejemplo","description":"Descripción opcional"}
```

`sku` y `name` son obligatorios. El SKU se normaliza a mayúsculas y debe ser único.

### `PUT /api/inventory`

Establece o actualiza la existencia de un producto para una sucursal. `productId` y `branchId` deben ser UUID válidos; `quantity` debe ser un entero entre 0 y 2147483647.

```json
{"productId":"223e4567-e89b-42d3-a456-426614174000","branchId":"123e4567-e89b-42d3-a456-426614174002","quantity":8}
```

## Auditoría

Las altas de usuarios, productos y existencias se guardan junto con sus registros de auditoría en una transacción. El actor se toma del `sub` del JWT verificado; cualquier `actorUserId` enviado en el cuerpo se ignora. Un error al escribir la auditoría revierte también el cambio de negocio.

## Esquema

La migración `db/migrations/002_create_inventory_schema.sql` crea `roles`, `products`, `inventory` y `audit_logs`, y relaciona `users.role` con `roles.code`. La base de datos además rechaza cantidades negativas y duplicados para un mismo producto y sucursal. `schema_migrations` registra las migraciones; `branch_id` es UUID sin llave foránea porque no existe un catálogo de sucursales en el alcance actual.
