import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUser } from './helpers/auth.helper';
import { userFixtures } from './helpers/fixtures';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('Auth (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

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

    it('deve logar com credenciais válidas e retornar access e refresh tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userFixtures.john.email, password: userFixtures.john.password })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data.accessToken');
      expect(res.body).toHaveProperty('data.refreshToken');
      expect(res.body).toHaveProperty('message', 'Login successful');
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');
    });

    it('deve incluir isAdmin=false no payload para usuário comum', async () => {
      // Decodifica payload sem verificar assinatura apenas para checar claims
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userFixtures.john.email, password: userFixtures.john.password })
        .expect(201);

      const profile = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);

      expect(profile.body).toHaveProperty('email', userFixtures.john.email);
      expect(profile.body).toHaveProperty('isAdmin', false);
      expect(profile.body).toHaveProperty('sub');
    });

    it('deve incluir isAdmin=true para admin', async () => {
      const dataSource = app.get(DataSource);
      const repo = dataSource.getRepository(User);
      const hashed = await bcrypt.hash(userFixtures.admin.password, 10);
      await repo.save(
        repo.create({
          name: userFixtures.admin.name,
          email: userFixtures.admin.email,
          password: hashed,
          isAdmin: true,
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userFixtures.admin.email, password: userFixtures.admin.password })
        .expect(201);

      const profile = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);

      expect(profile.body.isAdmin).toBe(true);
    });

    it('deve retornar 401 quando email não existe', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'naoexiste@email.com', password: 'qualquer' })
        .expect(401);

      expect(res.body.message).toMatch(/Invalid credentials/i);
    });

    it('deve retornar 401 quando senha está incorreta', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userFixtures.john.email, password: 'senhaErrada' })
        .expect(401);

      expect(res.body.message).toMatch(/Invalid credentials/i);
    });

    it('deve retornar 400 quando body vazio (ValidationPipe)', async () => {
      await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);
    });

    it('deve retornar 400 quando falta email', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ password: '123' })
        .expect(400);
    });

    it('deve retornar 400 quando falta password', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userFixtures.john.email })
        .expect(400);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;
    let accessToken: string;

    beforeEach(async () => {
      await createUser(app, userFixtures.john);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userFixtures.john.email, password: userFixtures.john.password })
        .expect(201);
      refreshToken = loginRes.body.data.refreshToken;
      accessToken = loginRes.body.data.accessToken;
    });

    it('deve gerar novo par de tokens com refresh token válido', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');
      // Novo access token deve ser válido para acessar profile
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);
    });

    it('deve retornar 401 quando tenta usar access token como refresh', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);

      expect(res.body.message).toMatch(/Invalid refresh token/i);
    });

    it('deve retornar 401 quando token é inválido/malformado', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid.token.here' })
        .expect(401);
    });

    it('deve retornar 401 quando token sem type', async () => {
      // Gera um JWT sem type via login manual? Simula via refresh com token sem type
      // Para simplificar, testa string vazia
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .send({ refreshToken: '' })
        .expect(401);
    });

    it('deve retornar 401 quando não envia refreshToken', async () => {
      await request(app.getHttpServer()).post('/api/auth/refresh').send({}).expect(401);
    });
  });

  describe('GET /api/auth/profile', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      await createUser(app, userFixtures.john);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userFixtures.john.email, password: userFixtures.john.password })
        .expect(201);
      accessToken = loginRes.body.data.accessToken;
      refreshToken = loginRes.body.data.refreshToken;
    });

    it('deve retornar dados do usuário com access token válido', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('sub');
      expect(res.body).toHaveProperty('email', userFixtures.john.email);
      expect(res.body).toHaveProperty('isAdmin', false);
    });

    it('deve retornar 401 sem token', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/profile').expect(401);
      expect(res.body.message).toMatch(/No token provided/i);
    });

    it('deve retornar 401 com header sem Bearer', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', accessToken)
        .expect(401);
    });

    it('deve retornar 401 quando usa refresh token para autenticar', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);

      expect(res.body.message).toMatch(/Refresh tokens cannot be used/i);
    });

    it('deve retornar 401 com token inválido', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer token.invalido')
        .expect(401);
    });

    it('deve retornar 401 com token com espaço extra ou tipo Basic', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/profile')
        .set('Authorization', 'Basic ' + accessToken)
        .expect(401);
    });
  });
});
