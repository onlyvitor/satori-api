import { Controller, Get, Param, Query } from '@nestjs/common';
import { BooksService } from '../application/books.service';
import { BooksPaginationDto } from '../presentation/dto/books-pagination.dto';

@Controller('books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Get('search')
  async search(@Query() paginationDto: BooksPaginationDto) {
    const books = await this.booksService.searchBooks(paginationDto.q ?? '', paginationDto);
    // Mapeia entidade de domínio para DTO de apresentação, mantendo compatibilidade
    return books.map((b) => b.toResponseDto());
  }

  @Get(':bookId')
  async findOne(@Param('bookId') bookId: string) {
    const book = await this.booksService.getBookById(bookId);
    return book.toResponseDto();
  }
}
