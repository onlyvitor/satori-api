import { Test, TestingModule } from '@nestjs/testing';
import { BooksController } from '../../books.controller';
import { BooksService } from '../../../application/books.service';
import { Book } from '../../../domain/entities/book.entity';

describe('BooksController', () => {
  let controller: BooksController;
  let service: jest.Mocked<BooksService>;

  const mockBookDto = {
    id: 'abc123',
    title: 'Test Book',
    authors: ['Author'],
    description: 'Desc',
    thumbnail: 'thumb',
    publishedDate: '2020',
    pageCount: 200,
  };

  const mockBook = Book.create({ ...mockBookDto, provider: 'google' });

  const mockBooksService = {
    searchBooks: jest.fn(),
    getBookById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BooksController],
      providers: [{ provide: BooksService, useValue: mockBooksService }],
    }).compile();

    controller = module.get<BooksController>(BooksController);
    service = module.get(BooksService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('search', () => {
    it('should call booksService.searchBooks with query', async () => {
      mockBooksService.searchBooks.mockResolvedValue([mockBook] as any);

      const result = await controller.search({ q: 'test query' } as any);

      expect(service.searchBooks).toHaveBeenCalledWith('test query', { q: 'test query' });
      expect(service.searchBooks).toHaveBeenCalledTimes(1);
      expect(result).toEqual([mockBookDto]);
    });

    it('should return empty array when no books found', async () => {
      mockBooksService.searchBooks.mockResolvedValue([]);

      const result = await controller.search({ q: 'nonexistent' } as any);

      expect(result).toEqual([]);
      expect(service.searchBooks).toHaveBeenCalledWith('nonexistent', { q: 'nonexistent' });
    });

    it('should handle multiple books', async () => {
      const secondBook = Book.create({ id: 'def456', title: 'Second', authors: ['Author'], description: 'Desc', thumbnail: 'thumb', publishedDate: '2020', pageCount: 200 });
      mockBooksService.searchBooks.mockResolvedValue([mockBook, secondBook] as any);

      const result = await controller.search({ q: 'query' } as any);

      expect(result).toHaveLength(2);
      expect(result[1].id).toBe('def456');
    });

    it('should propagate errors from service', async () => {
      const error = new Error('API error');
      mockBooksService.searchBooks.mockRejectedValue(error);

      await expect(controller.search({ q: 'query' } as any)).rejects.toThrow(error);
    });

    it('should pass exact query string', async () => {
      mockBooksService.searchBooks.mockResolvedValue([] as any);

      await controller.search({ q: 'Harry Potter' } as any);

      expect(service.searchBooks).toHaveBeenCalledWith('Harry Potter', { q: 'Harry Potter' });
    });

    it('should handle empty query', async () => {
      mockBooksService.searchBooks.mockResolvedValue([] as any);

      await controller.search({ q: '' } as any);

      expect(service.searchBooks).toHaveBeenCalledWith('', { q: '' });
    });

    it('should handle query with special characters', async () => {
      mockBooksService.searchBooks.mockResolvedValue([] as any);

      await controller.search({ q: 'C++ Programming' } as any);

      expect(service.searchBooks).toHaveBeenCalledWith('C++ Programming', { q: 'C++ Programming' });
    });

    it('should pass pagination to service', async () => {
      mockBooksService.searchBooks.mockResolvedValue([] as any);
      const pagination: any = { q: 'query', page: 2, limit: 5 };

      await controller.search(pagination);

      expect(service.searchBooks).toHaveBeenCalledWith('query', pagination);
    });
  });

  describe('findOne', () => {
    it('should call booksService.getBookById with bookId', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);

      const result = await controller.findOne('abc123');

      expect(service.getBookById).toHaveBeenCalledWith('abc123');
      expect(service.getBookById).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockBookDto);
    });

    it('should return book details correctly', async () => {
      const detailedBook = Book.create({ ...mockBookDto, description: 'Detailed description', pageCount: 500 });
      mockBooksService.getBookById.mockResolvedValue(detailedBook as any);

      const result = await controller.findOne('abc123');

      expect(result.description).toBe('Detailed description');
      expect(result.pageCount).toBe(500);
    });

    it('should propagate NotFound error from service', async () => {
      const error = new Error('Livro com ID "invalid" não encontrado');
      mockBooksService.getBookById.mockRejectedValue(error);

      await expect(controller.findOne('invalid')).rejects.toThrow(error);
      expect(service.getBookById).toHaveBeenCalledWith('invalid');
    });

    it('should handle different bookId formats', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);

      await controller.findOne('zyTCAlFPjgYC');

      expect(service.getBookById).toHaveBeenCalledWith('zyTCAlFPjgYC');
    });

    it('should handle numeric-like id', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);

      await controller.findOne('12345');

      expect(service.getBookById).toHaveBeenCalledWith('12345');
    });

    it('should handle object param with bookId', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      const result = await controller.findOne({ bookId: 'abc123' } as any);
      expect(service.getBookById).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(mockBookDto);
    });

    it('should handle object param with googleBookId alias', async () => {
      mockBooksService.getBookById.mockResolvedValue(mockBook as any);
      const result = await controller.findOne({ googleBookId: 'legacy123' } as any);
      expect(service.getBookById).toHaveBeenCalledWith('legacy123');
      expect(result).toEqual(mockBookDto);
    });

    it('should handle undefined q with fallback to empty string', async () => {
      mockBooksService.searchBooks.mockResolvedValue([] as any);
      await controller.search({ page: 1, limit: 10 } as any);
      expect(service.searchBooks).toHaveBeenCalledWith('', { page: 1, limit: 10 });
    });
  });
});
