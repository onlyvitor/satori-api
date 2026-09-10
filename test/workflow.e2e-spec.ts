import * as fs from 'fs';
import * as path from 'path';

describe('Workflow (e2e) – .github/workflows/workflow.yaml', () => {
  const workflowPath = path.resolve(__dirname, '../.github/workflows/workflow.yaml');
  let content: string;

  beforeAll(() => {
    expect(fs.existsSync(workflowPath)).toBe(true);
    content = fs.readFileSync(workflowPath, 'utf-8');
  });

  it('deve existir e ser YAML válido', () => {
    expect(content.length).toBeGreaterThan(0);
    // Checagem básica de YAML - deve conter chaves topo
    expect(content).toMatch(/name:\s*.+/);
    expect(content).toMatch(/on:\s*\n/);
    expect(content).toMatch(/jobs:\s*\n/);
  });

  it('deve disparar em push, pull_request e workflow_dispatch', () => {
    expect(content).toMatch(/push:/);
    expect(content).toMatch(/pull_request:/);
    expect(content).toMatch(/workflow_dispatch:/);
  });

  it('deve ter job unit que roda testes unitários', () => {
    expect(content).toMatch(/\bunit:\s*\n/);
    expect(content).toMatch(/runs-on:\s*ubuntu-latest/);
    expect(content).toMatch(/actions\/checkout@v4/);
    expect(content).toMatch(/actions\/setup-node@v4/);
    expect(content).toMatch(/node-version:\s*22\.x/);
    expect(content).toMatch(/cache:\s*npm/);
    expect(content).toMatch(/npm ci/);
    expect(content).toMatch(/npm run test\b/);
  });

  it('deve ter job e2e que roda testes e2e', () => {
    expect(content).toMatch(/\be2e:\s*\n/);
    expect(content).toMatch(/npm run test:e2e/);
  });

  it('deve configurar postgres service para e2e', () => {
    expect(content).toMatch(/services:\s*\n/);
    expect(content).toMatch(/postgres:\s*\n/);
    expect(content).toMatch(/image:\s*postgres:16/);
    expect(content).toMatch(/POSTGRES_USER:\s*postgres/);
    expect(content).toMatch(/POSTGRES_PASSWORD:\s*12345678/);
    expect(content).toMatch(/POSTGRES_DB:\s*db_test/);
    expect(content).toMatch(/ports:\s*\n\s*- 5432:5432/);
    expect(content).toMatch(/health-cmd pg_isready/);
  });

  it('deve expor envs de teste para e2e (DB_* e JWT_SECRET)', () => {
    // bloco env do job e2e
    expect(content).toMatch(/DB_HOST:\s*localhost/);
    expect(content).toMatch(/DB_PORT:\s*5432/);
    expect(content).toMatch(/DB_USER:\s*postgres/);
    expect(content).toMatch(/DB_PASSWORD:\s*12345678/);
    expect(content).toMatch(/DB_NAME:\s*db_test/);
    expect(content).toMatch(/JWT_SECRET:\s*.+/);
  });

  it('deve usar checkout v4 e setup-node v4 em ambos os jobs', () => {
    const checkoutMatches = content.match(/actions\/checkout@v4/g) || [];
    const setupMatches = content.match(/actions\/setup-node@v4/g) || [];
    // espera ao menos 2 ocorrências (unit + e2e)
    expect(checkoutMatches.length).toBeGreaterThanOrEqual(2);
    expect(setupMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('não deve conter workflow legado com typo ou node 20 sem cache', () => {
    // garante que o workflow antigo foi substituído
    expect(content).not.toMatch(/continuos integration/);
    expect(content).not.toMatch(/actions\/checkout@v3/);
    // permite node 20 apenas se for acompanhado de cache, mas ideal é 22.x
    if (content.match(/node-version:\s*20\.x/)) {
      expect(content).toMatch(/cache:\s*npm/);
    }
  });

  it('deve ter steps de install com npm ci (não npm install)', () => {
    expect(content).toMatch(/npm ci/);
    // garante que não usa npm install puro (sem ci) no workflow novo
    // o workflow antigo usava "npm install", o novo deve usar "npm ci"
    const hasNpmInstall = /run:\s*npm install\b/.test(content);
    const hasNpmCi = /run:\s*npm ci\b/.test(content);
    expect(hasNpmCi).toBe(true);
    // se ainda tiver npm install, deve ser apenas como fallback comentado, não como step principal
    if (hasNpmInstall) {
      expect(content).not.toMatch(/name:\s*run install\s*\n\s*run:\s*npm install/);
    }
  });
});
