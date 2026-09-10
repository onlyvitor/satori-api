import request from 'supertest';
import { INestApplication, HttpStatus, HttpException } from '@nestjs/common';
import { createTestApp, closeTestApp, TestAppContext } from './helpers/test-app.helper';
import { cleanDb } from './helpers/db.helper';
import { createUserAndLogin } from './helpers/auth.helper';
import { userFixtures, mockBook, mockBook2 } from './helpers/fixtures';
import { authHeader } from './helpers/api.helper';

describe('Books (e2e)', () => {
  let ctx: TestAppContext;
  let app: INestApplication;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
  });

  beforeEach(async () => {
    await cleanDb(ctx.dataSource);

    // Reseta para estado padrão agnóstico – BooksService é a fonte da verdade.
    // O helper test-app.helper mantém GoogleBooksService sincronizado,
    // mas novos testes devem usar mockBooksService diretamente.
    ctx.mockBooksService.searchBooks.mockResolvedValue([mockBook, mockBook2] as any);
    ctx.mockBooksService.getBookById.mockImplementation((id: string) => {
      if (id === mockBook.id) return Promise.resolve({ ...mockBook } as any);
      if (id === mockBook2.id) return Promise.resolve({ ...mockBook2 } as any);
      throw new HttpException(`Livro com ID "${id}" não encontrado`, HttpStatus.NOT_FOUND);
    });

    const tokens = await createUserAndLogin(app, userFixtures.john);
    accessToken = tokens.accessToken;
    refreshToken = tokens.refreshToken;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  // helpers locais para DRY
  const search = (q: string, token = accessToken, extra = '') =>
    request(app.getHttpServer())
      .get(`/api/books/search?q=${encodeURIComponent(q)}${extra}`)
      .set(authHeader(token));

  const getById = (id: string, token?: string) => {
    const req = request(app.getHttpServer()).get(`/api/books/${id}`);
    if (token) req.set(authHeader(token));
    return req;
  };

  describe('GET /api/books/search', () => {
    it('deve retornar 401 sem token', async () => {
      await request(app.getHttpServer()).get('/api/books/search?q=Harry').expect(401);
    });

    it('deve retornar 401 com refresh token', async () => {
      await search('Harry', refreshToken).expect(401);
    });

    it('deve buscar livros com query e retornar lista mapeada', async () => {
      ctx.mockBooksService.searchBooks.mockResolvedValue([mockBook] as any);

      const res = await search('Harry Potter').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        id: mockBook.id,
        title: mockBook.title,
        authors: mockBook.authors,
      });
      expect(ctx.mockBooksService.searchBooks).toHaveBeenCalledWith(
        'Harry Potter',
        expect.objectContaining({ q: 'Harry Potter' }),
      );
    });

    it('deve retornar array vazio quando nenhum livro encontrado', async () => {
      ctx.mockBooksService.searchBooks.mockResolvedValue([]);

      const res = await search('nonexistent').expect(200);
      expect(res.body).toEqual([]);
    });

    it('deve lidar com múltiplos livros', async () => {
      ctx.mockBooksService.searchBooks.mockResolvedValue([mockBook, mockBook2] as any);

      const res = await search('test').expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[1].id).toBe(mockBook2.id);
    });

    it('deve repassar erro da camada de livros como BAD_GATEWAY', async () => {
      ctx.mockBooksService.searchBooks.mockRejectedValue(
        new HttpException('Erro ao buscar livros na Google Books API', HttpStatus.BAD_GATEWAY),
      );

      await search('error').expect(502);
    });

    it('deve passar query exata para o service (decode)', async () => {
      await search('C++ Programming').expect(200);

      expect(ctx.mockBooksService.searchBooks).toHaveBeenCalledWith(
        'C++ Programming',
        expect.objectContaining({ q: 'C++ Programming' }),
      );
    });

    it('deve lidar com query vazia', async () => {
      ctx.mockBooksService.searchBooks.mockResolvedValue([]);
      const res = await search('').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('deve paginar via page e limit', async () => {
      ctx.mockBooksService.searchBooks.mockResolvedValue([mockBook] as any);

      await request(app.getHttpServer())
        .get('/api/books/search?q=test&page=2&limit=5')
        .set(authHeader(accessToken))
        .expect(200);

      expect(ctx.mockBooksService.searchBooks).toHaveBeenCalledWith(
        'test',
        expect.objectContaining({ page: 2, limit: 5, q: 'test' }),
      );
      const call = ctx.mockBooksService.searchBooks.mock.calls.find((c: any[]) => c[0] === 'test' && c[1].page === 2);
      expect(call).toBeDefined();
    });

    it('deve retornar 400 quando limit excede max', async () => {
      await request(app.getHttpServer())
        .get('/api/books/search?q=test&limit=100')
        .set(authHeader(accessToken))
        .expect(400);
    });
  });

  describe('GET /api/books/:bookId', () => {
    it('deve retornar 401 sem token', async () => {
      await getById(mockBook.id).expect(401);
    });

    it('deve retornar detalhes do livro por id', async () => {
      const res = await getById(mockBook.id, accessToken).expect(200);

      expect(res.body).toMatchObject({ id: mockBook.id, title: mockBook.title });
      expect(ctx.mockBooksService.getBookById).toHaveBeenCalledWith(mockBook.id);
    });

    it('deve retornar 404 quando livro não encontrado', async () => {
      const res = await getById('invalid-id-123', accessToken).expect(404);
      expect(res.body.message).toMatch(/não encontrado/i);
    });

    it('deve lidar com diferentes formatos de bookId', async () => {
      await getById('zyTCAlFPjgYC', accessToken).expect(200);
      expect(ctx.mockBooksService.getBookById).toHaveBeenCalledWith('zyTCAlFPjgYC');
    });

    it('deve propagar detalhes do livro corretamente (thumbnail, pageCount)', async () => {
      const res = await getById(mockBook.id, accessToken).expect(200);
      expect(res.body).toMatchObject({
        thumbnail: mockBook.thumbnail,
        pageCount: mockBook.pageCount,
        publishedDate: mockBook.publishedDate,
      });
    });
  });
});
