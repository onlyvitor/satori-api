import { Test, TestingModule } from '@nestjs/testing';
import { BooksService } from './books.service';
import { SearchBooksUseCase } from './use-cases/search-books.use-case';
import { GetBookByIdUseCase } from './use-cases/get-book-by-id.use-case';
import { Book } from '../domain/entities/book.entity';

describe('BooksService (facade)', () => {
  let service: BooksService;
  let searchUseCase: jest.Mocked<SearchBooksUseCase>;
  let getByIdUseCase: jest.Mocked<GetBookByIdUseCase>;

  const mockBook = Book.create({ id: 'abc', title: 'T', authors: ['A'] });

  const mockSearchUseCase = {
    execute: jest.fn().mockResolvedValue([mockBook]),
  };
  const mockGetByIdUseCase = {
    execute: jest.fn().mockResolvedValue(mockBook),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        { provide: SearchBooksUseCase, useValue: mockSearchUseCase },
        { provide: GetBookByIdUseCase, useValue: mockGetByIdUseCase },
      ],
    }).compile();
    service = module.get(BooksService);
    searchUseCase = module.get(SearchBooksUseCase);
    getByIdUseCase = module.get(GetBookByIdUseCase);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should delegate searchBooks to SearchBooksUseCase', async () => {
    const result = await service.searchBooks('Harry', { page: 1, limit: 10 });
    expect(searchUseCase.execute).toHaveBeenCalledWith('Harry', { page: 1, limit: 10 });
    expect(result).toEqual([mockBook]);
  });

  it('should delegate getBookById to GetBookByIdUseCase', async () => {
    const result = await service.getBookById('abc');
    expect(getByIdUseCase.execute).toHaveBeenCalledWith('abc');
    expect(result).toEqual(mockBook);
  });

  it('should delegate search alias to searchBooks', async () => {
    await service.search('query', { page: 2, limit: 5 });
    expect(searchUseCase.execute).toHaveBeenCalledWith('query', { page: 2, limit: 5 });
  });

  it('should delegate findById alias to getBookById', async () => {
    await service.findById('xyz');
    expect(getByIdUseCase.execute).toHaveBeenCalledWith('xyz');
  });

  it('should handle undefined pagination', async () => {
    await service.searchBooks('q');
    expect(searchUseCase.execute).toHaveBeenCalledWith('q', undefined);
  });

  it('should propagate errors from use-cases', async () => {
    mockSearchUseCase.execute.mockRejectedValue(new Error('fail'));
    await expect(service.searchBooks('q')).rejects.toThrow('fail');
    mockGetByIdUseCase.execute.mockRejectedValue(new Error('not found'));
    await expect(service.getBookById('id')).rejects.toThrow('not found');
  });
});
