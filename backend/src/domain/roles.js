const ROLES = Object.freeze({
  ADMIN_GENERAL: 'ADMIN_GENERAL',
  GERENTE_SUCURSAL: 'GERENTE_SUCURSAL',
  EMPLEADO_MOSTRADOR: 'EMPLEADO_MOSTRADOR',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ROLE_VALUES };
