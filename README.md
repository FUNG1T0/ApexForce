# Apex Force

API monolítica para la operación de inventarios de sucursales de Apex Force.

## Alcance de este primer incremento

- Registro administrativo de usuarios internos e inicio de sesión con JWT.
- Roles `ADMIN_GENERAL`, `GERENTE_SUCURSAL` y `EMPLEADO_MOSTRADOR`.
- Contraseñas nuevas con bcrypt; las cuentas existentes con Argon2id se migran al iniciar sesión correctamente cuando la clave cabe en el límite de bcrypt.
- Consulta de productos e inventario para usuarios autenticados; la creación de productos y actualización de existencias requiere `ADMIN_GENERAL`.
- Auditoría transaccional de altas de usuarios, productos y existencias, con el actor tomado del token autenticado.
- Persistencia relacional con PostgreSQL para usuarios, roles, productos, existencias por sucursal y auditoría.
- Pruebas automatizadas con Jest y cobertura mínima del 80% sobre módulos de aplicación.

El alta de usuarios requiere un administrador autenticado. El primer administrador se crea una sola vez mediante el script de bootstrap; no existe un registro público que permita asignarse permisos elevados.

## Requisitos

- Node.js 22 o superior.
- Docker Desktop con Docker Compose, o una instancia compatible de PostgreSQL.

## Preparación local

1. Copia `backend/.env.example` a `backend/.env` y cambia `POSTGRES_PASSWORD` y `JWT_SECRET` por valores locales seguros; si cambias la contraseña de PostgreSQL, actualiza también la contraseña dentro de `DATABASE_URL`. El secreto JWT debe tener al menos 32 bytes.
2. Entra a `backend` e instala dependencias con `npm install`.
3. Inicia PostgreSQL con `docker compose up -d db`.
4. Ejecuta `npm run db:migrate`.
5. Define `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_PASSWORD` en `backend/.env`; ejecuta `npm run bootstrap:admin` una sola vez.
6. Inicia la API con `npm run dev`.

La API escucha en `http://localhost:3000`. `GET /health` es el chequeo de disponibilidad. `POST /auth/login` devuelve un token y `POST /auth/register` permite al administrador dar de alta usuarios. Las rutas anteriores `/api/auth/login` y `/api/auth/register` siguen disponibles como alias compatibles. `GET /api/users/me` devuelve el perfil del token actual.

### `GET /api/products`

Requiere `Authorization: Bearer <token>` y devuelve el catálogo de productos.

### `POST /api/products` (solo `ADMIN_GENERAL`)

```json
{"sku":"AF-001","name":"Producto de ejemplo","description":"Descripción opcional"}
```

SKU y nombre son obligatorios. El SKU se normaliza a mayúsculas y debe ser único.

### `GET /api/inventory`

Requiere `Authorization: Bearer <token>` y devuelve el inventario en formato `{ "items": [...] }`. Está disponible para cualquier usuario interno autenticado.

### `PUT /api/inventory` (solo `ADMIN_GENERAL`)

Establece la existencia de un producto para una sucursal. La cantidad debe ser un entero no negativo; el sistema registra el actor autenticado y el cambio en una transacción.

```json
{"productId":"223e4567-e89b-42d3-a456-426614174000","branchId":"123e4567-e89b-42d3-a456-426614174002","quantity":8}
```

## Esquema inicial de PostgreSQL

La migración `002_create_inventory_schema.sql` agrega las tablas `roles`, `products`, `inventory` y `audit_logs`, conservando la tabla `users` de la migración inicial. `users.role` referencia `roles.code`; cada existencia pertenece a un producto y a una sucursal, y la cantidad no puede ser negativa ni duplicarse para el mismo producto y sucursal. Los registros de auditoría conservan actor, acción, entidad, sucursal, detalles JSON y fecha. `schema_migrations` es una tabla técnica que registra las migraciones aplicadas. `branch_id` queda como identificador UUID sin FK porque el catálogo de sucursales no forma parte de las cinco tablas solicitadas.

## Pruebas

Desde `backend`:

```powershell
npm test
npm run test:coverage
```

Las pruebas de aplicación usan un repositorio en memoria, por lo que no requieren iniciar PostgreSQL. La cobertura se mide sobre lógica de aplicación; el punto de entrada del servidor y el adaptador de conexión no forman parte de esa métrica unitaria.

## Endpoints de autenticación

### `POST /auth/login`

```json
{"email":"admin@apexforce.local","password":"una-clave-segura"}
```

### `POST /auth/register` (solo `ADMIN_GENERAL`)

```json
{
  "name":"Ana López",
  "email":"ana@apexforce.local",
  "password":"una-clave-segura",
  "role":"EMPLEADO_MOSTRADOR",
  "branchId":null
}
```

### `GET /api/users/me`

Requiere `Authorization: Bearer <token>`.

Los roles de autorización se obtienen de la cuenta y del JWT firmado; el rol enviado en el cuerpo del login se ignora. El endpoint de registro requiere un administrador y valida el rol asignado a la nueva cuenta. bcrypt procesa como máximo 72 bytes UTF-8; por ello, las nuevas contraseñas se limitan a ese tamaño. Las claves de entorno y los archivos `.env` no deben subirse al repositorio. En producción, configura secretos por el gestor de secretos del proveedor de despliegue y habilita HTTPS.
