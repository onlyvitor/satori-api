import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Book } from '../../domain/entities/book.entity';
import { BookProvider, BookSearchParams } from '../../domain/ports/book-provider.port';
import { GoogleBooksMapper } from '../mappers/google-books.mapper';
import { PAGINATION_CONSTANTS } from 'src/common/constants/pagination.constants';

@Injectable()
export class GoogleBooksAdapter implements BookProvider {
  private readonly baseUrl = 'https://www.googleapis.com/books/v1/volumes';

  constructor(private readonly httpService: HttpService) {}

  async search(query: string, params?: BookSearchParams): Promise<Book[]> {
    let page: number = PAGINATION_CONSTANTS.DEFAULT_PAGE;
    let limit: number = PAGINATION_CONSTANTS.BOOKS.DEFAULT_LIMIT;

    if (params && typeof params === 'object') {
      page = params.page ?? page;
      limit = params.limit ?? limit;
    }

    // Compatibilidade: se params vier como string vazia (legado), tratar
    if (typeof params === 'string') {
      page = PAGINATION_CONSTANTS.DEFAULT_PAGE;
      limit = PAGINATION_CONSTANTS.BOOKS.DEFAULT_LIMIT;
    }

    const startIndex = (page - 1) * limit;
    const maxResults = Math.min(limit, PAGINATION_CONSTANTS.BOOKS.GOOGLE_MAX);

    try {
      const apiParams: any = {
        q: query,
        startIndex,
        maxResults,
      };

      if (process.env.GOOGLE_BOOKS_API_KEY) {
        apiParams.key = process.env.GOOGLE_BOOKS_API_KEY;
      }

      let response;
      try {
        response = await firstValueFrom(
          this.httpService.get(this.baseUrl, { params: apiParams }),
        );
      } catch (error: any) {
        if (error.response?.status === 403 && apiParams.key) {
          console.warn('Google Books API key is blocked or invalid. Falling back to public quota.');
          delete apiParams.key;
          response = await firstValueFrom(
            this.httpService.get(this.baseUrl, { params: apiParams }),
          );
        } else {
          throw error;
        }
      }

      if (!response.data.items) {
        return [];
      }

      return GoogleBooksMapper.toDomainList(response.data.items);
    } catch (error: any) {
      console.error('Google Books API Error details:', error.response?.data || error.message);
      throw new HttpException(
        'Erro ao buscar livros na Google Books API',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async findById(id: string): Promise<Book> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/${id}`),
      );
      return GoogleBooksMapper.toDomain(response.data);
    } catch (error) {
      throw new HttpException(
        `Livro com ID "${id}" não encontrado`,
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
