import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUserAndLogin } from './helpers/auth.helper';
import { authHeader } from './helpers/api.helper';

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

  const api = () => request(app.getHttpServer());

  it('GET /api deve exigir autenticação', async () => {
    await api().get('/api').expect(401);
  });

  it('GET /api deve retornar Hello World com token válido', async () => {
    const { accessToken } = await createUserAndLogin(app, {
      name: 'tester',
      email: 'tester@app.com',
      password: 'password123',
    });

    await api().get('/api').set(authHeader(accessToken)).expect(200).expect('Hello World!');
  });

  it('GET /api/users deve exigir autenticação', async () => {
    await api().get('/api/users').expect(401);
  });
});
