import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GoogleBooksService } from './google-books.service';
import { GoogleBooksAdapter } from './adapters/google-books.adapter';
import { BooksController } from './books.controller';
import { BOOK_PROVIDER } from '../domain/ports/book-provider.port';
import { SearchBooksUseCase } from '../application/use-cases/search-books.use-case';
import { GetBookByIdUseCase } from '../application/use-cases/get-book-by-id.use-case';
import { BooksService } from '../application/books.service';

@Module({
  imports: [HttpModule],
  controllers: [BooksController],
  providers: [
    SearchBooksUseCase,
    GetBookByIdUseCase,
    BooksService,
    GoogleBooksAdapter,
    {
      provide: BOOK_PROVIDER,
      useClass: GoogleBooksAdapter,
    },
    // Mantido para compatibilidade retroativa com RatingService legado
    GoogleBooksService,
  ],
  exports: [BooksService, BOOK_PROVIDER, SearchBooksUseCase, GetBookByIdUseCase, GoogleBooksService],
})
export class BooksModule {}
