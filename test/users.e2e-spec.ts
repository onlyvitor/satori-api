import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import {
  createTestApp,
  closeTestApp,
  TestAppContext,
} from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUser, login } from './helpers/auth.helper';
import { userFixtures } from './helpers/fixtures';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('Users (e2e)', () => {
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

  describe('POST /api/users (público)', () => {
    it('deve criar usuário com sucesso', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .send(userFixtures.john)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name', userFixtures.john.name);
      expect(res.body).toHaveProperty('email', userFixtures.john.email);
      expect(res.body).not.toHaveProperty(
        'password',
        userFixtures.john.password,
      );
      // password é hasheado
      expect(res.body.password).not.toBe(userFixtures.john.password);
    });

    it('deve retornar 400 quando email já existe', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .send(userFixtures.john)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/users')
        .send({
          name: 'outro',
          email: userFixtures.john.email,
          password: '123',
        })
        .expect(400);

      expect(res.body.message).toMatch(/User already exists/i);
    });

    it('deve retornar 400 quando nome já existe', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .send(userFixtures.john)
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/users')
        .send({
          name: userFixtures.john.name,
          email: 'outro@email.com',
          password: '123',
        })
        .expect(400);

      expect(JSON.stringify(res.body)).toMatch(/User already exists/i);
    });

    it('deve retornar 400 quando body inválido (ValidationPipe)', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .send({})
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/users')
        .send({ name: 'a' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/users')
        .send({ name: 'a', email: 'not-email', password: '123' })
        .expect(400);
    });

    it('deve retornar 400 quando email não é email válido', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .send({ name: 'test', email: 'invalid', password: '123' })
        .expect(400);
    });

    it('deve hashear a senha no banco', async () => {
      await request(app.getHttpServer())
        .post('/api/users')
        .send(userFixtures.john)
        .expect(201);
      const ds = app.get(DataSource);
      const repo = ds.getRepository(User);
      const user = await repo
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', { email: userFixtures.john.email })
        .getOne();
      expect(user).toBeDefined();
      expect(user!.password).not.toBe(userFixtures.john.password);
      const match = await bcrypt.compare(
        userFixtures.john.password,
        user!.password,
      );
      expect(match).toBe(true);
    });
  });

  describe('GET /api/users (autenticado)', () => {
    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).get('/api/users').expect(401);
    });

    it('deve listar usuários com token válido', async () => {
      await createUser(app, userFixtures.john);
      const tokens = await login(
        app,
        userFixtures.john.email,
        userFixtures.john.password,
      );

      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].email).toBe(userFixtures.john.email);
    });

    it('deve retornar lista vazia quando não há usuários além do logado? Na verdade lista todos', async () => {
      const tokensJohn = await login(
        app,
        (await createUser(app, userFixtures.john)).email,
        userFixtures.john.password,
      ).catch(async () => {
        // se createUser via API já criou, login
        return login(app, userFixtures.john.email, userFixtures.john.password);
      });
      // Cria segundo usuário
      await createUser(app, userFixtures.jane);
      const res = await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${tokensJohn.accessToken}`)
        .expect(200);

      expect(res.body.data.length).toBe(2);
    });

    it('deve retornar 401 com refresh token', async () => {
      await createUser(app, userFixtures.john);
      const tokens = await login(
        app,
        userFixtures.john.email,
        userFixtures.john.password,
      );
      await request(app.getHttpServer())
        .get('/api/users')
        .set('Authorization', `Bearer ${tokens.refreshToken}`)
        .expect(401);
    });
  });

  describe('GET /api/users/:id', () => {
    let tokens: { accessToken: string };
    let johnId: number;

    beforeEach(async () => {
      const user = await createUser(app, userFixtures.john);
      johnId = user.id;
      tokens = await login(
        app,
        userFixtures.john.email,
        userFixtures.john.password,
      );
    });

    it('deve retornar usuário por id com token', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/users/${johnId}`)
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('id', johnId);
      expect(res.body.data.email).toBe(userFixtures.john.email);
    });

    it('deve retornar 404 para id inexistente', async () => {
      await request(app.getHttpServer())
        .get('/api/users/9999')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(404);
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .get(`/api/users/${johnId}`)
        .expect(401);
    });
  });

  describe('PATCH /api/users/:id (OwnerOrAdminGuard)', () => {
    let john: any;
    let jane: any;
    let johnTokens: { accessToken: string };
    let janeTokens: { accessToken: string };
    let adminTokens: { accessToken: string };

    beforeEach(async () => {
      john = await createUser(app, userFixtures.john);
      jane = await createUser(app, userFixtures.jane);
      johnTokens = await login(
        app,
        userFixtures.john.email,
        userFixtures.john.password,
      );
      janeTokens = await login(
        app,
        userFixtures.jane.email,
        userFixtures.jane.password,
      );

      // cria admin direto via repo
      const ds = app.get(DataSource);
      const repo = ds.getRepository(User);
      const hashed = await bcrypt.hash(userFixtures.admin.password, 10);
      const admin = repo.create({
        name: userFixtures.admin.name,
        email: userFixtures.admin.email,
        password: hashed,
        isAdmin: true,
      });
      await repo.save(admin);
      adminTokens = await login(
        app,
        userFixtures.admin.email,
        userFixtures.admin.password,
      );
    });

    it('deve permitir owner atualizar próprio recurso', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/users/${john.id}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ name: 'john-updated' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      // verifica no banco
      const ds = app.get(DataSource);
      const repo = ds.getRepository(User);
      const updated = await repo.findOne({ where: { id: john.id } });
      expect(updated!.name).toBe('john-updated');
    });

    it('deve retornar 403 quando non-owner tenta atualizar', async () => {
      await request(app.getHttpServer())
        .patch(`/api/users/${john.id}`)
        .set('Authorization', `Bearer ${janeTokens.accessToken}`)
        .send({ name: 'hacked' })
        .expect(403);
    });

    it('deve permitir admin atualizar qualquer usuário', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/users/${john.id}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({ name: 'updated-by-admin' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('deve retornar 404 para id inexistente (mesmo com admin)', async () => {
      await request(app.getHttpServer())
        .patch('/api/users/9999')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({ name: 'x' })
        .expect(404);
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .patch(`/api/users/${john.id}`)
        .send({ name: 'x' })
        .expect(401);
    });

    it('deve retornar 403 quando tenta atualizar sem ser owner nem admin (mesmo com token válido de outro)', async () => {
      // jane tenta atualizar john
      const res = await request(app.getHttpServer())
        .patch(`/api/users/${john.id}`)
        .set('Authorization', `Bearer ${janeTokens.accessToken}`)
        .send({ name: 'try' })
        .expect(403);

      expect(res.body.message).toMatch(/only modify your own/i);
    });
  });

  describe('DELETE /api/users/:id (OwnerOrAdminGuard)', () => {
    let john: any;
    let jane: any;
    let johnTokens: { accessToken: string };
    let janeTokens: { accessToken: string };
    let adminTokens: { accessToken: string };

    beforeEach(async () => {
      john = await createUser(app, userFixtures.john);
      jane = await createUser(app, userFixtures.jane);
      johnTokens = await login(
        app,
        userFixtures.john.email,
        userFixtures.john.password,
      );
      janeTokens = await login(
        app,
        userFixtures.jane.email,
        userFixtures.jane.password,
      );

      const ds = app.get(DataSource);
      const repo = ds.getRepository(User);
      const hashed = await bcrypt.hash(userFixtures.admin.password, 10);
      await repo.save(
        repo.create({
          name: userFixtures.admin.name,
          email: userFixtures.admin.email,
          password: hashed,
          isAdmin: true,
        }),
      );
      adminTokens = await login(
        app,
        userFixtures.admin.email,
        userFixtures.admin.password,
      );
    });

    it('deve permitir owner deletar próprio recurso', async () => {
      await request(app.getHttpServer())
        .delete(`/api/users/${john.id}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(200);

      // verifica que não existe mais
      await request(app.getHttpServer())
        .get(`/api/users/${john.id}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(404);
    });

    it('deve retornar 403 quando non-owner tenta deletar', async () => {
      await request(app.getHttpServer())
        .delete(`/api/users/${john.id}`)
        .set('Authorization', `Bearer ${janeTokens.accessToken}`)
        .expect(403);
    });

    it('deve permitir admin deletar qualquer usuário', async () => {
      await request(app.getHttpServer())
        .delete(`/api/users/${jane.id}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/users/${jane.id}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(404);
    });

    it('deve retornar 404 para id inexistente', async () => {
      await request(app.getHttpServer())
        .delete('/api/users/9999')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(404);
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer())
        .delete(`/api/users/${john.id}`)
        .expect(401);
    });
  });
});
