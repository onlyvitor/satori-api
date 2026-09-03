import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';

describe('AppController (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication<App>;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  beforeEach(async () => {
    await cleanDb(ctx.dataSource);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('/api (GET) - deve exigir autenticação (guard global)', async () => {
    await request(app.getHttpServer()).get('/api').expect(401);
  });

  it('/api (GET) - deve retornar Hello World com token válido', async () => {
    // cria usuário e loga
    await request(app.getHttpServer()).post('/api/users').send({
      name: 'tester',
      email: 'tester@app.com',
      password: 'password123',
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'tester@app.com', password: 'password123' });

    const token = login.body.data.accessToken;

    await request(app.getHttpServer())
      .get('/api')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect('Hello World!');
  });

  it('/api/users (GET) - deve exigir autenticação', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });
});
