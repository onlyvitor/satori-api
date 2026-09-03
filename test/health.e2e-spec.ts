import request from 'supertest';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';

describe('Health (e2e)', () => {
  let ctx: TestAppContext;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await closeTestApp(ctx); });

  it('GET /api/health deve ser público e retornar ok', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
  });

  it('GET /api deve exigir auth (não público)', async () => {
    await request(ctx.app.getHttpServer()).get('/api').expect(401);
  });
});
