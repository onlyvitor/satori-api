import { Controller, Get, Param, Query } from '@nestjs/common';
import { GoogleBooksService } from './google-books.service';
import { BooksPaginationDto } from './dto/books-pagination.dto';

@Controller('books')
export class BooksController {
  constructor(private readonly googleBooksService: GoogleBooksService) {}

  @Get('search')
  search(@Query() paginationDto: BooksPaginationDto) {
    return this.googleBooksService.searchBooks(paginationDto.q ?? '', paginationDto);
  }

  @Get(':googleBookId')
  findOne(@Param('googleBookId') googleBookId: string) {
    return this.googleBooksService.getBookById(googleBookId);
  }
}
