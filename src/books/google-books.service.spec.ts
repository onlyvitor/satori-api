import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { GoogleBooksService } from './google-books.service';

describe('GoogleBooksService', () => {
  let service: GoogleBooksService;
  let httpService: jest.Mocked<HttpService>;

  const mockHttpService = {
    get: jest.fn(),
  };

  // Helper to create mock book item
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
    // Default: no API key
    delete process.env.GOOGLE_BOOKS_API_KEY;
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleBooksService,
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<GoogleBooksService>(GoogleBooksService);
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
    expect(service).toBeDefined();
  });

  describe('searchBooks', () => {
    it('should search books and map response correctly', async () => {
      const mockResponse = {
        data: { items: [mockItem] },
      };
      mockHttpService.get.mockReturnValue(of(mockResponse) as any);

      const result = await service.searchBooks('test query');

      expect(httpService.get).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes', {
        params: { q: 'test query', startIndex: 0, maxResults: 10 },
      });
      expect(result).toEqual([
        {
          id: 'abc123',
          title: 'Test Book',
          authors: ['Author One', 'Author Two'],
          description: 'A great book',
          thumbnail: 'http://example.com/thumb.jpg',
          publishedDate: '2020-01-01',
          pageCount: 250,
        },
      ]);
    });

    it('should return empty array when no items in response', async () => {
      mockHttpService.get.mockReturnValue(of({ data: {} }) as any);

      const result = await service.searchBooks('query');

      expect(result).toEqual([]);
    });

    it('should return empty array when items is undefined', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { items: undefined } }) as any);

      const result = await service.searchBooks('query');

      expect(result).toEqual([]);
    });

    it('should return empty array when items is null', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { items: null } }) as any);

      const result = await service.searchBooks('query');

      expect(result).toEqual([]);
    });

    it('should map multiple books', async () => {
      const secondItem = {
        id: 'def456',
        volumeInfo: {
          title: 'Second Book',
          authors: ['Other Author'],
          description: 'Second desc',
          imageLinks: { thumbnail: 'http://example.com/thumb2.jpg' },
          publishedDate: '2021',
          pageCount: 100,
        },
      };
      mockHttpService.get.mockReturnValue(of({ data: { items: [mockItem, secondItem] } }) as any);

      const result = await service.searchBooks('query');

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('def456');
      expect(result[1].title).toBe('Second Book');
    });

    it('should include API key when env variable is set', async () => {
      process.env.GOOGLE_BOOKS_API_KEY = 'test-api-key';
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } }) as any);

      await service.searchBooks('query');

      expect(httpService.get).toHaveBeenCalledWith(expect.any(String), {
        params: { q: 'query', startIndex: 0, maxResults: 10, key: 'test-api-key' },
      });
    });

    it('should not include key when env not set', async () => {
      delete process.env.GOOGLE_BOOKS_API_KEY;
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } }) as any);

      await service.searchBooks('query');

      expect(httpService.get).toHaveBeenCalledWith(expect.any(String), {
        params: { q: 'query', startIndex: 0, maxResults: 10 },
      });
      expect((httpService.get.mock.calls[0][1] as any).params.key).toBeUndefined();
    });

    it('should fallback without API key when 403 and key present', async () => {
      process.env.GOOGLE_BOOKS_API_KEY = 'blocked-key';
      expect(process.env.GOOGLE_BOOKS_API_KEY).toBe('blocked-key');
      const error403 = { response: { status: 403, data: 'blocked' } };
      const captured: any[] = [];
      mockHttpService.get.mockImplementation((url: string, opts: any) => {
        captured.push(JSON.parse(JSON.stringify(opts)));
        if (captured.length === 1) {
          return throwError(() => error403) as any;
        }
        return of({ data: { items: [mockItem] } }) as any;
      });

      const result = await service.searchBooks('query');

      expect(captured).toHaveLength(2);
      expect(captured[0].params).toEqual({ q: 'query', startIndex: 0, maxResults: 10, key: 'blocked-key' });
      expect(captured[1].params).toEqual({ q: 'query', startIndex: 0, maxResults: 10 });
      expect(result).toHaveLength(1);
    });

    it('should log warn when falling back from 403', async () => {
      process.env.GOOGLE_BOOKS_API_KEY = 'blocked-key';
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const error403 = { response: { status: 403 } };
      mockHttpService.get
        .mockReturnValueOnce(throwError(() => error403) as any)
        .mockReturnValueOnce(of({ data: { items: [] } }) as any);

      await service.searchBooks('query');

      expect(warnSpy).toHaveBeenCalledWith(
        'Google Books API key is blocked or invalid. Falling back to public quota.',
      );
    });

    it('should not fallback when error is not 403', async () => {
      process.env.GOOGLE_BOOKS_API_KEY = 'key';
      const error500 = { response: { status: 500 } };
      mockHttpService.get.mockReturnValue(throwError(() => error500) as any);

      await expect(service.searchBooks('query')).rejects.toThrow(HttpException);
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('should not fallback when no key present even if 403', async () => {
      delete process.env.GOOGLE_BOOKS_API_KEY;
      const error403 = { response: { status: 403 } };
      mockHttpService.get.mockReturnValue(throwError(() => error403) as any);

      await expect(service.searchBooks('query')).rejects.toThrow(HttpException);
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('should throw HttpException BAD_GATEWAY on generic error', async () => {
      const error = { response: { data: 'error' }, message: 'network error' };
      mockHttpService.get.mockReturnValue(throwError(() => error) as any);

      try {
        await service.searchBooks('query');
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
        expect((e as HttpException).message).toBe('Erro ao buscar livros na Google Books API');
      }
    });

    it('should log error details on failure', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = { response: { data: { error: 'fail' } }, message: 'fail' };
      mockHttpService.get.mockReturnValue(throwError(() => error) as any);

      await expect(service.searchBooks('query')).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalled();
    });

    it('should handle error without response.data', async () => {
      const error = { message: 'Network failure' };
      mockHttpService.get.mockReturnValue(throwError(() => error) as any);

      await expect(service.searchBooks('query')).rejects.toThrow(HttpException);
    });

    it('should throw BAD_GATEWAY if fallback also fails', async () => {
      process.env.GOOGLE_BOOKS_API_KEY = 'key';
      const error403 = { response: { status: 403 } };
      const error500 = { response: { status: 500 } };
      mockHttpService.get
        .mockReturnValueOnce(throwError(() => error403) as any)
        .mockReturnValueOnce(throwError(() => error500) as any);

      try {
        await service.searchBooks('query');
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      }
      expect(mockHttpService.get).toHaveBeenCalledTimes(2);
    });

    it('should handle mapping with missing volumeInfo fields (defaults)', async () => {
      const minimalItem = {
        id: 'minimal',
        volumeInfo: {},
      };
      mockHttpService.get.mockReturnValue(of({ data: { items: [minimalItem] } }) as any);

      const result = await service.searchBooks('query');

      expect(result[0]).toEqual({
        id: 'minimal',
        title: 'Título não disponível',
        authors: [],
        description: '',
        thumbnail: '',
        publishedDate: '',
        pageCount: 0,
      });
    });

    it('should handle mapping when volumeInfo is undefined', async () => {
      const itemNoVolumeInfo = {
        id: 'noInfo',
      };
      mockHttpService.get.mockReturnValue(of({ data: { items: [itemNoVolumeInfo] } }) as any);

      const result = await service.searchBooks('query');

      expect(result[0].title).toBe('Título não disponível');
      expect(result[0].authors).toEqual([]);
    });

    it('should handle missing imageLinks', async () => {
      const itemNoImages = {
        id: 'noImg',
        volumeInfo: {
          title: 'No Image Book',
          authors: ['Author'],
          description: 'desc',
          publishedDate: '2020',
          pageCount: 10,
        },
      };
      mockHttpService.get.mockReturnValue(of({ data: { items: [itemNoImages] } }) as any);

      const result = await service.searchBooks('query');

      expect(result[0].thumbnail).toBe('');
    });
  });

  describe('getBookById', () => {
    it('should get book by id and map correctly', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockItem }) as any);

      const result = await service.getBookById('abc123');

      expect(httpService.get).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes/abc123');
      expect(result).toEqual({
        id: 'abc123',
        title: 'Test Book',
        authors: ['Author One', 'Author Two'],
        description: 'A great book',
        thumbnail: 'http://example.com/thumb.jpg',
        publishedDate: '2020-01-01',
        pageCount: 250,
      });
    });

    it('should throw NOT_FOUND when book not found', async () => {
      const error = { response: { status: 404 } };
      mockHttpService.get.mockReturnValue(throwError(() => error) as any);

      try {
        await service.getBookById('invalid');
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect((e as HttpException).message).toBe('Livro com ID "invalid" não encontrado');
      }
    });

    it('should include googleBookId in error message', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('not found')) as any);

      await expect(service.getBookById('xyz789')).rejects.toThrow('Livro com ID "xyz789" não encontrado');
    });

    it('should handle generic error as NOT_FOUND', async () => {
      mockHttpService.get.mockReturnValue(throwError(() => new Error('network')) as any);

      await expect(service.getBookById('abc')).rejects.toThrow(HttpException);
      try {
        await service.getBookById('abc');
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should call correct URL with googleBookId', async () => {
      mockHttpService.get.mockReturnValue(of({ data: mockItem }) as any);

      await service.getBookById('myBookId123');

      expect(httpService.get).toHaveBeenCalledWith('https://www.googleapis.com/books/v1/volumes/myBookId123');
    });

    it('should map defaults when volumeInfo incomplete for getBookById', async () => {
      const minimal = { id: 'min', volumeInfo: {} };
      mockHttpService.get.mockReturnValue(of({ data: minimal }) as any);

      const result = await service.getBookById('min');

      expect(result.title).toBe('Título não disponível');
      expect(result.authors).toEqual([]);
      expect(result.pageCount).toBe(0);
    });
  });
});
