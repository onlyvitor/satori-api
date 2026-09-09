import { Test, TestingModule } from '@nestjs/testing';
import { GetBookByIdUseCase } from './get-book-by-id.use-case';
import { BOOK_PROVIDER } from '../../domain/ports/book-provider.port';
import { Book } from '../../domain/entities/book.entity';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('GetBookByIdUseCase', () => {
  let useCase: GetBookByIdUseCase;
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
      search: jest.fn(),
      findById: jest.fn().mockResolvedValue(mockBook),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetBookByIdUseCase,
        { provide: BOOK_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    useCase = module.get(GetBookByIdUseCase);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  it('should delegate to provider with correct id', async () => {
    const result = await useCase.execute('abc123');
    expect(mockProvider.findById).toHaveBeenCalledWith('abc123');
    expect(result).toEqual(mockBook);
  });

  it('should propagate provider NotFound', async () => {
    mockProvider.findById.mockRejectedValue(new HttpException('not found', HttpStatus.NOT_FOUND));
    await expect(useCase.execute('invalid')).rejects.toThrow(HttpException);
  });

  it('should throw NOT_FOUND when id is empty', async () => {
    await expect(useCase.execute('')).rejects.toThrow(HttpException);
    try {
      await useCase.execute('');
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('should throw NOT_FOUND when id is null', async () => {
    await expect(useCase.execute(null as any)).rejects.toThrow(HttpException);
  });

  it('should throw NOT_FOUND when id is whitespace only', async () => {
    await expect(useCase.execute('   ')).rejects.toThrow(HttpException);
  });
});
