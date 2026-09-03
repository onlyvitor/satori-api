import request from 'supertest';
import { INestApplication, HttpStatus, HttpException } from '@nestjs/common';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUser, login } from './helpers/auth.helper';
import { userFixtures, mockBook, mockBook2 } from './helpers/fixtures';

describe('Books (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  beforeEach(async () => {
    await cleanDb(ctx.dataSource);
    // reseta mocks para padrão de sucesso
    ctx.mockGoogleBooksService.searchBooks.mockResolvedValue([mockBook, mockBook2]);
    ctx.mockGoogleBooksService.getBookById.mockImplementation((id: string) => {
      if (id === mockBook.id) return Promise.resolve(mockBook);
      if (id === mockBook2.id) return Promise.resolve(mockBook2);
      throw new HttpException(`Livro com ID "${id}" não encontrado`, HttpStatus.NOT_FOUND);
    });

    await createUser(app, userFixtures.john);
    const tokens = await login(app, userFixtures.john.email, userFixtures.john.password);
    accessToken = tokens.accessToken;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  describe('GET /api/books/search', () => {
    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).get('/api/books/search?q=Harry').expect(401);
    });

    it('deve retornar 401 com refresh token', async () => {
      const refresh = (await login(app, userFixtures.john.email, userFixtures.john.password)).refreshToken;
      await request(app.getHttpServer())
        .get('/api/books/search?q=Harry')
        .set('Authorization', `Bearer ${refresh}`)
        .expect(401);
    });

    it('deve buscar livros com query e retornar lista mapeada', async () => {
      ctx.mockGoogleBooksService.searchBooks.mockResolvedValue([mockBook]);

      const res = await request(app.getHttpServer())
        .get('/api/books/search?q=Harry+Potter')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toHaveProperty('id', mockBook.id);
      expect(res.body[0]).toHaveProperty('title', mockBook.title);
      expect(res.body[0]).toHaveProperty('authors', mockBook.authors);
      expect(ctx.mockGoogleBooksService.searchBooks).toHaveBeenCalledWith('Harry Potter');
    });

    it('deve retornar array vazio quando nenhum livro encontrado', async () => {
      ctx.mockGoogleBooksService.searchBooks.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/books/search?q=nonexistent')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('deve lidar com múltiplos livros', async () => {
      ctx.mockGoogleBooksService.searchBooks.mockResolvedValue([mockBook, mockBook2]);

      const res = await request(app.getHttpServer())
        .get('/api/books/search?q=test')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[1].id).toBe(mockBook2.id);
    });

    it('deve repassar erro da GoogleBooksService como BAD_GATEWAY', async () => {
      ctx.mockGoogleBooksService.searchBooks.mockRejectedValue(
        new HttpException('Erro ao buscar livros na Google Books API', HttpStatus.BAD_GATEWAY),
      );

      await request(app.getHttpServer())
        .get('/api/books/search?q=error')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(502);
    });

    it('deve passar query exata para o service', async () => {
      await request(app.getHttpServer())
        .get('/api/books/search?q=C%2B%2B%20Programming')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(ctx.mockGoogleBooksService.searchBooks).toHaveBeenCalledWith('C++ Programming');
    });

    it('deve lidar com query vazia', async () => {
      ctx.mockGoogleBooksService.searchBooks.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get('/api/books/search?q=')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/books/:googleBookId', () => {
    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).get(`/api/books/${mockBook.id}`).expect(401);
    });

    it('deve retornar detalhes do livro por id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/books/${mockBook.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('id', mockBook.id);
      expect(res.body).toHaveProperty('title', mockBook.title);
      expect(ctx.mockGoogleBooksService.getBookById).toHaveBeenCalledWith(mockBook.id);
    });

    it('deve retornar 404 quando livro não encontrado', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/books/invalid-id-123')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.message).toMatch(/não encontrado/i);
    });

    it('deve lidar com diferentes formatos de googleBookId', async () => {
      await request(app.getHttpServer())
        .get('/api/books/zyTCAlFPjgYC')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(ctx.mockGoogleBooksService.getBookById).toHaveBeenCalledWith('zyTCAlFPjgYC');
    });

    it('deve propagar detalhes do livro corretamente (thumbnail, pageCount)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/books/${mockBook.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.thumbnail).toBe(mockBook.thumbnail);
      expect(res.body.pageCount).toBe(mockBook.pageCount);
      expect(res.body.publishedDate).toBe(mockBook.publishedDate);
    });
  });
});
