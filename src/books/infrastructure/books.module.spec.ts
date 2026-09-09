import { Test } from '@nestjs/testing';
import { BooksModule } from './books.module';
import { BooksService } from '../application/books.service';
import { BOOK_PROVIDER } from '../domain/ports/book-provider.port';
import { SearchBooksUseCase } from '../application/use-cases/search-books.use-case';
import { GetBookByIdUseCase } from '../application/use-cases/get-book-by-id.use-case';

describe('BooksModule', () => {
  it('should compile and provide BOOK_PROVIDER and services', async () => {
    const module = await Test.createTestingModule({
      imports: [BooksModule],
    }).compile();

    expect(module.get(BooksService)).toBeDefined();
    expect(module.get(BOOK_PROVIDER)).toBeDefined();
    expect(module.get(SearchBooksUseCase)).toBeDefined();
    expect(module.get(GetBookByIdUseCase)).toBeDefined();
  });
});
