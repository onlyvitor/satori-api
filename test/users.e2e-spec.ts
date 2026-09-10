import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUser, login, createAdminAndLogin } from './helpers/auth.helper';
import { userFixtures } from './helpers/fixtures';
import { authHeader } from './helpers/api.helper';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('Users (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

  const api = () => request(app.getHttpServer());
  const getUsers = (token?: string) => {
    const req = api().get('/api/users');
    if (token) req.set(authHeader(token));
    return req;
  };
  const getUserById = (id: number, token?: string) => {
    const req = api().get(`/api/users/${id}`);
    if (token) req.set(authHeader(token));
    return req;
  };
  const patchUser = (id: number, token: string | undefined, body: any) => {
    const req = api().patch(`/api/users/${id}`).send(body);
    if (token) req.set(authHeader(token));
    return req;
  };
  const deleteUser = (id: number, token?: string) => {
    const req = api().delete(`/api/users/${id}`);
    if (token) req.set(authHeader(token));
    return req;
  };

  async function setupThreeUsers() {
    const john = await createUser(app, userFixtures.john);
    const jane = await createUser(app, userFixtures.jane);
    const johnTokens = await login(app, userFixtures.john.email, userFixtures.john.password);
    const janeTokens = await login(app, userFixtures.jane.email, userFixtures.jane.password);
    const adminTokens = await createAdminAndLogin(app, userFixtures.admin);
    return { john, jane, johnTokens, janeTokens, adminTokens };
  }

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

  describe('POST /api/users (público)', () => {
    it('deve criar usuário com sucesso', async () => {
      const res = await api().post('/api/users').send(userFixtures.john).expect(201);
      expect(res.body).toMatchObject({ name: userFixtures.john.name, email: userFixtures.john.email });
      expect(res.body).toHaveProperty('id');
      expect(res.body.password).not.toBe(userFixtures.john.password);
    });

    it('deve retornar 400 quando email já existe', async () => {
      await api().post('/api/users').send(userFixtures.john).expect(201);
      const res = await api()
        .post('/api/users')
        .send({ name: 'outro', email: userFixtures.john.email, password: '123' })
        .expect(400);
      expect(res.body.message).toMatch(/User already exists/i);
    });

    it('deve retornar 400 quando nome já existe', async () => {
      await api().post('/api/users').send(userFixtures.john).expect(201);
      const res = await api()
        .post('/api/users')
        .send({ name: userFixtures.john.name, email: 'outro@email.com', password: '123' })
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/User already exists/i);
    });

    it('deve retornar 400 quando body inválido (ValidationPipe)', async () => {
      await api().post('/api/users').send({}).expect(400);
      await api().post('/api/users').send({ name: 'a' }).expect(400);
      await api().post('/api/users').send({ name: 'a', email: 'not-email', password: '123' }).expect(400);
    });

    it('deve validar email', async () => {
      await api().post('/api/users').send({ name: 'test', email: 'invalid', password: '123' }).expect(400);
    });

    it('deve hashear senha no banco', async () => {
      await api().post('/api/users').send(userFixtures.john).expect(201);
      const repo = app.get(DataSource).getRepository(User);
      const user = await repo
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', { email: userFixtures.john.email })
        .getOne();
      expect(user!.password).not.toBe(userFixtures.john.password);
      expect(await bcrypt.compare(userFixtures.john.password, user!.password)).toBe(true);
    });
  });

  describe('GET /api/users (autenticado)', () => {
    it('deve retornar 401 sem token', async () => {
      await getUsers().expect(401);
    });

    it('deve listar usuários com token válido', async () => {
      await createUser(app, userFixtures.john);
      const tokens = await login(app, userFixtures.john.email, userFixtures.john.password);
      const res = await getUsers(tokens.accessToken).expect(200);
      expect(res.body).toMatchObject({ success: true });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].email).toBe(userFixtures.john.email);
    });

    it('deve listar todos quando há múltiplos', async () => {
      await createUser(app, userFixtures.john);
      const johnTokens = await login(app, userFixtures.john.email, userFixtures.john.password);
      await createUser(app, userFixtures.jane);
      const res = await getUsers(johnTokens.accessToken).expect(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('deve retornar 401 com refresh token', async () => {
      await createUser(app, userFixtures.john);
      const tokens = await login(app, userFixtures.john.email, userFixtures.john.password);
      await getUsers(tokens.refreshToken).expect(401);
    });
  });

  describe('GET /api/users/:id', () => {
    let johnId: number;
    let token: string;

    beforeEach(async () => {
      const user = await createUser(app, userFixtures.john);
      johnId = user.id;
      const t = await login(app, userFixtures.john.email, userFixtures.john.password);
      token = t.accessToken;
    });

    it('deve retornar usuário por id', async () => {
      const res = await getUserById(johnId, token).expect(200);
      expect(res.body.data).toMatchObject({ id: johnId, email: userFixtures.john.email });
    });

    it('deve retornar 404 para id inexistente', async () => {
      await getUserById(9999, token).expect(404);
    });

    it('deve retornar 401 sem token', async () => {
      await getUserById(johnId).expect(401);
    });
  });

  describe('PATCH /api/users/:id (OwnerOrAdminGuard)', () => {
    let john: any;
    let johnTokens: any;
    let janeTokens: any;
    let adminTokens: any;

    beforeEach(async () => {
      const setup = await setupThreeUsers();
      john = setup.john;
      johnTokens = setup.johnTokens;
      janeTokens = setup.janeTokens;
      adminTokens = setup.adminTokens;
    });

    it('deve permitir owner atualizar', async () => {
      const res = await patchUser(john.id, johnTokens.accessToken, { name: 'john-updated' }).expect(200);
      expect(res.body.success).toBe(true);
      const repo = app.get(DataSource).getRepository(User);
      expect((await repo.findOne({ where: { id: john.id } }))!.name).toBe('john-updated');
    });

    it('deve retornar 403 quando non-owner tenta atualizar', async () => {
      await patchUser(john.id, janeTokens.accessToken, { name: 'hacked' }).expect(403);
    });

    it('deve permitir admin atualizar qualquer usuário', async () => {
      const res = await patchUser(john.id, adminTokens.accessToken, { name: 'updated-by-admin' }).expect(200);
      expect(res.body.success).toBe(true);
    });

    it('deve retornar 404 para id inexistente', async () => {
      await patchUser(9999, adminTokens.accessToken, { name: 'x' }).expect(404);
    });

    it('deve retornar 401 sem token', async () => {
      await patchUser(john.id, undefined, { name: 'x' }).expect(401);
    });

    it('deve retornar 403 com mensagem only modify your own', async () => {
      const res = await patchUser(john.id, janeTokens.accessToken, { name: 'try' }).expect(403);
      expect(res.body.message).toMatch(/only modify your own/i);
    });
  });

  describe('DELETE /api/users/:id (OwnerOrAdminGuard)', () => {
    let john: any;
    let jane: any;
    let johnTokens: any;
    let janeTokens: any;
    let adminTokens: any;

    beforeEach(async () => {
      const setup = await setupThreeUsers();
      john = setup.john;
      jane = setup.jane;
      johnTokens = setup.johnTokens;
      janeTokens = setup.janeTokens;
      adminTokens = setup.adminTokens;
    });

    it('deve permitir owner deletar', async () => {
      await deleteUser(john.id, johnTokens.accessToken).expect(200);
      await getUserById(john.id, adminTokens.accessToken).expect(404);
    });

    it('deve retornar 403 quando non-owner tenta deletar', async () => {
      await deleteUser(john.id, janeTokens.accessToken).expect(403);
    });

    it('deve permitir admin deletar qualquer usuário', async () => {
      await deleteUser(jane.id, adminTokens.accessToken).expect(200);
      await getUserById(jane.id, adminTokens.accessToken).expect(404);
    });

    it('deve retornar 404 para id inexistente', async () => {
      await deleteUser(9999, adminTokens.accessToken).expect(404);
    });

    it('deve retornar 401 sem token', async () => {
      await deleteUser(john.id).expect(401);
    });
  });
});
