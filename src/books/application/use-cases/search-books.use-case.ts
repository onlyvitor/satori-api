import { Injectable, Inject } from '@nestjs/common';
import { BOOK_PROVIDER } from '../../domain/ports/book-provider.port';
import type { BookProvider, BookSearchParams } from '../../domain/ports/book-provider.port';
import { Book } from '../../domain/entities/book.entity';

@Injectable()
export class SearchBooksUseCase {
  constructor(
    @Inject(BOOK_PROVIDER) private readonly bookProvider: BookProvider,
  ) {}

  async execute(query: string, params?: BookSearchParams): Promise<Book[]> {
    // Normalização agnóstica: garante que query seja string e params tenha defaults
    const normalizedQuery = query ?? '';
    const normalizedParams: BookSearchParams | undefined = params
      ? {
          q: (params as any).q ?? normalizedQuery,
          page: params.page,
          limit: params.limit,
        }
      : undefined;

    // Delega ao provider (GoogleBooksAdapter ou futuro OpenLibrary)
    // Se params for undefined, adapter usa defaults internos
    return this.bookProvider.search(normalizedQuery, normalizedParams);
  }
}
