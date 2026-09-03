import request from 'supertest';
import { INestApplication, HttpStatus, HttpException } from '@nestjs/common';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUser, login } from './helpers/auth.helper';
import { userFixtures, mockBook, mockBook2 } from './helpers/fixtures';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('Rating (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

  let john: any;
  let jane: any;
  let admin: any;
  let johnTokens: { accessToken: string; refreshToken: string };
  let janeTokens: { accessToken: string; refreshToken: string };
  let adminTokens: { accessToken: string; refreshToken: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  beforeEach(async () => {
    await cleanDb(ctx.dataSource);
    // mocks padrão
    ctx.mockGoogleBooksService.getBookById.mockImplementation((id: string) => {
      if (id === mockBook.id) return Promise.resolve(mockBook);
      if (id === mockBook2.id) return Promise.resolve(mockBook2);
      throw new HttpException(`Livro com ID "${id}" não encontrado`, HttpStatus.NOT_FOUND);
    });
    ctx.mockGoogleBooksService.searchBooks.mockResolvedValue([mockBook]);

    john = await createUser(app, userFixtures.john);
    jane = await createUser(app, userFixtures.jane);
    johnTokens = await login(app, userFixtures.john.email, userFixtures.john.password);
    janeTokens = await login(app, userFixtures.jane.email, userFixtures.jane.password);

    const ds = app.get(DataSource);
    const repo = ds.getRepository(User);
    const hashed = await bcrypt.hash(userFixtures.admin.password, 10);
    admin = await repo.save(
      repo.create({
        name: userFixtures.admin.name,
        email: userFixtures.admin.email,
        password: hashed,
        isAdmin: true,
      }),
    );
    adminTokens = await login(app, userFixtures.admin.email, userFixtures.admin.password);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  describe('POST /api/rating', () => {
    const baseDto = {
      score: 5,
      comment: 'A timeless classic.',
      status: 'finished',
      googleBookId: mockBook.id,
      userId: 9999, // deve ser ignorado e forçado para o sub do token
    };

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).post('/api/rating').send(baseDto).expect(401);
    });

    it('deve criar rating com sucesso e forçar userId do token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send(baseDto)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('score', 5);
      expect(res.body).toHaveProperty('comment', baseDto.comment);
      expect(res.body).toHaveProperty('status', 'finished');
      expect(res.body).toHaveProperty('googleBookId', mockBook.id);
      expect(res.body).toHaveProperty('userId', john.id);
      expect(res.body.userId).not.toBe(9999);
    });

    it('deve ignorar userId do body e usar sub do token (jane)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${janeTokens.accessToken}`)
        .send({ ...baseDto, userId: john.id })
        .expect(201);

      expect(res.body.userId).toBe(jane.id);
    });

    it('deve retornar 404 quando googleBookId inválido (validação GoogleBooks)', async () => {
      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ ...baseDto, googleBookId: 'invalid-id-xyz' })
        .expect(404);
    });

    it('deve retornar 400 quando score fora do intervalo 1-5', async () => {
      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ ...baseDto, score: 6 })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ ...baseDto, score: 0 })
        .expect(400);
    });

    it('deve retornar 400 quando comment vazio', async () => {
      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ ...baseDto, comment: '' })
        .expect(400);
    });

    it('deve retornar 400 quando status inválido', async () => {
      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ ...baseDto, status: 'invalid_status' })
        .expect(400);
    });

    it('deve retornar 400 quando falta googleBookId', async () => {
      const { googleBookId, ...withoutBookId } = baseDto as any;
      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send(withoutBookId)
        .expect(400);
    });

    it('deve retornar 400 quando falta userId (DTO exige)', async () => {
      const { userId, ...withoutUserId } = baseDto as any;
      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send(withoutUserId)
        .expect(400);
    });

    it('deve retornar 400 quando envia campo extra não permitido (whitelist)', async () => {
      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ ...baseDto, extraField: 'not allowed' })
        .expect(400);
    });
  });

  describe('GET /api/rating', () => {
    beforeEach(async () => {
      // cria 2 ratings: john com mockBook, jane com mockBook2
      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({
          score: 5,
          comment: 'Great',
          status: 'finished',
          googleBookId: mockBook.id,
          userId: john.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${janeTokens.accessToken}`)
        .send({
          score: 4,
          comment: 'Good',
          status: 'reading',
          googleBookId: mockBook2.id,
          userId: jane.id,
        })
        .expect(201);
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).get('/api/rating').expect(401);
    });

    it('deve listar todos ratings com book enriquecido', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      // verifica enriquecimento
      const johnRating = res.body.find((r: any) => r.userId === john.id);
      expect(johnRating).toHaveProperty('book');
      expect(johnRating.book).toHaveProperty('id', mockBook.id);
      expect(johnRating.book.title).toBe(mockBook.title);
      expect(johnRating).toHaveProperty('user');
    });

    it('deve filtrar por googleBookId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/rating?googleBookId=${mockBook.id}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].googleBookId).toBe(mockBook.id);
    });

    it('deve retornar array vazio quando filtro não encontra nada', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/rating?googleBookId=nonexistent')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('deve lidar com enriquecimento falhando (book null) quando getBookById falha', async () => {
      // cria rating com mockBook, depois faz getBookById falhar para esse id
      ctx.mockGoogleBooksService.getBookById.mockImplementation((id: string) => {
        if (id === mockBook2.id) return Promise.resolve(mockBook2);
        throw new HttpException('fail', HttpStatus.NOT_FOUND);
      });

      const res = await request(app.getHttpServer())
        .get('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(200);

      const johnRating = res.body.find((r: any) => r.googleBookId === mockBook.id);
      expect(johnRating.book).toBeNull();
      const janeRating = res.body.find((r: any) => r.googleBookId === mockBook2.id);
      expect(janeRating.book).not.toBeNull();
    });
  });

  describe('GET /api/rating/:id', () => {
    let ratingId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({
          score: 5,
          comment: 'Great',
          status: 'finished',
          googleBookId: mockBook.id,
          userId: john.id,
        })
        .expect(201);
      ratingId = res.body.id;
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).get(`/api/rating/${ratingId}`).expect(401);
    });

    it('deve retornar rating por id com book enriquecido', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', ratingId);
      expect(res.body).toHaveProperty('book');
      expect(res.body.book.id).toBe(mockBook.id);
      expect(res.body).toHaveProperty('user');
    });

    it('deve retornar 404 para id inexistente', async () => {
      await request(app.getHttpServer())
        .get('/api/rating/9999')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(404);
    });

    it('deve retornar book null quando enriquecimento falha', async () => {
      ctx.mockGoogleBooksService.getBookById.mockRejectedValue(
        new HttpException('not found', HttpStatus.NOT_FOUND),
      );

      const res = await request(app.getHttpServer())
        .get(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(200);

      expect(res.body.book).toBeNull();
    });
  });

  describe('PATCH /api/rating/:id', () => {
    let ratingId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({
          score: 5,
          comment: 'Great',
          status: 'finished',
          googleBookId: mockBook.id,
          userId: john.id,
        })
        .expect(201);
      ratingId = res.body.id;
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).patch(`/api/rating/${ratingId}`).send({ score: 4 }).expect(401);
    });

    it('deve permitir owner atualizar', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ score: 4, comment: 'Updated' })
        .expect(200);

      expect(res.body.score).toBe(4);
      expect(res.body.comment).toBe('Updated');
    });

    it('deve retornar 403 quando non-owner tenta atualizar', async () => {
      await request(app.getHttpServer())
        .patch(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${janeTokens.accessToken}`)
        .send({ score: 1 })
        .expect(403);
    });

    it('deve permitir admin atualizar qualquer rating', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({ score: 2 })
        .expect(200);

      expect(res.body.score).toBe(2);
    });

    it('deve retornar 404 para id inexistente', async () => {
      await request(app.getHttpServer())
        .patch('/api/rating/9999')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({ score: 1 })
        .expect(404);
    });

    it('deve validar novo googleBookId quando fornecido', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ googleBookId: mockBook2.id })
        .expect(200);

      expect(res.body.googleBookId).toBe(mockBook2.id);
    });

    it('deve retornar 404 quando novo googleBookId inválido', async () => {
      await request(app.getHttpServer())
        .patch(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ googleBookId: 'invalid-xyz' })
        .expect(404);
    });

    it('deve checar ownership antes de validar googleBookId (403 tem prioridade)', async () => {
      // jane tenta atualizar rating de john com novo googleBookId válido
      // deve falhar 403 mesmo que googleBookId seja válido, e não chamar getBookById?
      // No service, checkOwnership vem antes da validação, então 403.
      // Mock ainda válido, mas deve retornar 403.
      await request(app.getHttpServer())
        .patch(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${janeTokens.accessToken}`)
        .send({ googleBookId: mockBook2.id })
        .expect(403);
    });

    it('deve retornar 400 para status inválido', async () => {
      await request(app.getHttpServer())
        .patch(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ status: 'invalid' })
        .expect(400);
    });

    it('deve retornar 400 para score inválido', async () => {
      await request(app.getHttpServer())
        .patch(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({ score: 10 })
        .expect(400);
    });
  });

  describe('DELETE /api/rating/:id', () => {
    let ratingId: number;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/rating')
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .send({
          score: 5,
          comment: 'To delete',
          status: 'finished',
          googleBookId: mockBook.id,
          userId: john.id,
        })
        .expect(201);
      ratingId = res.body.id;
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).delete(`/api/rating/${ratingId}`).expect(401);
    });

    it('deve permitir owner deletar', async () => {
      await request(app.getHttpServer())
        .delete(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${johnTokens.accessToken}`)
        .expect(404);
    });

    it('deve retornar 403 quando non-owner tenta deletar', async () => {
      await request(app.getHttpServer())
        .delete(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${janeTokens.accessToken}`)
        .expect(403);
    });

    it('deve permitir admin deletar qualquer rating', async () => {
      await request(app.getHttpServer())
        .delete(`/api/rating/${ratingId}`)
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);
    });

    it('deve retornar 404 para id inexistente', async () => {
      await request(app.getHttpServer())
        .delete('/api/rating/9999')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(404);
    });
  });
});
