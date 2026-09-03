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
