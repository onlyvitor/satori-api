import { Injectable, Inject } from '@nestjs/common';
import { BOOK_PROVIDER } from '../../domain/ports/book-provider.port';
import type { BookProvider } from '../../domain/ports/book-provider.port';
import { Book } from '../../domain/entities/book.entity';

@Injectable()
export class GetBookByIdUseCase {
  constructor(
    @Inject(BOOK_PROVIDER) private readonly bookProvider: BookProvider,
  ) {}

  async execute(id: string): Promise<Book> {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      // Mantém compatibilidade com comportamento anterior que lançava NOT_FOUND
      const { HttpException, HttpStatus } = require('@nestjs/common');
      throw new HttpException(`Livro com ID "${id}" não encontrado`, HttpStatus.NOT_FOUND);
    }
    return this.bookProvider.findById(id);
  }
}
