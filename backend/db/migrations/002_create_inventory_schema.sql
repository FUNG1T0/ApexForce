CREATE TABLE IF NOT EXISTS roles (
  code VARCHAR(32) PRIMARY KEY,
  description VARCHAR(120) NOT NULL
);

INSERT INTO roles (code, description)
VALUES
  ('ADMIN_GENERAL', 'Administra la plataforma y las sucursales.'),
  ('GERENTE_SUCURSAL', 'Administra la operación de una sucursal.'),
  ('EMPLEADO_MOSTRADOR', 'Consulta y opera el inventario de su sucursal.')
ON CONFLICT (code) DO UPDATE
SET description = EXCLUDED.description;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_fk'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_fk
      FOREIGN KEY (role) REFERENCES roles (code)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS products_active_name_idx
  ON products (is_active, name);

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_product_branch_unique UNIQUE (product_id, branch_id)
);

CREATE INDEX IF NOT EXISTS inventory_branch_idx
  ON inventory (branch_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  branch_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
  ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_entity_created_idx
  ON audit_logs (entity_type, entity_id, created_at DESC);
