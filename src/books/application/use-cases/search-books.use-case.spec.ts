import { Test, TestingModule } from '@nestjs/testing';
import { SearchBooksUseCase } from './search-books.use-case';
import { BOOK_PROVIDER } from '../../domain/ports/book-provider.port';
import { Book } from '../../domain/entities/book.entity';

describe('SearchBooksUseCase', () => {
  let useCase: SearchBooksUseCase;
  let mockProvider: any;

  const mockBook = Book.create({
    id: 'abc123',
    title: 'Test Book',
    authors: ['Author'],
    description: 'Desc',
    thumbnail: 'thumb',
    publishedDate: '2020',
    pageCount: 200,
    provider: 'google',
  });

  beforeEach(async () => {
    mockProvider = {
      search: jest.fn().mockResolvedValue([mockBook]),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchBooksUseCase,
        { provide: BOOK_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    useCase = module.get(SearchBooksUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should delegate to provider with query and pagination', async () => {
    const result = await useCase.execute('Harry', { page: 1, limit: 10 });
    expect(mockProvider.search).toHaveBeenCalledWith('Harry', { q: 'Harry', page: 1, limit: 10 });
    expect(result).toEqual([mockBook]);
  });

  it('should handle empty query and undefined params', async () => {
    await useCase.execute('', undefined);
    expect(mockProvider.search).toHaveBeenCalledWith('', undefined);
  });

  it('should normalize query when null', async () => {
    await useCase.execute(null as any, { page: 2, limit: 5 });
    expect(mockProvider.search).toHaveBeenCalledWith('', expect.objectContaining({ page: 2, limit: 5 }));
  });

  it('should propagate provider errors', async () => {
    mockProvider.search.mockRejectedValue(new Error('API fail'));
    await expect(useCase.execute('query')).rejects.toThrow('API fail');
  });

  it('should return empty array when provider returns empty', async () => {
    mockProvider.search.mockResolvedValue([]);
    const result = await useCase.execute('nonexistent');
    expect(result).toEqual([]);
  });
});
