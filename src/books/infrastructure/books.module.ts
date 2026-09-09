import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GoogleBooksService } from './google-books.service';
import { BooksController } from './books.controller';

@Module({
  imports: [HttpModule],
  controllers: [BooksController],
  providers: [GoogleBooksService],
  exports: [GoogleBooksService],
})
export class BooksModule {}
