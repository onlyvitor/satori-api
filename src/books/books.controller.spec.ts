import { Test, TestingModule } from '@nestjs/testing';
import { BooksController } from './books.controller';
import { GoogleBooksService } from './google-books.service';

describe('BooksController', () => {
  let controller: BooksController;
  let service: jest.Mocked<GoogleBooksService>;

  const mockBook = {
    id: 'abc123',
    title: 'Test Book',
    authors: ['Author'],
    description: 'Desc',
    thumbnail: 'thumb',
    publishedDate: '2020',
    pageCount: 200,
  };

  const mockGoogleBooksService = {
    searchBooks: jest.fn(),
    getBookById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BooksController],
      providers: [{ provide: GoogleBooksService, useValue: mockGoogleBooksService }],
    }).compile();

    controller = module.get<BooksController>(BooksController);
    service = module.get(GoogleBooksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('search', () => {
    it('should call googleBooksService.searchBooks with query', async () => {
      mockGoogleBooksService.searchBooks.mockResolvedValue([mockBook] as any);

      const result = await controller.search({ q: 'test query' } as any);

      expect(service.searchBooks).toHaveBeenCalledWith('test query', { q: 'test query' });
      expect(service.searchBooks).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockBook]);
    });

    it('should return empty array when no books found', async () => {
      mockGoogleBooksService.searchBooks.mockResolvedValue([]);

      const result = await controller.search({ q: 'nonexistent' } as any);

      expect(result).toEqual([]);
      expect(service.searchBooks).toHaveBeenCalledWith('nonexistent', { q: 'nonexistent' });
    });

    it('should handle multiple books', async () => {
      const books = [mockBook, { ...mockBook, id: 'def456', title: 'Second' }];
      mockGoogleBooksService.searchBooks.mockResolvedValue(books as any);

      const result = await controller.search({ q: 'query' } as any);

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('def456');
    });

    it('should propagate errors from service', async () => {
      const error = new Error('API error');
      mockGoogleBooksService.searchBooks.mockRejectedValue(error);

      await expect(controller.search({ q: 'query' } as any)).rejects.toThrow(error);
    });

    it('should pass exact query string', async () => {
      mockGoogleBooksService.searchBooks.mockResolvedValue([] as any);

      await controller.search({ q: 'Harry Potter' } as any);

      expect(service.searchBooks).toHaveBeenCalledWith('Harry Potter', { q: 'Harry Potter' });
    });

    it('should handle empty query', async () => {
      mockGoogleBooksService.searchBooks.mockResolvedValue([] as any);

      await controller.search({ q: '' } as any);

      expect(service.searchBooks).toHaveBeenCalledWith('', { q: '' });
    });

    it('should handle query with special characters', async () => {
      mockGoogleBooksService.searchBooks.mockResolvedValue([] as any);

      await controller.search({ q: 'C++ Programming' } as any);

      expect(service.searchBooks).toHaveBeenCalledWith('C++ Programming', { q: 'C++ Programming' });
    });

    it('should pass pagination to service', async () => {
      mockGoogleBooksService.searchBooks.mockResolvedValue([] as any);
      const pagination: any = { q: 'query', page: 2, limit: 5 };

      await controller.search(pagination);

      expect(service.searchBooks).toHaveBeenCalledWith('query', pagination);
    });
  });

  describe('findOne', () => {
    it('should call googleBooksService.getBookById with googleBookId', async () => {
      mockGoogleBooksService.getBookById.mockResolvedValue(mockBook as any);

      const result = await controller.findOne('abc123');

      expect(service.getBookById).toHaveBeenCalledWith('abc123');
      expect(service.getBookById).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockBook);
    });

    it('should return book details correctly', async () => {
      const detailedBook = {
        ...mockBook,
        description: 'Detailed description',
        pageCount: 500,
      };
      mockGoogleBooksService.getBookById.mockResolvedValue(detailedBook as any);

      const result = await controller.findOne('abc123');

      expect(result.description).toBe('Detailed description');
      expect(result.pageCount).toBe(500);
    });

    it('should propagate NotFound error from service', async () => {
      const error = new Error('Livro com ID "invalid" não encontrado');
      mockGoogleBooksService.getBookById.mockRejectedValue(error);

      await expect(controller.findOne('invalid')).rejects.toThrow(error);
      expect(service.getBookById).toHaveBeenCalledWith('invalid');
    });

    it('should handle different googleBookId formats', async () => {
      mockGoogleBooksService.getBookById.mockResolvedValue(mockBook as any);

      await controller.findOne('zyTCAlFPjgYC');

      expect(service.getBookById).toHaveBeenCalledWith('zyTCAlFPjgYC');
    });

    it('should handle numeric-like id', async () => {
      mockGoogleBooksService.getBookById.mockResolvedValue(mockBook as any);

      await controller.findOne('12345');

      expect(service.getBookById).toHaveBeenCalledWith('12345');
    });
  });
});
