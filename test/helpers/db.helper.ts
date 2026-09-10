import { DataSource } from 'typeorm';

export async function cleanDb(dataSource: DataSource) {
  if (!dataSource.isInitialized) return;
  // Trunca todas as tabelas com CASCADE e reseta IDs
  // Ordem: rating depende de user
  const entities = dataSource.entityMetadatas;
  const tableNames = entities.map((e) => `"${e.tableName}"`).join(', ');
  if (tableNames) {
    await dataSource.query(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE;`);
  }
}

/** Cria usuário direto no repo (útil para admin) – evita duplicação nos specs */
export async function createAdminDirect(dataSource: DataSource, adminDto: any) {
  const { User } = await import('../../src/users/entities/user.entity');
  const bcrypt = await import('bcrypt');
  const repo = dataSource.getRepository(User);
  const hashed = await bcrypt.hash(adminDto.password, 10);
  const admin = repo.create({
    name: adminDto.name,
    email: adminDto.email,
    password: hashed,
    isAdmin: true,
  });
  return repo.save(admin);
}
