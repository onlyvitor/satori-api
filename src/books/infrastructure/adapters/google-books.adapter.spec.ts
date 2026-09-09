import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { GoogleBooksAdapter } from './google-books.adapter';
import { Book } from '../../domain/entities/book.entity';

describe('GoogleBooksAdapter', () => {
  let adapter: GoogleBooksAdapter;
  let httpService: jest.Mocked<HttpService>;

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockItem = {
    id: 'abc123',
    volumeInfo: {
      title: 'Test Book',
      authors: ['Author One', 'Author Two'],
      description: 'A great book',
      imageLinks: { thumbnail: 'http://example.com/thumb.jpg' },
      publishedDate: '2020-01-01',
      pageCount: 250,
    },
  };

  const originalEnv = process.env.GOOGLE_BOOKS_API_KEY;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.GOOGLE_BOOKS_API_KEY;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleBooksAdapter,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    adapter = module.get<GoogleBooksAdapter>(GoogleBooksAdapter);
    httpService = module.get(HttpService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.GOOGLE_BOOKS_API_KEY;
    } else {
      process.env.GOOGLE_BOOKS_API_KEY = originalEnv;
    }
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('search', () => {
    it('should search books and map to Book entities', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { items: [mockItem] } }) as any);

      const result = await adapter.search('test query');

      expect(httpService.get).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes', {
        params: { q: 'test query', startIndex: 0, maxResults: 10 },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(Book);
      expect(result[0].id).toBe('abc123');
      expect(result[0].title).toBe('Test Book');
      expect(result[0].authors).toEqual(['Author One', 'Author Two']);
      expect(result[0].provider).toBe('google');
      expect(result[0].toResponseDto()).toEqual({
        id: 'abc123',
        title: 'Test Book',
        authors: ['Author One', 'Author Two'],
        description: 'A great book',
        thumbnail: 'http://example.com/thumb.jpg',
        publishedDate: '2020-01-01',
        pageCount: 250,
      });
    });

    it('should return empty array when no items', async () => {
      mockHttpService.get.mockReturnValue(of({ data: {} }) as any);
      expect(await adapter.search('query')).toEqual([]);
    });

    it('should handle pagination params', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } }) as any);
      await adapter.search('query', { page: 2, limit: 5 });
      expect(httpService.get).toHaveBeenCalledWith(expect.any(String), {
        params: { q: 'query', startIndex: 5, maxResults: 5 },
      });
    });

    it('should cap maxResults at GOOGLE_MAX (40)', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } }) as any);
      await adapter.search('query', { page: 1, limit: 50 } as any);
      expect((httpService.get.mock.calls[0][1] as any).params.maxResults).toBe(40);
    });

    it('should include API key when set', async () => {
      process.env.GOOGLE_BOOKS_API_KEY = 'test-key';
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } }) as any);
      await adapter.search('query');
      expect(httpService.get).toHaveBeenCalledWith(expect.any(String), {
        params: { q: 'query', startIndex: 0, maxResults: 10, key: 'test-key' },
      });
    });

    it('should fallback without key on 403', async () => {
      process.env.GOOGLE_BOOKS_API_KEY = 'blocked';
      const err403 = { response: { status: 403 } };
      mockHttpService.get
        .mockReturnValueOnce(throwError(() => err403) as any)
        .mockReturnValueOnce(of({ data: { items: [mockItem] } }) as any);

      const result = await adapter.search('query');
      expect(mockHttpService.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });

    it('should throw BAD_GATEWAY on generic error', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => ({ message: 'fail' })) as any);
      await expect(adapter.search('query')).rejects.toThrow(HttpException);
      try {
        await adapter.search('query');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      }
    });

    it('should map defaults when volumeInfo missing', async () => {
      const minimal = { id: 'minimal', volumeInfo: {} };
      mockHttpService.get.mockReturnValue(of({ data: { items: [minimal] } }) as any);
      const result = await adapter.search('query');
      expect(result[0].title).toBe('Título não disponível');
      expect(result[0].authors).toEqual([]);
      expect(result[0].pageCount).toBe(0);
    });

    it('should handle legacy string pagination param', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } }) as any);
      const result = await adapter.search('query', '' as any);
      expect(result).toEqual([]);
      expect(httpService.get).toHaveBeenCalledWith(expect.any(String), {
        params: { q: 'query', startIndex: 0, maxResults: 10 },
      });
    });

    it('should handle string with API key still fallback correctly', async () => {
      process.env.GOOGLE_BOOKS_API_KEY = 'key';
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } }) as any);
      await adapter.search('query', 'legacy' as any);
      expect(httpService.get).toHaveBeenCalledWith(expect.any(String), {
        params: { q: 'query', startIndex: 0, maxResults: 10, key: 'key' },
      });
    });
  });

  describe('findById', () => {
    it('should get book by id and map correctly', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockItem }) as any);
      const result = await adapter.findById('abc123');
      expect(httpService.get).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes/abc123');
      expect(result).toBeInstanceOf(Book);
      expect(result.id).toBe('abc123');
      expect(result.provider).toBe('google');
    });

    it('should throw NOT_FOUND when book not found', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => ({ response: { status: 404 } })) as any);
      await expect(adapter.findById('invalid')).rejects.toThrow(HttpException);
      try {
        await adapter.findById('invalid');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should include id in error message', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('not found')) as any);
      await expect(adapter.findById('xyz789')).rejects.toThrow('Livro com ID "xyz789" não encontrado');
    });

    it('should map defaults when volumeInfo incomplete', async () => {
      const minimal = { id: 'min', volumeInfo: {} };
      mockHttpService.get.mockReturnValue(of({ data: minimal }) as any);
      const result = await adapter.findById('min');
      expect(result.title).toBe('Título não disponível');
      expect(result.authors).toEqual([]);
    });
  });
});
