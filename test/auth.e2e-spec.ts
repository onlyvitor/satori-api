import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUser, createAdminViaRepo, login } from './helpers/auth.helper';
import { userFixtures } from './helpers/fixtures';
import { authHeader } from './helpers/api.helper';

describe('Auth (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

  const api = () => request(app.getHttpServer());
  const loginAs = (email: string, password: string) =>
    api().post('/api/auth/login').send({ email, password });
  const getProfile = (token?: string) => {
    const req = api().get('/api/auth/profile');
    if (token) req.set(authHeader(token));
    return req;
  };
  const refresh = (token: string) => api().post('/api/auth/refresh').send({ refreshToken: token });

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

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await createUser(app, userFixtures.john);
    });

    it('deve logar e retornar access e refresh tokens', async () => {
      const res = await loginAs(userFixtures.john.email, userFixtures.john.password).expect(201);

      expect(res.body).toMatchObject({ success: true, message: 'Login successful' });
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(typeof res.body.data.accessToken).toBe('string');
    });

    it('deve incluir isAdmin=false para usuario comum', async () => {
      const { body } = await loginAs(userFixtures.john.email, userFixtures.john.password).expect(201);
      const profile = await getProfile(body.data.accessToken).expect(200);

      expect(profile.body).toMatchObject({ email: userFixtures.john.email, isAdmin: false });
      expect(profile.body).toHaveProperty('sub');
    });

    it('deve incluir isAdmin=true para admin', async () => {
      await createAdminViaRepo(app, userFixtures.admin);

      const { body } = await loginAs(userFixtures.admin.email, userFixtures.admin.password).expect(201);
      const profile = await getProfile(body.data.accessToken).expect(200);
      expect(profile.body.isAdmin).toBe(true);
    });

    it('deve retornar 401 quando email não existe', async () => {
      const res = await loginAs('naoexiste@email.com', 'qualquer').expect(401);
      expect(res.body.message).toMatch(/Invalid credentials/i);
    });

    it('deve retornar 401 quando senha incorreta', async () => {
      const res = await loginAs(userFixtures.john.email, 'senhaErrada').expect(401);
      expect(res.body.message).toMatch(/Invalid credentials/i);
    });

    it.each([
      [{}, 'body vazio'],
      [{ password: '123' }, 'falta email'],
      [{ email: userFixtures.john.email }, 'falta password'],
    ])('deve retornar 400 quando %s (%s)', async (payload) => {
      await api().post('/api/auth/login').send(payload).expect(400);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;
    let accessToken: string;

    beforeEach(async () => {
      await createUser(app, userFixtures.john);
      const { body } = await loginAs(userFixtures.john.email, userFixtures.john.password).expect(201);
      refreshToken = body.data.refreshToken;
      accessToken = body.data.accessToken;
    });

    it('deve gerar novo par com refresh válido', async () => {
      const res = await refresh(refreshToken).expect(201);
      expect(res.body).toMatchObject({ success: true });
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');

      await getProfile(res.body.data.accessToken).expect(200);
    });

    it('deve retornar 401 quando tenta usar access token como refresh', async () => {
      const res = await refresh(accessToken).expect(401);
      expect(res.body.message).toMatch(/Invalid refresh token/i);
    });

    it.each([
      ['invalid.token.here', 'token malformado'],
      ['', 'token vazio/sem type'],
    ])('deve retornar 401 quando token é %s', async (tok) => {
      await refresh(tok).expect(401);
    });

    it('deve retornar 401 quando não envia refreshToken', async () => {
      await api().post('/api/auth/refresh').send({}).expect(401);
    });
  });

  describe('GET /api/auth/profile', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      await createUser(app, userFixtures.john);
      const { body } = await loginAs(userFixtures.john.email, userFixtures.john.password).expect(201);
      accessToken = body.data.accessToken;
      refreshToken = body.data.refreshToken;
    });

    it('deve retornar dados com access token válido', async () => {
      const res = await getProfile(accessToken).expect(200);
      expect(res.body).toMatchObject({ email: userFixtures.john.email, isAdmin: false });
      expect(res.body).toHaveProperty('sub');
    });

    it('deve retornar 401 sem token', async () => {
      const res = await getProfile().expect(401);
      expect(res.body.message).toMatch(/No token provided/i);
    });

    it('deve retornar 401 com header sem Bearer', async () => {
      await api().get('/api/auth/profile').set('Authorization', accessToken).expect(401);
    });

    it('deve retornar 401 com tipo Basic', async () => {
      await api().get('/api/auth/profile').set('Authorization', 'Basic ' + accessToken).expect(401);
    });

    it('deve retornar 401 quando usa refresh token', async () => {
      const res = await getProfile(refreshToken).expect(401);
      expect(res.body.message).toMatch(/Refresh tokens cannot be used/i);
    });

    it('deve retornar 401 com token inválido', async () => {
      await getProfile('token.invalido').expect(401);
      await api().get('/api/auth/profile').set('Authorization', 'Bearer token.invalido').expect(401);
    });
  });
});
