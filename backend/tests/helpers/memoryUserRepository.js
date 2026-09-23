function createMemoryUserRepository(initialUsers = []) {
  const users = initialUsers.map((user) => ({ ...user }));
  return {
    users,
    async findByEmail(email) {
      return users.find((user) => user.email === email) || null;
    },
    async findById(id) {
      return users.find((user) => user.id === id) || null;
    },
    async create(user) {
      if (users.some((existing) => existing.email === user.email)) {
        const error = new Error('duplicate email');
        error.code = '23505';
        throw error;
      }
      const created = { ...user, createdAt: new Date('2026-01-01T00:00:00.000Z') };
      users.push(created);
      return created;
    },
    async hasAdmin() {
      return users.some((user) => user.role === 'ADMIN_GENERAL');
    },
  };
}

module.exports = { createMemoryUserRepository };
