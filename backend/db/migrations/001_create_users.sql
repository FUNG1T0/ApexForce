CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (
    role IN ('ADMIN_GENERAL', 'GERENTE_SUCURSAL', 'EMPLEADO_MOSTRADOR')
  ),
  branch_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_has_no_branch CHECK (
    role <> 'ADMIN_GENERAL' OR branch_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
