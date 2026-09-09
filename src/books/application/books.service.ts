import { Injectable } from '@nestjs/common';
import { SearchBooksUseCase } from './use-cases/search-books.use-case';
import { GetBookByIdUseCase } from './use-cases/get-book-by-id.use-case';
import { Book } from '../domain/entities/book.entity';
import { BookSearchParams } from '../domain/ports/book-provider.port';

/**
 * Fachada de aplicação – ponto único agnóstico para buscar livros.
 * Controller e RatingService devem depender desta fachada,
 * nunca do adapter/GoogleBooksService concreto.
 * Mantém compatibilidade com API antiga (searchBooks/getBookById).
 */
@Injectable()
export class BooksService {
  constructor(
    private readonly searchBooksUseCase: SearchBooksUseCase,
    private readonly getBookByIdUseCase: GetBookByIdUseCase,
  ) {}

  async searchBooks(query: string, params?: BookSearchParams): Promise<Book[]> {
    return this.searchBooksUseCase.execute(query, params);
  }

  async getBookById(id: string): Promise<Book> {
    return this.getBookByIdUseCase.execute(id);
  }

  // Aliases para compatibilidade futura com vocabulário agnóstico
  async search(query: string, params?: BookSearchParams): Promise<Book[]> {
    return this.searchBooks(query, params);
  }

  async findById(id: string): Promise<Book> {
    return this.getBookById(id);
  }
}
