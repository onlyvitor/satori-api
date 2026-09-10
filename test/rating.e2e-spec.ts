import request from 'supertest';
import { INestApplication, HttpStatus, HttpException } from '@nestjs/common';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUser, login, createAdminAndLogin } from './helpers/auth.helper';
import { userFixtures, mockBook, mockBook2, buildCreateRatingPayload } from './helpers/fixtures';
import { authHeader, buildRatingDto } from './helpers/api.helper';

describe('Rating (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;

  let john: any;
  let jane: any;
  let johnTokens: { accessToken: string; refreshToken: string };
  let janeTokens: { accessToken: string; refreshToken: string };
  let adminTokens: { accessToken: string; refreshToken: string };

  // helpers DRY
  const mockBookExists = (id: string) => {
    if (id === mockBook.id || id === mockBook2.id) return;
    throw new HttpException(`Livro com ID "${id}" não encontrado`, HttpStatus.NOT_FOUND);
  };

  const givenBooksAvailable = () => {
    ctx.mockBooksService.getBookById.mockImplementation((id: string) => {
      if (id === mockBook.id) return Promise.resolve({ ...mockBook } as any);
      if (id === mockBook2.id) return Promise.resolve({ ...mockBook2 } as any);
      throw new HttpException(`Livro com ID "${id}" não encontrado`, HttpStatus.NOT_FOUND);
    });
    ctx.mockBooksService.searchBooks.mockResolvedValue([mockBook] as any);
  };

  const createRating = (token: string, dto: any = buildRatingDto()) =>
    request(app.getHttpServer()).post('/api/rating').set(authHeader(token)).send(dto);

  const listRatings = (token?: string, query = '') => {
    const req = request(app.getHttpServer()).get(`/api/rating${query}`);
    if (token) req.set(authHeader(token));
    return req;
  };

  const getRating = (id: number, token?: string) => {
    const req = request(app.getHttpServer()).get(`/api/rating/${id}`);
    if (token) req.set(authHeader(token));
    return req;
  };

  const patchRating = (id: number, token: string, body: any) =>
    request(app.getHttpServer()).patch(`/api/rating/${id}`).set(authHeader(token)).send(body);

  const deleteRating = (id: number, token?: string) => {
    const req = request(app.getHttpServer()).delete(`/api/rating/${id}`);
    if (token) req.set(authHeader(token));
    return req;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  beforeEach(async () => {
    await cleanDb(ctx.dataSource);
    givenBooksAvailable();

    john = await createUser(app, userFixtures.john);
    jane = await createUser(app, userFixtures.jane);
    johnTokens = await login(app, userFixtures.john.email, userFixtures.john.password);
    janeTokens = await login(app, userFixtures.jane.email, userFixtures.jane.password);
    adminTokens = await createAdminAndLogin(app, userFixtures.admin);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  describe('POST /api/rating', () => {
    const baseDto = buildRatingDto({ googleBookId: mockBook.id, userId: 9999 });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).post('/api/rating').send(baseDto).expect(401);
    });

    it('deve criar rating e forçar userId do token', async () => {
      const res = await createRating(johnTokens.accessToken, baseDto).expect(201);
      expect(res.body).toMatchObject({
        score: 5,
        comment: baseDto.comment,
        status: 'finished',
        googleBookId: mockBook.id,
        userId: john.id,
      });
      expect(res.body.userId).not.toBe(9999);
    });

    it('deve ignorar userId do body e usar sub do token (jane)', async () => {
      const res = await createRating(janeTokens.accessToken, { ...baseDto, userId: john.id }).expect(201);
      expect(res.body.userId).toBe(jane.id);
    });

    it('deve retornar 404 quando googleBookId inválido', async () => {
      await createRating(johnTokens.accessToken, { ...baseDto, googleBookId: 'invalid-id-xyz' }).expect(404);
    });

    it('deve validar score 1-5', async () => {
      await createRating(johnTokens.accessToken, { ...baseDto, score: 6 }).expect(400);
      await createRating(johnTokens.accessToken, { ...baseDto, score: 0 }).expect(400);
    });

    it('deve retornar 400 quando comment vazio', async () => {
      await createRating(johnTokens.accessToken, { ...baseDto, comment: '' }).expect(400);
    });

    it('deve retornar 400 quando status inválido', async () => {
      await createRating(johnTokens.accessToken, { ...baseDto, status: 'invalid_status' }).expect(400);
    });

    it('deve retornar 400 quando falta googleBookId', async () => {
      const { googleBookId, ...without } = baseDto as any;
      await createRating(johnTokens.accessToken, without).expect(400);
    });

    it('deve criar mesmo sem userId (forçado pelo token)', async () => {
      const { userId, ...without } = baseDto as any;
      const res = await createRating(johnTokens.accessToken, without).expect(201);
      expect(res.body.userId).toBe(john.id);
    });

    it('deve retornar 400 quando envia campo extra (whitelist)', async () => {
      await createRating(johnTokens.accessToken, { ...baseDto, extraField: 'not allowed' }).expect(400);
    });
  });

  describe('GET /api/rating', () => {
    beforeEach(async () => {
      await createRating(johnTokens.accessToken, buildCreateRatingPayload({ googleBookId: mockBook.id })).expect(201);
      await createRating(janeTokens.accessToken, {
        score: 4,
        comment: 'Good',
        status: 'reading',
        googleBookId: mockBook2.id,
        userId: jane.id,
      }).expect(201);
    });

    it('deve retornar 401 sem token', async () => {
      await listRatings().expect(401);
    });

    it('deve listar todos com book enriquecido (paginado)', async () => {
      const res = await listRatings(johnTokens.accessToken).expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toMatchObject({ total: 2, page: 1, limit: 10 });

      const johnRating = res.body.data.find((r: any) => r.userId === john.id);
      expect(johnRating.book).toMatchObject({ id: mockBook.id, title: mockBook.title });
      expect(johnRating).toHaveProperty('user');
    });

    it('deve filtrar por googleBookId', async () => {
      const res = await listRatings(johnTokens.accessToken, `?googleBookId=${mockBook.id}`).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].googleBookId).toBe(mockBook.id);
      expect(res.body.meta.total).toBe(1);
    });

    it('deve retornar vazio quando filtro não encontra', async () => {
      const res = await listRatings(johnTokens.accessToken, '?googleBookId=nonexistent').expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('deve lidar com enriquecimento falhando (book null)', async () => {
      ctx.mockBooksService.getBookById.mockImplementation((id: string) => {
        if (id === mockBook2.id) return Promise.resolve({ ...mockBook2 } as any);
        throw new HttpException('fail', HttpStatus.NOT_FOUND);
      });

      const res = await listRatings(johnTokens.accessToken).expect(200);
      expect(res.body.data.find((r: any) => r.googleBookId === mockBook.id).book).toBeNull();
      expect(res.body.data.find((r: any) => r.googleBookId === mockBook2.id).book).not.toBeNull();
    });

    it('deve paginar com page e limit', async () => {
      const res = await listRatings(johnTokens.accessToken, '?page=1&limit=1').expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ total: 2, page: 1, limit: 1, totalPages: 2, hasNextPage: true });
    });

    it('deve retornar 400 quando limit excede max', async () => {
      await listRatings(johnTokens.accessToken, '?limit=100').expect(400);
    });

    it('deve retornar 400 quando page inválido', async () => {
      await listRatings(johnTokens.accessToken, '?page=0').expect(400);
      await listRatings(johnTokens.accessToken, '?page=-1').expect(400);
    });
  });

  describe('GET /api/rating/:id', () => {
    let ratingId: number;

    beforeEach(async () => {
      const res = await createRating(johnTokens.accessToken, buildCreateRatingPayload()).expect(201);
      ratingId = res.body.id;
    });

    it('deve retornar 401 sem token', async () => {
      await getRating(ratingId).expect(401);
    });

    it('deve retornar rating por id com book', async () => {
      const res = await getRating(ratingId, johnTokens.accessToken).expect(200);
      expect(res.body).toMatchObject({ id: ratingId, book: { id: mockBook.id } });
      expect(res.body).toHaveProperty('user');
    });

    it('deve retornar 404 para id inexistente', async () => {
      await getRating(9999, johnTokens.accessToken).expect(404);
    });

    it('deve retornar book null quando enriquecimento falha', async () => {
      ctx.mockBooksService.getBookById.mockRejectedValue(new HttpException('not found', HttpStatus.NOT_FOUND));
      const res = await getRating(ratingId, johnTokens.accessToken).expect(200);
      expect(res.body.book).toBeNull();
    });
  });

  describe('PATCH /api/rating/:id', () => {
    let ratingId: number;

    beforeEach(async () => {
      const res = await createRating(johnTokens.accessToken, buildCreateRatingPayload()).expect(201);
      ratingId = res.body.id;
    });

    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).patch(`/api/rating/${ratingId}`).send({ score: 4 }).expect(401);
    });

    it('deve permitir owner atualizar', async () => {
      const res = await patchRating(ratingId, johnTokens.accessToken, { score: 4, comment: 'Updated' }).expect(200);
      expect(res.body).toMatchObject({ score: 4, comment: 'Updated' });
    });

    it('deve retornar 403 quando non-owner tenta atualizar', async () => {
      await patchRating(ratingId, janeTokens.accessToken, { score: 1 }).expect(403);
    });

    it('deve permitir admin atualizar qualquer rating', async () => {
      const res = await patchRating(ratingId, adminTokens.accessToken, { score: 2 }).expect(200);
      expect(res.body.score).toBe(2);
    });

    it('deve retornar 404 para id inexistente', async () => {
      await patchRating(9999, adminTokens.accessToken, { score: 1 }).expect(404);
    });

    it('deve validar novo googleBookId', async () => {
      const res = await patchRating(ratingId, johnTokens.accessToken, { googleBookId: mockBook2.id }).expect(200);
      expect(res.body.googleBookId).toBe(mockBook2.id);
    });

    it('deve retornar 404 quando novo googleBookId inválido', async () => {
      await patchRating(ratingId, johnTokens.accessToken, { googleBookId: 'invalid-xyz' }).expect(404);
    });

    it('deve checar ownership antes de validar googleBookId (403 tem prioridade)', async () => {
      await patchRating(ratingId, janeTokens.accessToken, { googleBookId: mockBook2.id }).expect(403);
    });

    it('deve retornar 400 para status inválido', async () => {
      await patchRating(ratingId, johnTokens.accessToken, { status: 'invalid' }).expect(400);
    });

    it('deve retornar 400 para score inválido', async () => {
      await patchRating(ratingId, johnTokens.accessToken, { score: 10 }).expect(400);
    });
  });

  describe('DELETE /api/rating/:id', () => {
    let ratingId: number;

    beforeEach(async () => {
      const res = await createRating(johnTokens.accessToken, {
        score: 5,
        comment: 'To delete',
        status: 'finished',
        googleBookId: mockBook.id,
        userId: john.id,
      }).expect(201);
      ratingId = res.body.id;
    });

    it('deve retornar 401 sem token', async () => {
      await deleteRating(ratingId).expect(401);
    });

    it('deve permitir owner deletar', async () => {
      await deleteRating(ratingId, johnTokens.accessToken).expect(200);
      await getRating(ratingId, johnTokens.accessToken).expect(404);
    });

    it('deve retornar 403 quando non-owner tenta deletar', async () => {
      await deleteRating(ratingId, janeTokens.accessToken).expect(403);
    });

    it('deve permitir admin deletar qualquer rating', async () => {
      await deleteRating(ratingId, adminTokens.accessToken).expect(200);
    });

    it('deve retornar 404 para id inexistente', async () => {
      await deleteRating(9999, adminTokens.accessToken).expect(404);
    });
  });
});
