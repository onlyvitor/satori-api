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

  it('/api (GET) - hello world', () => {
    return request(app.getHttpServer()).get('/api').expect(200).expect('Hello World!');
  });

  it('/api/users (GET) - deve exigir autenticação', async () => {
    await request(app.getHttpServer()).get('/api/users').expect(401);
  });
});
